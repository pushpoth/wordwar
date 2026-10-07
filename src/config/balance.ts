export const LETTER_FREQ: Record<string, number> = {
  E: 12.7,
  T: 9.06,
  A: 8.17,
  O: 7.51,
  I: 6.97,
  N: 6.75,
  S: 6.33,
  H: 6.09,
  R: 5.99,
  D: 4.25,
  L: 4.03,
  C: 2.78,
  U: 2.76,
  M: 2.41,
  W: 2.36,
  F: 2.23,
  G: 2.02,
  Y: 1.97,
  P: 1.93,
  B: 1.49,
  V: 0.98,
  K: 0.77,
  J: 0.15,
  X: 0.15,
  Q: 0.1,
  Z: 0.07
};

export let BATTERY_MAX = 5;
export function setBatteryMax(v: number) {
  BATTERY_MAX = v;
}
export const BATTERY_REGEN_SECONDS = 5;

export const RADAR_REVEALS_BY_GRID: Record<number, number> = {
  8: 3,
  10: 4,
  12: 5,
  15: 6,
  18: 7,
  20: 8,
  22: 8,
  25: 9,
  27: 9,
  28: 10,
  30: 10
};

export const TORPEDO_BUDGET_DEFAULT = 60;
export const LOW_TORPEDO_WARNING_THRESHOLD = 5;
export const PERFECT_KILL_BONUS = 50;

// Bridge / input gate
export const INPUT_LOCKOUT_MAX = 1200; // ms — safety valve for input gate

// Camera juice timings & intensities
export const CAMERA_SHAKE_HIT_DURATION = 220; // ms
export const CAMERA_SHAKE_HIT_INTENSITY = 0.04;
export const CAMERA_SHAKE_DESTRUCT_DURATION = 600; // ms
export const CAMERA_SHAKE_DESTRUCT_INTENSITY = 0.08;
export const CAMERA_FREEZE_FRAME_DURATION = 120; // ms
export const CAMERA_PAN_FOCUS_DURATION = 600; // ms
export const CAMERA_SHOCKWAVE_DURATION = 350; // ms
export const CAMERA_PUNCH_FIRE_INTENSITY = 0.04;


// FX channel default durations (ms) — used by the MVP no-op runners
// in src/bridge/engine-scene-bridge.ts. Drop 3 FX tasks replace these
// with real durations driven by the FX implementations themselves.
export const FX_DURATION_DEFAULTS: Record<string, number> = {
  radarPing: 900,
  tileReveal: 220,
  torpedoTrail: 500,
  hitSplash: 600,
  'cameraJuice.shake': 220,
  'cameraJuice.pan': 600,
  destruction: 1200,
};


