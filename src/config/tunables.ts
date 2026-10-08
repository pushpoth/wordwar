import { LOOK } from './look';

/**
 * Every value the dev tuner can change, declared once. Code reads values with
 * `tune.get(key)` and reacts to changes with `tune.on(key, fn)`.
 *
 * - `phone` is the default on the phone quality tier (see `QUALITY`).
 * - `apply: 'live'` takes effect at once, `'restart'` on the next mission,
 *   `'reload'` after a page reload (the tuner offers a button).
 *
 * With `?tune`, changes persist in this browser so they survive reloads while
 * you compare; "Copy changes" puts only the changed values on the clipboard,
 * ready to paste into chat.
 */
type Value = number | boolean | string;
type Knob = {
  key: string;
  label: string;
  value: Value;
  phone?: Value;
  min?: number;
  max?: number;
  step?: number;
  options?: Record<string, Value>;
  apply: 'live' | 'restart' | 'reload';
  hint?: string;
};

const c = LOOK.camera;
const p = LOOK.post;
type ShotGroup = 'title' | 'depart' | 'intro' | 'kill';
/** A camera-shot knob: `shot.<group>.<key>`, defaulting to `LOOK.shots`. */
const shot = (group: ShotGroup, key: string, label: string, min: number, max: number, step: number, hint?: string): Knob => ({
  key: `shot.${group}.${key}`, label, value: (LOOK.shots[group] as Record<string, number>)[key], min, max, step, apply: 'live', hint,
});

export const KNOBS: Record<string, Knob[]> = {
  Quality: [
    { key: 'quality.maxResolution', label: 'max resolution', value: 1.25, phone: 1.0, min: 0.5, max: 2, step: 0.05, apply: 'live', hint: 'Multiple of CSS pixels; adaptive scaling never goes above this.' },
    { key: 'quality.minResolution', label: 'min resolution', value: 0.7, phone: 0.6, min: 0.4, max: 1.5, step: 0.05, apply: 'live' },
    { key: 'quality.fpsCap', label: 'fps cap', value: 60, phone: 60, options: { '30': 30, '60': 60, '120': 120 }, apply: 'live' },
    { key: 'quality.depthOfField', label: 'depth of field', value: true, phone: false, apply: 'live', hint: 'The expensive blur. Phones use the edge blur instead.' },
    { key: 'quality.bloom', label: 'bloom', value: true, phone: false, apply: 'live', hint: 'Faint by default (see Look › bloom strength); off on phones, where the pass costs more than it shows.' },
    { key: 'quality.shadowMapSize', label: 'shadow map', value: 2048, phone: 1024, options: { '512': 512, '1024': 1024, '2048': 2048, '4096': 4096 }, apply: 'reload' },
    { key: 'quality.oceanSegments', label: 'ocean segments', value: 256, phone: 160, min: 96, max: 384, step: 16, apply: 'reload' },
    { key: 'quality.particles', label: 'particle density', value: 1, phone: 0.5, min: 0.2, max: 1.5, step: 0.1, apply: 'reload' },
  ],
  Blur: [
    { key: 'post.dofRange', label: 'depth: in-focus range', value: p.dofFocalLength, min: 2, max: 30, step: 0.5, apply: 'live', hint: 'World distance from the focus plane before things go fully soft. Smaller = blurrier.' },
    { key: 'post.dofBokeh', label: 'depth: blur size', value: p.dofBokehScale, min: 0, max: 8, step: 0.1, apply: 'live' },
    { key: 'post.focusOffset', label: 'depth: focus offset', value: 0, min: -8, max: 8, step: 0.25, apply: 'live', hint: 'Moves the focus plane nearer (−) or further (+) than the board centre.' },
    { key: 'post.edgeBlur', label: 'edge: amount', value: 0, phone: 1, min: 0, max: 1.5, step: 0.05, apply: 'live', hint: 'Screen-space miniature blur toward the top and bottom edges. Cheap.' },
    { key: 'post.edgeBand', label: 'edge: sharp band', value: 0.32, min: 0.05, max: 0.6, step: 0.01, apply: 'live' },
    { key: 'post.edgeCenter', label: 'edge: band centre', value: 0.5, min: 0.2, max: 0.8, step: 0.01, apply: 'live' },
  ],
  Look: [
    { key: 'post.exposure', label: 'exposure', value: LOOK.exposure, min: 0.4, max: 1.8, step: 0.01, apply: 'live' },
    { key: 'post.bloomStrength', label: 'bloom strength', value: p.bloomStrength, min: 0, max: 2, step: 0.01, apply: 'live' },
    { key: 'post.bloomThreshold', label: 'bloom threshold', value: p.bloomThreshold, min: 0, max: 2, step: 0.01, apply: 'live' },
    { key: 'post.vignette', label: 'vignette', value: p.vignette, min: 0, max: 1, step: 0.01, apply: 'live' },
    { key: 'post.saturation', label: 'saturation', value: p.saturation, min: 0, max: 2, step: 0.01, apply: 'live' },
    { key: 'post.warmth', label: 'warmth', value: p.warmth, min: -0.2, max: 0.2, step: 0.005, apply: 'live' },
  ],
  Camera: [
    { key: 'camera.distance', label: 'distance', value: c.distance, min: 10, max: 45, step: 0.5, apply: 'live' },
    { key: 'camera.elevation', label: 'start tilt °', value: c.elevationDeg, min: 20, max: 85, step: 1, apply: 'live' },
    { key: 'camera.azimuth', label: 'start heading °', value: c.azimuthDeg, min: -180, max: 180, step: 1, apply: 'live' },
    { key: 'camera.minTilt', label: 'lowest tilt °', value: 36, min: 10, max: 70, step: 1, apply: 'live' },
    { key: 'camera.cinematics', label: 'cinematic shots', value: true, apply: 'live' },
    { key: 'camera.fov', label: 'field of view °', value: c.fov, min: 15, max: 60, step: 1, apply: 'live' },
    { key: 'camera.targetY', label: 'look-at height', value: c.targetOffset[1], min: -2, max: 3, step: 0.05, apply: 'live' },
    { key: 'camera.targetZ', label: 'look-at depth', value: c.targetOffset[2], min: -4, max: 4, step: 0.05, apply: 'live' },
  ],
  'Camera shots': [
    { key: 'shot.focusRate', label: 'pan to ship speed', value: LOOK.shots.focusRate, min: 0.5, max: 10, step: 0.1, apply: 'live', hint: 'How briskly the camera pans to the targeted ship (higher = quicker).' },
    { key: 'shot.returnRate', label: 'ease back speed', value: LOOK.shots.returnRate, min: 0.5, max: 10, step: 0.1, apply: 'live', hint: 'How briskly the camera returns after a shot ends or is interrupted.' },
    shot('title', 'fadeIn', 'title: fade in s', 0.2, 8, 0.1),
    shot('title', 'high', 'title: high view s', 0, 12, 0.1, 'Seconds on the high view of the horizon before the descent.'),
    shot('title', 'descend', 'title: descent s', 1, 15, 0.1),
    shot('title', 'surfaceAt', 'title: sub rises at s', 0, 15, 0.1),
    shot('title', 'height', 'title: start height', 3, 40, 0.5),
    shot('title', 'back', 'title: start distance back', 5, 60, 0.5),
    shot('title', 'highPitch', 'title: start look down °', -5, 30, 0.5),
    shot('title', 'lowHeight', 'title: midway height', 1, 20, 0.1),
    shot('title', 'lowBack', 'title: midway distance back', 2, 30, 0.1),
    shot('title', 'dist', 'title: menu view distance', 1.5, 12, 0.1, 'From the front half of the sub.'),
    shot('title', 'eyeHeight', 'title: menu view height', 0.3, 4, 0.05),
    shot('title', 'bearing', 'title: menu view bearing °', -180, 180, 1, 'Degrees off the sub\'s bow.'),
    shot('title', 'frameX', 'title: sub across screen', -0.9, 0.9, 0.01, '0 middle, 1 right edge.'),
    shot('title', 'horizon', 'title: horizon from top', 0.05, 0.5, 0.01),
    shot('title', 'sunAngle', 'title: angle off down-sun °', -180, 180, 1, '0 puts the sun right behind the camera.'),
    shot('title', 'sway', 'title: menu bob', 0, 0.3, 0.01),
    shot('title', 'menuDelay', 'title: menu delay s', 0, 5, 0.1),
    shot('depart', 'bars', 'depart: letterbox s', 0.1, 4, 0.1),
    shot('depart', 'seconds', 'depart: pull-back s', 0.5, 10, 0.1),
    shot('depart', 'pull', 'depart: pull-back ×', 1, 4, 0.05),
    shot('depart', 'rise', 'depart: tilt up °', -20, 40, 1),
    shot('depart', 'swing', 'depart: heading change °', -90, 90, 1),
    shot('depart', 'sink', 'depart: sub dive s', 0.5, 8, 0.1),
    shot('depart', 'fadeAt', 'depart: fade starts at s', 0, 8, 0.1),
    shot('depart', 'fadeOut', 'depart: fade out s', 0.2, 5, 0.1),
    shot('intro', 'surface', 'start: sub rise s', 0.5, 8, 0.1),
    shot('intro', 'depth', 'start: sub start depth', 0.3, 4, 0.1),
    shot('intro', 'hold', 'start: extra s to close view', 0, 5, 0.1),
    shot('intro', 'settle', 'start: to default framing s', 0.5, 12, 0.1),
    shot('intro', 'highDist', 'start: in from distance', 5, 40, 0.5),
    shot('intro', 'highTilt', 'start: in from tilt °', 30, 89, 1),
    shot('intro', 'dist', 'start: close distance', 3, 20, 0.1),
    shot('intro', 'tilt', 'start: close tilt °', 20, 85, 1),
    shot('intro', 'heading', 'start: heading °', -180, 180, 1, 'Degrees from the default heading.'),
    shot('intro', 'drift', 'start: spin °/s', -30, 30, 0.5),
    shot('intro', 'fadeIn', 'start: fade in s', 0.1, 5, 0.1),
    shot('intro', 'barsOut', 'start: letterbox opens s', 0.2, 5, 0.1),
    shot('kill', 'lead', 'kill: swing-in s', 0, 5, 0.1, 'Time the camera takes to get behind the sub before the torpedo launches.'),
    shot('kill', 'run', 'kill: torpedo run s', 0.4, 6, 0.1),
    shot('kill', 'after', 'kill: circle the wreck s', 0, 20, 0.5),
    shot('kill', 'cardDelay', 'kill: end card delay s', 0, 12, 0.1),
    shot('kill', 'aim', 'kill: aim along path', 0, 1, 0.01, '0 looks at the sub, 1 at the ship.'),
    shot('kill', 'closeDist', 'kill: behind-sub distance ×', 0.4, 2.5, 0.05),
    shot('kill', 'closeTilt', 'kill: behind-sub tilt °', 10, 80, 1),
    shot('kill', 'closeHeading', 'kill: behind-sub heading °', -90, 90, 1, 'Degrees off straight behind the sub.'),
    shot('kill', 'closeRate', 'kill: behind-sub speed', 0.3, 8, 0.1),
    shot('kill', 'followDist', 'kill: zoom distance', 2, 14, 0.1),
    shot('kill', 'followTilt', 'kill: zoom tilt °', 10, 80, 1),
    shot('kill', 'followSwing', 'kill: swing during run °', -90, 90, 1),
    shot('kill', 'followRate', 'kill: zoom speed', 0.5, 12, 0.1),
    shot('kill', 'pullDist', 'kill: circle distance ×', 0.4, 2.5, 0.05),
    shot('kill', 'pullTilt', 'kill: circle tilt °', 10, 80, 1),
    shot('kill', 'circle', 'kill: circle speed °/s', -40, 40, 0.5),
    shot('kill', 'pullRate', 'kill: circle ease speed', 0.3, 8, 0.1),
    shot('kill', 'droneChance', 'drone: chance', 0, 1, 0.05, 'How often a far kill gets the drone shot.'),
    shot('kill', 'droneMinGap', 'drone: least distance', 0, 20, 0.5, 'Cells from the sub\'s bow to the ship.'),
    shot('kill', 'dip', 'drone: dip to black s', 0.05, 1.5, 0.05),
    shot('kill', 'droneLead', 'drone: bow before launch s', 0, 3, 0.1),
    shot('kill', 'droneRun', 'drone: torpedo run s', 1, 8, 0.1),
    shot('kill', 'droneCut', 'drone: cut to high view at s', 0.3, 4, 0.1, 'Seconds after the launch.'),
    shot('kill', 'bowDist', 'drone: bow distance', 0.8, 8, 0.1),
    shot('kill', 'bowZoom', 'drone: bow zoom ×', 0.3, 1.5, 0.05),
    shot('kill', 'bowBearing', 'drone: bow bearing °', -180, 180, 1, 'Degrees off the torpedo\'s path.'),
    shot('kill', 'bowHeight', 'drone: bow height', 0.15, 3, 0.05),
    shot('kill', 'droneBack', 'drone: high view back', 0, 20, 0.5),
    shot('kill', 'droneHeight', 'drone: high view height', 1, 20, 0.5),
    shot('kill', 'droneRise', 'drone: rise per s', 0, 3, 0.05),
    { key: 'shot.reveal.turn', label: 'reveal: turn to the word', value: LOOK.shots.reveal.turn, apply: 'live' },
    { key: 'shot.reveal.rate', label: 'reveal: turn speed', value: LOOK.shots.reveal.rate, min: 0.3, max: 8, step: 0.1, apply: 'live' },
    { key: 'shot.reveal.maxTurn', label: 'reveal: most turn for sun °', value: LOOK.shots.reveal.maxTurn, min: 0, max: 180, step: 5, apply: 'live', hint: 'Turns this far at most to keep the sun behind the camera; past it, the nearer side.' },
    { key: 'fx.pingSpeed', label: 'reveal: ping ring speed', value: 7, min: 2, max: 20, step: 0.5, apply: 'live', hint: 'Cells per second on a 10×10 board; ships are scanned in as the ring passes.' },
  ],
  'Sun & sea': [
    { key: 'sun.elevation', label: 'sun height °', value: LOOK.sun.elevationDeg, min: 2, max: 80, step: 1, apply: 'live' },
    { key: 'sun.azimuth', label: 'sun heading °', value: LOOK.sun.azimuthDeg, min: 0, max: 360, step: 1, apply: 'live' },
    { key: 'sun.intensity', label: 'sun strength', value: LOOK.sun.intensity, min: 0, max: 8, step: 0.05, apply: 'live' },
    { key: 'sky.envIntensity', label: 'sky reflections', value: LOOK.ambient.envIntensity, min: 0, max: 2, step: 0.01, apply: 'live' },
    { key: 'sea.state', label: 'sea state', value: LOOK.seaState, min: 0.2, max: 2.2, step: 0.05, apply: 'live', hint: '0.4 calm · 1 moderate · 1.8 rough. Ships ride harder in rough seas.' },
    { key: 'sea.ripple', label: 'ripple detail', value: 0.16, min: 0, max: 0.5, step: 0.01, apply: 'live' },
  ],
  Gameplay: [
    { key: 'game.gridSize', label: 'map size', value: 10, options: { '8×8': 8, '10×10': 10, '12×12': 12, '15×15': 15, '18×18': 18 }, apply: 'restart' },
    { key: 'game.unitCount', label: 'enemy ships', value: 4, min: 1, max: 7, step: 1, apply: 'restart' },
    { key: 'game.torpedoBudget', label: 'torpedoes', value: 60, min: 5, max: 200, step: 1, apply: 'restart' },
    { key: 'game.batteryRegen', label: 'battery recharge s', value: 5, min: 0.5, max: 30, step: 0.5, apply: 'restart' },
    { key: 'game.diagonal', label: 'diagonal ships', value: false, apply: 'restart' },
  ],
  Cheats: [
    { key: 'cheat.showShips', label: 'show all ships', value: false, apply: 'live' },
    { key: 'cheat.showWords', label: 'show target word', value: false, apply: 'live', hint: 'Every letter of the target shows as a hint.' },
    { key: 'cheat.infiniteTorpedoes', label: 'infinite torpedoes', value: false, apply: 'live' },
    { key: 'cheat.infiniteBattery', label: 'infinite battery', value: false, apply: 'live' },
  ],
};

// ---- Quality tier ------------------------------------------------------------

/** `?quality=phone|desktop`; otherwise phones and small touch screens get the phone tier. */
export const QUALITY: 'phone' | 'desktop' = (() => {
  const q = new URLSearchParams(location.search).get('quality');
  if (q === 'phone' || q === 'desktop') return q;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  return coarse && small ? 'phone' : 'desktop';
})();

// ---- Store -------------------------------------------------------------------

const ALL = Object.values(KNOBS).flat();
const BY_KEY = new Map(ALL.map((k) => [k.key, k]));
const STORAGE = 'wordwar.tune';
export const TUNER_ENABLED = new URLSearchParams(location.search).has('tune') || import.meta.env.DEV;

const defaults = new Map<string, Value>(ALL.map((k) => [k.key, QUALITY === 'phone' && k.phone !== undefined ? k.phone : k.value]));
const values = new Map(defaults);
const listeners = new Map<string, Set<(v: Value) => void>>();

if (TUNER_ENABLED) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Record<string, Value>;
    for (const [k, v] of Object.entries(saved)) if (BY_KEY.has(k)) values.set(k, v);
  } catch {
    /* storage unavailable: start from defaults */
  }
}

function persist() {
  if (!TUNER_ENABLED) return;
  try {
    localStorage.setItem(STORAGE, JSON.stringify(changes()));
  } catch {
    /* ignore */
  }
}

/** Only the values that differ from this tier's defaults. */
function changes() {
  const out: Record<string, Value> = {};
  for (const [k, v] of values) if (v !== defaults.get(k)) out[k] = v;
  return out;
}

export const tune = {
  get<T extends Value = number>(key: string): T {
    if (!BY_KEY.has(key)) throw new Error(`unknown tunable ${key}`);
    return values.get(key) as T;
  },
  set(key: string, v: Value) {
    if (values.get(key) === v) return;
    values.set(key, v);
    persist();
    for (const fn of listeners.get(key) ?? []) fn(v);
  },
  /** Subscribe to a key; returns an unsubscribe function. */
  on(key: string, fn: (v: Value) => void) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(fn);
    return () => listeners.get(key)!.delete(fn);
  },
  /** Subscribe to several keys with one handler. */
  onAny(keys: string[], fn: () => void) {
    const offs = keys.map((k) => tune.on(k, fn));
    return () => offs.forEach((off) => off());
  },
  reset(keys?: string[]) {
    for (const k of keys ?? [...values.keys()]) tune.set(k, defaults.get(k)!);
  },
  knob: (key: string) => BY_KEY.get(key),
  defaultOf: (key: string) => defaults.get(key),
  changes,
  /** A paste-ready summary of what changed, for chat. */
  report() {
    const ch = changes();
    const lines = Object.entries(ch).map(([k, v]) => `${k}: ${JSON.stringify(defaults.get(k))} → ${JSON.stringify(v)}`);
    return `Word War tuner changes (${QUALITY} tier, ${lines.length} changed)\n${lines.join('\n') || '(none)'}\n\n${JSON.stringify(ch, null, 2)}`;
  },
};
