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
const si = LOOK.shots.intro;
const sk = LOOK.shots.kill;

export const KNOBS: Record<string, Knob[]> = {
  Quality: [
    { key: 'quality.maxResolution', label: 'max resolution', value: 1.25, phone: 1.0, min: 0.5, max: 2, step: 0.05, apply: 'live', hint: 'Multiple of CSS pixels; adaptive scaling never goes above this.' },
    { key: 'quality.minResolution', label: 'min resolution', value: 0.7, phone: 0.6, min: 0.4, max: 1.5, step: 0.05, apply: 'live' },
    { key: 'quality.fpsCap', label: 'fps cap', value: 60, phone: 60, options: { '30': 30, '60': 60, '120': 120 }, apply: 'live' },
    { key: 'quality.depthOfField', label: 'depth of field', value: true, phone: false, apply: 'live', hint: 'The expensive blur. Phones use the edge blur instead.' },
    { key: 'quality.bloom', label: 'bloom', value: true, phone: true, apply: 'live' },
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
    { key: 'shot.intro.surface', label: 'opening: sub rise s', value: si.surface, min: 0.5, max: 8, step: 0.1, apply: 'live' },
    { key: 'shot.intro.depth', label: 'opening: sub start depth', value: si.depth, min: 0.3, max: 4, step: 0.1, apply: 'live' },
    { key: 'shot.intro.hold', label: 'opening: hold s', value: si.hold, min: 0, max: 5, step: 0.1, apply: 'live', hint: 'Seconds held close after the sub has surfaced.' },
    { key: 'shot.intro.settle', label: 'opening: ease out s', value: si.settle, min: 0.5, max: 12, step: 0.1, apply: 'live' },
    { key: 'shot.intro.rate', label: 'opening: ease out speed', value: si.rate, min: 0.3, max: 6, step: 0.1, apply: 'live' },
    { key: 'shot.intro.dist', label: 'opening: distance', value: si.dist, min: 3, max: 20, step: 0.1, apply: 'live' },
    { key: 'shot.intro.tilt', label: 'opening: tilt °', value: si.tilt, min: 30, max: 85, step: 1, apply: 'live', hint: 'Keep it steep enough that the horizon stays out of frame.' },
    { key: 'shot.intro.heading', label: 'opening: heading °', value: si.heading, min: -180, max: 180, step: 1, apply: 'live', hint: 'Degrees from the default heading.' },
    { key: 'shot.intro.drift', label: 'opening: drift °/s', value: si.drift, min: -20, max: 20, step: 0.5, apply: 'live' },
    { key: 'shot.kill.lead', label: 'kill: swing-in s', value: sk.lead, min: 0, max: 5, step: 0.1, apply: 'live', hint: 'Time the camera takes to get behind the sub before the torpedo launches.' },
    { key: 'shot.kill.run', label: 'kill: torpedo run s', value: sk.run, min: 0.4, max: 6, step: 0.1, apply: 'live' },
    { key: 'shot.kill.after', label: 'kill: pull-back s', value: sk.after, min: 0, max: 20, step: 0.5, apply: 'live', hint: 'How long the camera circles the wreck.' },
    { key: 'shot.kill.cardDelay', label: 'kill: end card delay s', value: sk.cardDelay, min: 0, max: 12, step: 0.1, apply: 'live' },
    { key: 'shot.kill.aim', label: 'kill: aim along path', value: sk.aim, min: 0, max: 1, step: 0.01, apply: 'live', hint: '0 looks at the sub, 1 at the ship.' },
    { key: 'shot.kill.closeDist', label: 'kill: close-up distance ×', value: sk.closeDist, min: 0.4, max: 2.5, step: 0.05, apply: 'live' },
    { key: 'shot.kill.closeTilt', label: 'kill: close-up tilt °', value: sk.closeTilt, min: 18, max: 80, step: 1, apply: 'live' },
    { key: 'shot.kill.closeHeading', label: 'kill: close-up heading °', value: sk.closeHeading, min: -90, max: 90, step: 1, apply: 'live', hint: 'Degrees off straight behind the sub.' },
    { key: 'shot.kill.closeRate', label: 'kill: close-up speed', value: sk.closeRate, min: 0.3, max: 8, step: 0.1, apply: 'live' },
    { key: 'shot.kill.followDist', label: 'kill: follow distance', value: sk.followDist, min: 2, max: 14, step: 0.1, apply: 'live' },
    { key: 'shot.kill.followTilt', label: 'kill: follow tilt °', value: sk.followTilt, min: 18, max: 80, step: 1, apply: 'live' },
    { key: 'shot.kill.followSwing', label: 'kill: follow swing °', value: sk.followSwing, min: -90, max: 90, step: 1, apply: 'live', hint: 'Degrees the camera swings around the torpedo during its run.' },
    { key: 'shot.kill.followRate', label: 'kill: follow tightness', value: sk.followRate, min: 1, max: 12, step: 0.1, apply: 'live' },
    { key: 'shot.kill.pullDist', label: 'kill: pull-back distance ×', value: sk.pullDist, min: 0.4, max: 2.5, step: 0.05, apply: 'live' },
    { key: 'shot.kill.pullTilt', label: 'kill: pull-back tilt °', value: sk.pullTilt, min: 18, max: 80, step: 1, apply: 'live' },
    { key: 'shot.kill.pullHeading', label: 'kill: pull-back heading °', value: sk.pullHeading, min: -180, max: 180, step: 1, apply: 'live' },
    { key: 'shot.kill.circle', label: 'kill: circle speed °/s', value: sk.circle, min: -40, max: 40, step: 0.5, apply: 'live' },
    { key: 'shot.kill.pullRate', label: 'kill: pull-back speed', value: sk.pullRate, min: 0.3, max: 8, step: 0.1, apply: 'live' },
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
