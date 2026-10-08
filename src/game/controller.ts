import { Group, Plane, Raycaster, Vector2, Vector3, type Camera, type Scene } from 'three/webgpu';
import { BATTERY_MAX } from '../config/balance';
import type { EngineEvent, MissionState, MissionSummary, Unit } from '../engine/types';
import { loadModel, preloadModels } from '../render/assets';
import { CELL, type Board } from '../render/board';
import type { HullFootprint, Hulls } from '../render/hulls';
import { createBoardLabels } from '../render/labels';
import type { IslandShore } from '../render/ocean';
import { viewInset, type CameraControls } from '../render/camera';
import { createWordSign } from '../render/word-sign';
import { footprint, ride, wetness, type Floater } from '../scene/buoyancy';
import { SUB } from '../scene/diorama';
import { addScenery } from '../scene/scenery';
import { createFleet } from './fleet';
import { tune } from '../config/tunables';
import type { MissionConfig } from '../engine/types';
import { isPaused, setPaused } from '../render/clock';
import { configFor, LEVELS, levelById, starsFor } from '../config/campaign';
import { shipModels } from '../config/ships';
import { createGame, DEFAULT_MISSION, restoreGame, type Game } from './game';
import { createHud, type MenuAction } from './hud';
import { createTorpedo } from '../render/torpedo';
import { installKeyboard, type Intents } from './input';
import { LOOK } from '../config/look';
import {
  bowOf, departSeconds, departShot, hash01, introSeconds, introShot, pickDrone, planKill, revealHeading, titleHeading,
  titleSeconds, titleShot, type DepartParams, type IntroParams, type KillParams, type KillPlan, type SubPose, type TitleParams,
} from './shots';
import { currentLevel, isUnlocked, loadProgress, record, writeProgress } from './progress';
import { clearSave, loadSave, writeSave } from './save';

const PING_TO_REVEAL = 0.45;
const TORPEDO_RUN = 0.6;
const END_CARD_DELAY = 2.6;
const SUB_TURN_RATE = 0.7; // radians per second
const smooth = (x: number) => x * x * (3 - 2 * x);

type Scheduled = { at: number; run: () => void };

/**
 * Where the game is: the title sequence, the main menu, leaving for a
 * mission, the mission-start shot, or playing. Only `play` takes game input.
 */
type Phase = 'title' | 'menu' | 'depart' | 'start' | 'play';

/**
 * Runs a mission on the scene: turns keyboard input into engine actions and
 * engine results into board marks, ships, the target billboard, effects and
 * the HUD. Effects play out in scene time, so the board changes when the
 * ping or the torpedo arrives, not the instant a key is pressed.
 */
/** What the controller needs from the rest of the scene when the board changes size. */
export type SceneEnv = { setShadowExtent: (boardSize: number) => void; setIslands: (list: IslandShore[]) => void };

export async function createController(scene: Scene, board: Board, hulls: Hulls, view: CameraControls, env: SceneEnv) {
  const root = new Group();
  root.name = 'game';
  scene.add(root);

  const scenery = await addScenery(root);
  const labels = createBoardLabels(board.size);
  root.add(labels.group);
  const fleet = createFleet(root, board);
  const hud = createHud();

  // Load everything a mission can show, and keep one of each in the scene,
  // out of sight below the sea, until the shaders are compiled (see warmUp).
  await preloadModels([...shipModels(), 'submarine']);
  const warm = new Group();
  warm.position.y = -40;
  for (const m of shipModels()) warm.add(await loadModel(m));
  root.add(warm);

  // The player's submarine, holding station on its tile.
  const sub = await loadModel('submarine');
  sub.scale.setScalar(SUB.scale);
  root.add(sub);
  const subFloat: Floater = {
    obj: sub, x: 0, z: 0, yaw: 0.6,
    hull: { halfLength: SUB.halfLength * SUB.scale, halfBeam: SUB.halfBeam * SUB.scale },
  };
  let subHeading = 0.6;
  /** The stern wash while the sub turns (a wake speed, cells per second). */
  let turnWash = 0;
  const subHalf = SUB.halfLength * SUB.scale;
  const subPose = (): SubPose => ({ x: subFloat.x, z: subFloat.z, yaw: subFloat.yaw, half: subHalf });
  /** The sub's height animation: settling from one depth to another (0 is afloat). */
  let subMove = { from: 0, to: 0, at: -99, seconds: 1 };
  const subLift = (t: number) => subMove.from + (subMove.to - subMove.from) * smooth(Math.min(1, Math.max(0, (t - subMove.at) / subMove.seconds)));
  /** Take the sub to `depth` (0 afloat, negative below) over `seconds`, from wherever it is now. */
  const moveSub = (depth: number, seconds = 0) => { subMove = { from: subLift(now), to: depth, at: now, seconds: Math.max(0.001, seconds) }; };

  const torpedo = createTorpedo();
  root.add(torpedo.group);
  let torpPath = { from: { x: 0, z: 0 }, to: { x: 0, z: 0 } };

  let game: Game;
  let sign: ReturnType<typeof createWordSign> | null = null;
  let signUnit: string | null = null;
  let discovered: string[] = [];
  let queue: Scheduled[] = [];
  let now = 0;
  let pingStart = -99;
  let torpStart = -99;
  let torpRun = TORPEDO_RUN;
  let phase: Phase = 'play';
  /** Cinematic steps (title, departure, mission start), on scene time; a skip or a new sequence clears them. */
  let cues: Scheduled[] = [];
  const cue = (delay: number, run: () => void) => cues.push({ at: now + delay, run });
  /** The camera-shot settings, read from the tuner each time a shot starts. */
  const shotParams = <T extends object>(prefix: string, defaults: T) =>
    Object.fromEntries(Object.keys(defaults).map((k) => [k, tune.get<number>(`${prefix}.${k}`)])) as T;
  const introParams = () => shotParams('shot.intro', LOOK.shots.intro) as IntroParams;
  const killParams = () => shotParams('shot.kill', LOOK.shots.kill) as KillParams;
  const titleParams = () => shotParams('shot.title', LOOK.shots.title) as TitleParams;
  const departParams = () => shotParams('shot.depart', LOOK.shots.depart) as DepartParams;
  let ended = false;
  let lastCamera: Camera | null = null;
  const ray = new Raycaster();
  const water = new Plane(new Vector3(0, 1, 0), 0);
  const hit = new Vector3();

  /** A tap on the canvas: if it lands on a discovered enemy ship, aim at it. */
  function tap(clientX: number, clientY: number) {
    if (phase === 'title' || phase === 'start') return skip();
    if (phase !== 'play' || !lastCamera || ended || isPaused() || hud.isMenuOpen()) return;
    ray.setFromCamera(new Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1), lastCamera);
    if (!ray.ray.intersectPlane(water, hit)) return;
    const id = fleet.pick(hit.x, hit.z);
    if (id) intents.selectTarget(id);
  }

  const later = (delay: number, run: () => void) => queue.push({ at: now + delay, run });

  let progress = loadProgress();

  /** A campaign level's settings, or (level 0) the quick game's from the tuner's Gameplay knobs. */
  function missionConfig(levelId = 0): MissionConfig {
    const level = levelById(levelId);
    if (level) return configFor(level);
    return {
      ...DEFAULT_MISSION,
      gridSize: tune.get('game.gridSize'),
      unitCount: tune.get('game.unitCount'),
      torpedoBudget: tune.get('game.torpedoBudget'),
      batteryRegenSeconds: tune.get('game.batteryRegen'),
      allowDiagonal: tune.get<boolean>('game.diagonal'),
    };
  }

  function persist() {
    // The title's backdrop board is scenery, not a mission: it never overwrites a saved one.
    if (phase !== 'play' && phase !== 'start') return;
    if (ended) clearSave();
    else writeSave(game.save());
  }

  let boardSize = 0;
  /** Rebuild everything that depends on the board's size: cells, labels, scenery, shadows, camera. */
  function resizeBoard(n: number) {
    if (n === boardSize) return;
    const first = boardSize === 0;
    boardSize = n;
    board.setSize(n);
    labels.setSize(n);
    scenery.layout(n);
    env.setShadowExtent(n);
    env.setIslands(scenery.islands);
    view.setBoardSize(n, first);
  }

  /** Begin a mission: a fresh one from a seed, or a restored one already in progress. Level 0 is the quick game. */
  function start(seed: number, restored?: Game, levelId = 0) {
    game?.dispose();
    game = restored ?? createGame(missionConfig(levelId), seed);
    seed = game.seed;
    resizeBoard(game.state.grid.size);
    fleet.clear();
    board.clear();
    discovered = [];
    queue = [];
    ended = game.state.outcome !== 'in_progress';
    setSign(null);
    hud.menu(null);
    setPaused(false);
    const s = game.state.grid.subCoord;
    const p = board.cellCenter(s.x, s.y);
    subFloat.x = p.x;
    subFloat.z = p.z;
    board.uniforms.sonarCenter.value.set(p.x, p.z);
    board.uniforms.sonarRadius.value = 1.6;
    moveSub(0);
    torpStart = -99;
    view.focusOn(null);
    if (phase !== 'title') hud.note(restored ? `MISSION RESTORED · SEED ${seed}` : `MISSION START · SEED ${seed}`);
    // A restored mission's ships are already on the water, not rising.
    syncBoard(restored ? now - 10 : now);
    syncHud();
    persist();
  }

  // ---- Engine → scene ------------------------------------------------------

  function tileRevealed(st: MissionState, u: Unit, i: number) {
    const c = u.coords[i];
    return st.grid.tiles[c.y][c.x].revealed || u.revealedLetters.has(i);
  }

  /** 1 = confirmed by a torpedo hit, 0.5 = radar hint (must still be typed), 0 = unknown. */
  function letterState(st: MissionState, u: Unit, i: number) {
    if (u.destroyed || u.revealedLetters.has(i)) return 1;
    if (tune.get<boolean>('cheat.showWords') && u.id === st.activeUnitId) return 0.5;
    return tileRevealed(st, u, i) ? 0.5 : 0;
  }

  function syncBoard(spawnAt = now) {
    const st = game.state;
    const target = game.unit(st.activeUnitId);
    const targetCells = new Set(target?.coords.map((c) => `${c.x},${c.y}`));
    for (let y = 0; y < st.grid.size; y++) {
      for (let x = 0; x < st.grid.size; x++) {
        const tile = st.grid.tiles[y][x];
        const isTarget = targetCells.has(`${x},${y}`);
        if (!tile.revealed) {
          board.setCell(x, y, CELL.hidden, '', isTarget);
          continue;
        }
        const unit = game.unit(tile.unitId);
        if (!unit) board.setCell(x, y, CELL.miss);
        else board.setCell(x, y, unit.destroyed ? CELL.sunk : CELL.hit, tile.letter, isTarget);
      }
    }
    // Ships appear once, the first time any of their tiles is found. A sunk
    // wreck leaves the fleet but stays in `discovered`, so it never resurfaces.
    for (const u of st.units) {
      if (discovered.includes(u.id)) continue;
      if (u.coords.some((_, i) => tileRevealed(st, u, i))) {
        discovered.push(u.id);
        // Ships sunk before a restore stay sunk.
        if (!u.destroyed || spawnAt === now) void fleet.spawn(u, spawnAt);
      } else if (tune.get<boolean>('cheat.showShips') && !u.destroyed) {
        void fleet.spawn(u, spawnAt);
      }
    }
    syncSign();
    // The camera pans to the ship being targeted and orbits around it.
    const active = game.unit(st.activeUnitId);
    view.focusOn(active && !active.destroyed ? unitMid(active) : null);
  }

  /** The middle of a ship's tiles, on the water. */
  function unitMid(u: Unit) {
    const a = board.cellCenter(u.coords[0].x, u.coords[0].y);
    const b = board.cellCenter(u.coords[u.length - 1].x, u.coords[u.length - 1].y);
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Camera shots are on unless the tuner, `?cine=0` or the system's reduced-motion setting turns them off. */
  const cinematics = () =>
    tune.get<boolean>('camera.cinematics') && !reducedMotion && new URLSearchParams(location.search).get('cine') !== '0';

  function setSign(unit: Unit | null) {
    if (sign) root.remove(sign.group);
    sign = null;
    signUnit = unit?.id ?? null;
    if (!unit) return;
    sign = createWordSign(unit.word);
    // Float above the mast: ships are scaled to their word length.
    const first = board.cellCenter(unit.coords[0].x, unit.coords[0].y);
    const last = board.cellCenter(unit.coords[unit.length - 1].x, unit.coords[unit.length - 1].y);
    const shipScale = (first.distanceTo(last) + 0.95) / 4.2;
    sign.place(unit.coords.map((c) => board.cellCenter(c.x, c.y)), 0.5 + shipScale * 0.8);
    root.add(sign.group);
  }

  function syncSign() {
    const st = game.state;
    const target = game.unit(st.activeUnitId);
    if ((target?.id ?? null) !== signUnit) setSign(target && !target.destroyed ? target : null);
    if (sign && target) sign.setRevealed(target.coords.map((_, i) => letterState(st, target, i)));
  }

  function syncHud() {
    const st = game.state;
    const target = game.unit(st.activeUnitId);
    const tried = new Map<string, boolean>();
    if (target) for (const l of target.triedLetters) tried.set(l, target.word.includes(l));
    hud.render({
      title: st.config.id ? `MISSION ${String(st.config.id).padStart(2, '0')}` : 'QUICK GAME',
      name: levelById(st.config.id)?.name ?? 'Sink all enemy units',
      seed: game.seed,
      battery: Math.floor(st.battery),
      batteryMax: BATTERY_MAX,
      torpedoes: st.torpedoes,
      torpedoMax: st.config.torpedoBudget,
      score: st.score,
      mode: st.mode,
      target: target ? [...target.word].map((ch, i) => ({ ch, state: letterState(st, target, i) })) : null,
      tried,
    });
  }

  function report(events: EngineEvent[]) {
    // The torpedo that sinks a ship gets a cinematic: the camera swings in behind the sub first,
    // the torpedo then runs slowly, and everything it triggers waits for the impact.
    const killed = events.find((e) => e.type === 'unit:destroyed') as Extract<EngineEvent, { type: 'unit:destroyed' }> | undefined;
    const kp = killParams();
    const plan = killed && cinematics() ? planKillFor(killed.unitId, kp) : null;
    const cine = !!plan;
    const lead = plan?.lead ?? 0;
    const run = plan?.run ?? TORPEDO_RUN;
    const arrive = lead + run;
    for (const e of events) {
      switch (e.type) {
        case 'radar:fired':
          hud.note(`SONAR PING · ${e.letter}`);
          pingStart = now;
          hud.ping();
          break;
        case 'radar:resolved':
          // New contacts go on the water now, hidden until the ping's ring sweeps over them.
          for (const id of e.unitsDiscovered) {
            const u = game.unit(id);
            if (!u || discovered.includes(id)) continue;
            discovered.push(id);
            void fleet.spawn(u, pingStart, { from: { x: subFloat.x, z: subFloat.z }, speed: board.uniforms.pingSpeed.value });
          }
          later(PING_TO_REVEAL, () => {
            hud.note(e.unitsDiscovered.length ? `CONTACT DETECTED · ${e.unitsDiscovered.length}` : e.tilesRevealed.length ? `${e.tilesRevealed.length} RETURNS · NO CONTACT` : 'NO RETURNS');
            syncBoard();
            syncHud();
            if (e.unitsDiscovered.includes(game.state.activeUnitId ?? '')) faceTarget();
          });
          break;
        case 'radar:denied':
          hud.note(e.reason === 'battery_empty' ? 'BATTERY EMPTY · RECHARGING' : 'MISSION OVER');
          break;
        case 'torpedo:fired':
          hud.note(`TORPEDO AWAY · ${e.letter}`);
          launchTorpedo(e.targetUnitId, lead, run);
          if (plan) view.play(plan.shot);
          break;
        case 'torpedo:denied':
          hud.note(e.reason === 'already_tried' ? 'LETTER ALREADY TRIED' : e.reason === 'torpedoes_empty' ? 'OUT OF TORPEDOES' : 'MISSION OVER');
          break;
        case 'torpedo:resolved':
          later(arrive, () => {
            hud.note(e.missed ? 'MISS' : `DIRECT HIT · ${e.hits.length}`);
            const at = e.hits[0] ? board.cellCenter(e.hits[0].x, e.hits[0].y) : fleet.mid(e.targetUnitId);
            if (at) {
              board.uniforms.blastCenter.value.set(at.x, at.z);
              board.uniforms.blastAge.value = 0.35;
            }
            if (!e.missed) fleet.jolt(e.targetUnitId, now);
            syncBoard();
            syncHud();
          });
          break;
        case 'unit:destroyed':
          later(arrive, () => {
            void fleet.kill(e.unitId, now);
            const st = game.state;
            const sunk = st.units.filter((u) => u.destroyed).length;
            hud.banner('ENEMY UNIT DESTROYED!', `${sunk} OF ${st.units.length} SUNK`);
            hud.note('ENEMY UNIT DESTROYED');
          });
          break;
        case 'mission:ended':
          ended = true;
          clearSave();
          later(arrive + (cine ? kp.cardDelay : END_CARD_DELAY), () => endCard(e.summary));
          break;
        default:
          break;
      }
    }
    syncHud();
    persist();
  }

  /** Fire the torpedo from the sub's bow: it leaves after `lead` seconds and takes `run` to arrive. */
  function launchTorpedo(unitId: string, lead = 0, run = TORPEDO_RUN) {
    const to = fleet.mid(unitId);
    if (to) fireAt(to, lead, run);
  }

  function fireAt(to: { x: number; z: number }, lead: number, run: number) {
    const from = bowOf(subPose());
    torpPath = { from, to: { x: to.x, z: to.z } };
    board.uniforms.torpFrom.value.set(from.x, from.z);
    board.uniforms.torpTo.value.set(to.x, to.z);
    torpStart = now + lead;
    torpRun = run;
  }

  /** The kill shot for a ship: the drone shot about one kill in five when the ship is far enough off, else the close one. */
  function planKillFor(unitId: string, kp: KillParams, force?: 'kill' | 'drone'): KillPlan | null {
    const u = game.unit(unitId);
    if (!u) return null;
    const ship = unitMid(u);
    const bow = bowOf(subPose());
    const roll = hash01(game.seed, game.state.units.indexOf(u) + 1);
    const drone = force ? force === 'drone' : pickDrone(Math.hypot(ship.x - bow.x, ship.z - bow.z), roll, kp);
    return planKill(subPose(), ship, u.length, drone, kp);
  }

  /** A newly found target: turn to read its word broadside, with the sun behind the camera when that's not the long way round. */
  function faceTarget() {
    if (!cinematics() || !tune.get<boolean>('shot.reveal.turn') || view.playing) return;
    const u = game.unit(game.state.activeUnitId);
    if (!u || u.destroyed) return;
    const a = board.cellCenter(u.coords[0].x, u.coords[0].y);
    const b = board.cellCenter(u.coords[u.length - 1].x, u.coords[u.length - 1].y);
    const az = revealHeading(view.pose().az, { x: b.x - a.x, z: b.z - a.z }, tune.get('sun.azimuth'), tune.get('shot.reveal.maxTurn'));
    view.turnTo(az, tune.get('shot.reveal.rate'));
  }

  // ---- Cinematics: title, main menu, departure, mission start -----------------

  /** The phone keyboard's docked height; the camera keeps clear of it only while playing. */
  let dockPx = 0;
  const applyInset = () => {
    const px = phase === 'play' ? dockPx : 0;
    if (viewInset.bottom === px) return;
    viewInset.bottom = px;
    view.refit();
  };

  /** Hand the game to the player. */
  function beginPlay() {
    cues = [];
    phase = 'play';
    hud.cine(false);
    view.lock(false);
    applyInset();
  }

  /** Enter a cinematic phase: the HUD steps aside and the camera is the shot's. */
  function enterCinema(next: Phase) {
    cues = [];
    phase = next;
    hud.cine(true);
    view.lock(true);
    applyInset();
  }

  /**
   * First load: from the loading screen's dark, high over the sea and down to
   * the sub as it surfaces, then the main menu. The board behind it is the
   * current level's, without ships; it is never saved.
   */
  function title() {
    enterCinema('title');
    hud.menu(null);
    start(randomSeed(), undefined, currentLevel(progress));
    const tp = titleParams();
    subHeading = subFloat.yaw = titleHeading(tune.get('sun.azimuth'), tp);
    view.play(titleShot(subPose(), view.lens(), tp));
    const menuAt = titleSeconds(tp) + tp.menuDelay;
    if (!cinematics()) {
      view.seek(menuAt + 2);
      titleMenu();
      return;
    }
    moveSub(-introParams().depth);
    cue(tp.surfaceAt, () => moveSub(0, introParams().surface));
    cue(menuAt, titleMenu);
  }

  /** The main menu, top right over the title view. */
  function titleMenu() {
    cues = [];
    phase = 'menu';
    moveSub(0, Math.max(0.001, -subLift(now) * 1.5));
    const saved = loadSave();
    const actions: MenuAction[] = [];
    if (saved) {
      actions.push({
        label: 'Continue', key: 'Enter', sub: `${levelTitle(saved.config.id ?? 0)} · in progress`,
        run: () => launch(() => start(saved.seed, restoreGame(saved))),
      });
    }
    actions.push({ label: 'New mission', key: saved ? 'N' : 'Enter', run: newMission });
    hud.menu({ variant: 'title', title: 'Word War', actions });
  }

  /** The first mission straight away while it's the only one open, else the mission list. */
  function newMission() {
    const open = LEVELS.filter((l) => isUnlocked(progress, l.id));
    if (open.length <= 1) launch(() => start(randomSeed(), undefined, open[0]?.id ?? LEVELS[0].id));
    else missions(titleMenu);
  }

  /**
   * Leave for a mission: the letterbox closes, the menu fades, the camera
   * pulls back as the sub dives, and the picture fades to black; `begin`
   * then sets up the mission and its opening shot plays.
   */
  function launch(begin: () => void) {
    setPaused(false);
    if (!cinematics()) {
      hud.menu(null);
      phase = 'start';
      begin();
      beginPlay();
      return;
    }
    if (hud.isMenuOpen()) hud.fadeMenu(1);
    enterCinema('depart');
    const dp = departParams();
    view.play(departShot(view.pose(), dp));
    moveSub(-introParams().depth, dp.sink);
    cue(departSeconds(dp) + 0.15, () => {
      phase = 'start';
      begin();
      missionStart();
    });
  }

  /** Mission start: in from high above the sub as it rises, then round to the default framing, and play. */
  function missionStart() {
    if (!cinematics()) return beginPlay();
    enterCinema('start');
    const p = introParams();
    moveSub(-p.depth);
    moveSub(0, p.surface);
    view.play(introShot({ x: subFloat.x, z: subFloat.z }, view.home(), p), view.home());
    const end = introSeconds(p);
    cue(end - p.barsOut * 0.7, () => hud.cine(false));
    cue(end, beginPlay);
  }

  /** A key or tap during the title or the mission start skips ahead. */
  function skip() {
    if (phase === 'title') {
      const tp = titleParams();
      view.seek(titleSeconds(tp) + tp.menuDelay);
      titleMenu();
    } else if (phase === 'start') {
      moveSub(0, 0.6);
      view.stop();
      beginPlay();
    }
  }
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if ((e.target as HTMLElement | null)?.closest?.('.tp-dfwv, input, textarea')) return;
    if (phase === 'title' || phase === 'start') {
      // The key only skips: it mustn't also reach the game (Space would pause it).
      e.preventDefault();
      e.stopImmediatePropagation();
      skip();
    }
  });

  // The tuner's "Play" buttons: run a sequence or shot on the spot, whatever the game is doing.
  window.addEventListener('ww:shot', (ev) => {
    const which = (ev as CustomEvent<string>).detail;
    if (which === 'title') title();
    else if (which === 'depart') launch(() => start(game.seed, undefined, game.state.config.id));
    else if (which === 'intro') missionStart();
    else if (which === 'kill' || which === 'drone') {
      const p = killParams();
      // Aim at the targeted or any live ship, else at an empty spot ahead of the sub.
      const ship = game.unit(game.state.activeUnitId) ?? game.state.units.find((u) => !u.destroyed && discovered.includes(u.id));
      if (ship) {
        const plan = planKillFor(ship.id, p, which)!;
        fireAt(unitMid(ship), plan.lead, plan.run);
        view.play(plan.shot);
      } else {
        const at = bowOf({ ...subPose(), half: subHalf + 7 });
        const plan = planKill(subPose(), at, 4, which === 'drone', p);
        fireAt(at, plan.lead, plan.run);
        view.play(plan.shot);
      }
    }
  });

  // ---- Pause and menus ----------------------------------------------------

  const randomSeed = () => Math.floor(Math.random() * 1e6) + 1;
  const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);
  const levelTitle = (id: number) => (id ? `Mission ${String(id).padStart(2, '0')}` : 'Quick game');
  /** Leave for a campaign level on a fresh board. */
  const startLevel = (id: number) => launch(() => start(randomSeed(), undefined, id));

  function pause(reason = 'Paused') {
    if (phase !== 'play' || ended || isPaused()) return;
    setPaused(true);
    persist();
    pauseMenu(reason);
  }

  function pauseMenu(reason = 'Paused') {
    const id = game.state.config.id;
    hud.menu({
      title: reason.toUpperCase(),
      subtitle: `${levelTitle(id)}${levelById(id) ? ` · ${levelById(id)!.name}` : ''} · seed ${game.seed}`,
      actions: [
        { label: 'Continue', key: 'Space / Esc', run: resume },
        { label: 'Restart mission', key: 'R', run: () => launch(() => start(game.seed, undefined, id)) },
        { label: 'Missions', key: 'M', run: () => missions(() => pauseMenu(reason)) },
      ],
    });
  }

  /** The level grid. `back` returns to wherever it was opened from. */
  function missions(back: () => void) {
    const total = LEVELS.reduce((n, l) => n + (progress.levels[l.id]?.stars ?? 0), 0);
    const here = currentLevel(progress);
    hud.menu({
      title: 'MISSIONS',
      subtitle: `${total} of ${LEVELS.length * 3} stars`,
      columns: 2,
      solid: true,
      primary: here - 1,
      actions: [
        ...LEVELS.map((l) => {
          const rec = progress.levels[l.id];
          return {
            label: `${l.id}. ${l.name}`,
            sub: `${l.gridSize}×${l.gridSize} · ${l.unitCount} ships · ${l.torpedoBudget} torpedoes`,
            key: String(l.id),
            badge: rec ? stars(rec.stars) : undefined,
            locked: !isUnlocked(progress, l.id),
            run: () => startLevel(l.id),
          };
        }),
        { label: 'Quick game', sub: 'Random board, tuner settings', key: 'Q', run: () => launch(() => start(randomSeed())) },
        { label: 'Back', key: 'Esc', run: back },
      ],
    });
  }

  function endCard(s: MissionSummary) {
    const id = game.state.config.id;
    const level = levelById(id);
    const win = s.outcome === 'success';
    const secs = s.elapsedMs / 1000;
    let earned = 0;
    let unlocked = '';
    // A restored mission from before the ladder existed has a level's id but not its settings.
    if (level && game.state.config.torpedoBudget === level.torpedoBudget && game.state.config.unitCount === level.unitCount) {
      earned = starsFor(level, s);
      const next = levelById(id + 1);
      if (win && next && !isUnlocked(progress, next.id)) unlocked = `Mission ${next.id} unlocked`;
      progress = record(progress, id, earned, s.score);
      writeProgress(progress);
    }
    const next = levelById(id + 1);
    const again = () => launch(() => start(randomSeed(), undefined, id));
    const actions: MenuAction[] = [];
    if (win && next) actions.push({ label: 'Next mission', key: 'Enter', run: () => startLevel(next.id) });
    actions.push({ label: win ? 'Play again' : 'Try again', key: win && next ? 'R' : 'Enter', run: again });
    actions.push({ label: 'Missions', key: 'M', run: () => missions(() => endCard(s)) });
    hud.menu({
      title: win ? 'MISSION COMPLETE' : 'MISSION FAILED',
      subtitle: win ? (unlocked || (level && !next ? 'All missions complete' : 'All enemy units sunk')) : 'Out of torpedoes',
      tone: win ? 'win' : 'lose',
      stats: [
        ...(level ? [['Stars', stars(earned)] as [string, string]] : []),
        ['Score', String(s.score)],
        ['Units sunk', `${s.unitsDestroyed} of ${s.unitsTotal}`],
        ['Torpedoes used', level ? `${s.shotsFiredTorpedo} of ${level.torpedoBudget}` : String(s.shotsFiredTorpedo)],
        ['Time', `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`],
      ],
      actions,
    });
  }

  function resume() {
    hud.menu(null);
    setPaused(false);
  }

  hud.watchDock((px) => { dockPx = px; viewInset.bottom = -1; applyInset(); });
  hud.onPause(() => pause());
  hud.onCamera({ zoomIn: view.zoomIn, zoomOut: view.zoomOut, rotate: () => view.rotate(1) });
  // Leaving the tab or app pauses the game; progress is already saved.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  window.addEventListener('pagehide', persist);
  // The tuner's "Restart mission" applies Gameplay knobs.
  window.addEventListener('ww:restart', () => launch(() => start(game.seed, undefined, game.state.config.id)));
  tune.onAny(['cheat.showShips', 'cheat.showWords'], () => { syncBoard(); syncHud(); });

  // ---- Input ---------------------------------------------------------------

  const refresh = () => { syncBoard(); syncHud(); persist(); };
  const intents: Intents = {
    letter: (letter) => report(game.state.mode === 'TORPEDO' ? game.torpedo(letter) : game.radar(letter)),
    nextTarget: () => {
      if (game.state.mode !== 'TORPEDO') return;
      game.nextTarget();
      refresh();
    },
    selectTarget: (id) => {
      if (ended || (game.state.mode === 'TORPEDO' && id === game.state.activeUnitId)) return;
      game.selectTarget(id);
      refresh();
    },
    toRadar: () => {
      game.toRadar();
      refresh();
    },
    pause: () => pause(),
  };
  installKeyboard(intents, { menuKey: hud.menuKey, menuOpen: hud.isMenuOpen, ended: () => ended || phase !== 'play', onLetter: hud.flash });
  hud.onLetter((letter) => {
    if (phase === 'play' && !ended && !hud.isMenuOpen()) intents.letter(letter);
  });

  // ---- Frame -----------------------------------------------------------------

  let lastBattery = -1;
  function update(t: number, dt: number, camera: Camera, azimuthDeg: number) {
    now = t;
    lastCamera = camera;
    // While paused the game clock stands still, but everything is still posed
    // at the frozen time (a restored mission pauses before its first frame).
    if (!isPaused()) {
      if (phase === 'play' && !ended) game.tick(dt * 1000);
      game.refill(tune.get<boolean>('cheat.infiniteTorpedoes'), tune.get<boolean>('cheat.infiniteBattery'));
      if (Math.floor(game.state.battery) !== lastBattery) {
        lastBattery = Math.floor(game.state.battery);
        syncHud();
      }
      const due = queue.filter((q) => q.at <= t);
      queue = queue.filter((q) => q.at > t);
      for (const q of due) q.run();
      const dueCues = cues.filter((q) => q.at <= t);
      cues = cues.filter((q) => q.at > t);
      for (const q of dueCues) q.run();

      // Sub swings its bow toward the current target.
      const target = fleet.mid(game.state.activeUnitId ?? '');
      if (target) {
        const want = Math.atan2(-(target.z - subFloat.z), target.x - subFloat.x);
        let d = want - subHeading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const step = Math.min(Math.abs(d), SUB_TURN_RATE * dt);
        subHeading += Math.sign(d) * step;
        // Turning churns the water at the stern: a short wash that fades as the turn ends.
        turnWash += ((dt > 0 ? step / dt / SUB_TURN_RATE : 0) * 0.45 - turnWash) * (1 - Math.exp(-dt * 3));
      } else {
        turnWash *= Math.exp(-dt * 3);
      }
      subFloat.yaw = subHeading;
      subFloat.speed = turnWash;
    }

    // The submarine surfaces and dives on cue (title, departure, mission start).
    subFloat.lift = subLift(t);

    board.uniforms.pingAge.value = t - pingStart;
    board.uniforms.pingCenter.value.set(subFloat.x, subFloat.z);
    const run = (t - torpStart) / torpRun;
    board.uniforms.torpT.value = run >= 0 && run <= 1.15 ? Math.min(run, 1) : -1;
    torpedo.set(torpPath.from, torpPath.to, run >= 0 && run <= 1 ? run : null, t);

    const prints: HullFootprint[] = fleet.update(t, dt);
    for (const f of [...scenery.floaters, subFloat]) ride(f, t, dt);
    // A submerged sub makes no foam: it comes as the hull breaks the surface.
    const sp = footprint(subFloat, wetness(subFloat.lift ?? 0));
    if (sp && sp.strength! > 0) prints.push(sp);
    hulls.set(prints);

    // A new contact's word shows once the radar has scanned the whole hull in.
    if (sign) sign.group.visible = !fleet.revealing(signUnit ?? '');
    sign?.update(camera, t);
    labels.update(camera);
    board.faceCamera(azimuthDeg);
  }

  // A page load opens on the title sequence and the main menu. `?level=N` or `?seed=` go straight to
  // that mission (resuming the saved one if it matches); review shots (`?shot`) skip the cinematics.
  const params = new URLSearchParams(location.search);
  const seedParam = Number(params.get('seed')) || 0;
  const levelParam = Number(params.get('level')) || 0;
  const saved = loadSave();
  const resumes = saved && (!seedParam || seedParam === saved.seed) && (!levelParam || levelParam === saved.config.id);
  if (params.has('shot')) {
    if (resumes && saved) {
      start(saved.seed, restoreGame(saved));
      pause('Mission restored');
    } else if (levelParam && levelById(levelParam)) {
      start(seedParam || randomSeed(), undefined, levelParam);
    } else if (seedParam) {
      start(seedParam);
    } else {
      start(randomSeed(), undefined, currentLevel(progress));
      setPaused(true);
      missions(resume);
    }
  } else if (seedParam || (levelParam && levelById(levelParam))) {
    phase = 'start';
    if (resumes && saved) start(saved.seed, restoreGame(saved));
    else if (levelParam && levelById(levelParam)) start(seedParam || randomSeed(), undefined, levelParam);
    else start(seedParam);
    missionStart();
  } else {
    title();
  }
  // The URL's mission is used up: a reload opens on the title again.
  if (seedParam || levelParam) {
    const url = new URL(location.href);
    url.searchParams.delete('seed');
    url.searchParams.delete('level');
    history.replaceState(null, '', url);
  }

  return {
    update,
    tap,
    islands: scenery.islands as IslandShore[],
    /** Show every effect once so the renderer compiles it before play starts. */
    warmUp: fleet.warmUp,
    warmDone: () => root.remove(warm),
    ready: hud.ready,
  };
}
