import { Group, Plane, Raycaster, Vector2, Vector3, type Camera, type Scene } from 'three/webgpu';
import { BATTERY_MAX } from '../config/balance';
import type { EngineEvent, MissionState, Unit } from '../engine/types';
import { loadModel, preloadModels } from '../render/assets';
import { CELL, type Board } from '../render/board';
import type { HullFootprint, Hulls } from '../render/hulls';
import { createBoardLabels } from '../render/labels';
import type { IslandShore } from '../render/ocean';
import { viewInset, type CameraControls } from '../render/camera';
import { createWordSign } from '../render/word-sign';
import { footprint, ride, type Floater } from '../scene/buoyancy';
import { SUB } from '../scene/diorama';
import { addScenery } from '../scene/scenery';
import { createFleet } from './fleet';
import { tune } from '../config/tunables';
import type { MissionConfig } from '../engine/types';
import { isPaused, setPaused } from '../render/clock';
import { createGame, DEFAULT_MISSION, restoreGame, type Game } from './game';
import { createHud } from './hud';
import { installKeyboard, type Intents } from './input';
import { clearSave, loadSave, writeSave } from './save';

const PING_TO_REVEAL = 0.45;
const TORPEDO_RUN = 0.6;
const END_CARD_DELAY = 2.6;
const SUB_TURN_RATE = 0.7; // radians per second

type Scheduled = { at: number; run: () => void };

/**
 * Runs a mission on the scene: turns keyboard input into engine actions and
 * engine results into board marks, ships, the target billboard, effects and
 * the HUD. Effects play out in scene time, so the board changes when the
 * ping or the torpedo arrives, not the instant a key is pressed.
 */
export async function createController(scene: Scene, board: Board, hulls: Hulls, view: CameraControls) {
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
  await preloadModels(['destroyer', 'destroyer_wreck', 'submarine']);
  const warm = new Group();
  warm.position.y = -40;
  warm.add(await loadModel('destroyer'), await loadModel('destroyer_wreck'));
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

  let game: Game;
  let sign: ReturnType<typeof createWordSign> | null = null;
  let signUnit: string | null = null;
  let discovered: string[] = [];
  let queue: Scheduled[] = [];
  let now = 0;
  let pingStart = -99;
  let torpStart = -99;
  let ended = false;
  let lastCamera: Camera | null = null;
  const ray = new Raycaster();
  const water = new Plane(new Vector3(0, 1, 0), 0);
  const hit = new Vector3();

  /** A tap on the canvas: if it lands on a discovered enemy ship, aim at it. */
  function tap(clientX: number, clientY: number) {
    if (!lastCamera || ended || isPaused() || hud.isMenuOpen()) return;
    ray.setFromCamera(new Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1), lastCamera);
    if (!ray.ray.intersectPlane(water, hit)) return;
    const id = fleet.pick(hit.x, hit.z);
    if (id) intents.selectTarget(id);
  }

  const later = (delay: number, run: () => void) => queue.push({ at: now + delay, run });

  /** Mission settings from the tuner's Gameplay knobs (applied on restart). */
  function missionConfig(): MissionConfig {
    return {
      ...DEFAULT_MISSION,
      unitCount: tune.get('game.unitCount'),
      torpedoBudget: tune.get('game.torpedoBudget'),
      batteryRegenSeconds: tune.get('game.batteryRegen'),
      allowDiagonal: tune.get<boolean>('game.diagonal'),
    };
  }

  function persist() {
    if (ended) clearSave();
    else writeSave(game.save());
  }

  /** Begin a mission: a fresh one from a seed, or a restored one already in progress. */
  function start(seed: number, restored?: Game) {
    game?.dispose();
    game = restored ?? createGame(missionConfig(), seed);
    seed = game.seed;
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
    const url = new URL(location.href);
    url.searchParams.set('seed', String(seed));
    history.replaceState(null, '', url);
    hud.note(restored ? `MISSION RESTORED · SEED ${seed}` : `MISSION START · SEED ${seed}`);
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
  }

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
      mission: st.config.id,
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
    for (const e of events) {
      switch (e.type) {
        case 'radar:fired':
          hud.note(`SONAR PING · ${e.letter}`);
          pingStart = now;
          hud.ping();
          break;
        case 'radar:resolved':
          later(PING_TO_REVEAL, () => {
            hud.note(e.unitsDiscovered.length ? `CONTACT DETECTED · ${e.unitsDiscovered.length}` : e.tilesRevealed.length ? `${e.tilesRevealed.length} RETURNS · NO CONTACT` : 'NO RETURNS');
            syncBoard();
            syncHud();
          });
          break;
        case 'radar:denied':
          hud.note(e.reason === 'battery_empty' ? 'BATTERY EMPTY · RECHARGING' : 'MISSION OVER');
          break;
        case 'torpedo:fired':
          hud.note(`TORPEDO AWAY · ${e.letter}`);
          launchTorpedo(e.targetUnitId);
          break;
        case 'torpedo:denied':
          hud.note(e.reason === 'already_tried' ? 'LETTER ALREADY TRIED' : e.reason === 'torpedoes_empty' ? 'OUT OF TORPEDOES' : 'MISSION OVER');
          break;
        case 'torpedo:resolved':
          later(TORPEDO_RUN, () => {
            hud.note(e.missed ? 'MISS' : `DIRECT HIT · ${e.hits.length}`);
            const at = e.hits[0] ? board.cellCenter(e.hits[0].x, e.hits[0].y) : fleet.mid(e.targetUnitId);
            if (at) {
              board.uniforms.blastCenter.value.set(at.x, at.z);
              board.uniforms.blastAge.value = 0.35;
            }
            if (!e.missed) fleet.jolt(e.targetUnitId);
            syncBoard();
            syncHud();
          });
          break;
        case 'unit:destroyed':
          later(TORPEDO_RUN, () => {
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
          later(TORPEDO_RUN + END_CARD_DELAY, () => {
            const s = e.summary;
            const win = s.outcome === 'success';
            const secs = s.elapsedMs / 1000;
            hud.menu({
              title: win ? 'MISSION COMPLETE' : 'MISSION FAILED',
              subtitle: win ? 'All enemy units sunk' : 'Out of torpedoes',
              tone: win ? 'win' : 'lose',
              stats: [
                ['Score', String(s.score)],
                ['Units sunk', `${s.unitsDestroyed} of ${s.unitsTotal}`],
                ['Torpedo accuracy', `${Math.round(s.hitRateTorpedo * 100)}%`],
                ['Time', `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`],
              ],
              actions: [
                { label: 'New game', key: 'Enter', run: newGame },
                { label: 'Replay this mission', key: 'R', run: () => start(game.seed) },
              ],
            });
          });
          break;
        default:
          break;
      }
    }
    syncHud();
    persist();
  }

  function launchTorpedo(unitId: string) {
    const to = fleet.mid(unitId);
    if (!to) return;
    board.uniforms.torpFrom.value.set(subFloat.x, subFloat.z);
    board.uniforms.torpTo.value.set(to.x, to.z);
    torpStart = now;
  }

  // ---- Pause and menus ----------------------------------------------------

  const newGame = () => start(Math.floor(Math.random() * 1e6) + 1);

  function pause(reason = 'Paused') {
    if (ended || isPaused()) return;
    setPaused(true);
    persist();
    hud.menu({
      title: reason.toUpperCase(),
      subtitle: `Mission ${String(game.state.config.id).padStart(2, '0')} · seed ${game.seed}`,
      actions: [
        { label: 'Continue', key: 'Space / Esc', run: resume },
        { label: 'Restart mission', key: 'R', run: () => start(game.seed) },
        { label: 'New game', key: 'N', run: newGame },
      ],
    });
  }

  function resume() {
    hud.menu(null);
    setPaused(false);
  }

  hud.watchDock((px) => { viewInset.bottom = px; view.refit(); });
  hud.onPause(() => pause());
  hud.onCamera({ zoomIn: view.zoomIn, zoomOut: view.zoomOut, rotate: () => view.rotate(1) });
  // Leaving the tab or app pauses the game; progress is already saved.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  window.addEventListener('pagehide', persist);
  // The tuner's "Restart mission" applies Gameplay knobs.
  window.addEventListener('ww:restart', () => start(game.seed));
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
  installKeyboard(intents, { menuKey: hud.menuKey, menuOpen: hud.isMenuOpen, ended: () => ended, onLetter: hud.flash });
  hud.onLetter((letter) => {
    if (!ended && !hud.isMenuOpen()) intents.letter(letter);
  });

  // ---- Frame -----------------------------------------------------------------

  let lastBattery = -1;
  function update(t: number, dt: number, camera: Camera, azimuthDeg: number) {
    now = t;
    lastCamera = camera;
    // While paused the game clock stands still, but everything is still posed
    // at the frozen time (a restored mission pauses before its first frame).
    if (!isPaused()) {
      if (!ended) game.tick(dt * 1000);
      game.refill(tune.get<boolean>('cheat.infiniteTorpedoes'), tune.get<boolean>('cheat.infiniteBattery'));
      if (Math.floor(game.state.battery) !== lastBattery) {
        lastBattery = Math.floor(game.state.battery);
        syncHud();
      }
      const due = queue.filter((q) => q.at <= t);
      queue = queue.filter((q) => q.at > t);
      for (const q of due) q.run();

      // Sub swings its bow toward the current target.
      const target = fleet.mid(game.state.activeUnitId ?? '');
      if (target) {
        const want = Math.atan2(-(target.z - subFloat.z), target.x - subFloat.x);
        let d = want - subHeading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        subHeading += Math.sign(d) * Math.min(Math.abs(d), SUB_TURN_RATE * dt);
      }
      subFloat.yaw = subHeading;
    }

    board.uniforms.pingAge.value = t - pingStart;
    board.uniforms.pingCenter.value.set(subFloat.x, subFloat.z);
    const run = (t - torpStart) / TORPEDO_RUN;
    board.uniforms.torpT.value = run >= 0 && run <= 1.15 ? Math.min(run, 1) : -1;

    const prints: HullFootprint[] = fleet.update(t, dt);
    for (const f of [...scenery.floaters, subFloat]) ride(f, t, dt);
    const sp = footprint(subFloat);
    if (sp) prints.push(sp);
    hulls.set(prints);

    sign?.update(camera, t);
    labels.update(camera);
    board.faceCamera(azimuthDeg);
  }

  // Resume a saved mission unless the URL asks for a different seed.
  const seedParam = Number(new URLSearchParams(location.search).get('seed')) || 0;
  const saved = loadSave();
  if (saved && (!seedParam || seedParam === saved.seed)) {
    start(saved.seed, restoreGame(saved));
    pause('Mission restored');
  } else {
    start(seedParam || Math.floor(Math.random() * 1e6) + 1);
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
