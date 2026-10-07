// Every art-direction number in one place. Units: 1 = one board cell.

export const LOOK = {
  board: {
    size: 10,
  },
  camera: {
    fov: 30,
    // Spherical offset from the board centre.
    distance: 25,
    elevationDeg: 52,
    azimuthDeg: -28,
    targetOffset: [0, 0, 0.6] as [number, number, number],
  },
  // Camera shots (see game/shots.ts). Times in seconds, distances in cells, angles in degrees.
  shots: {
    intro: {
      surface: 2.4, // the sub rises from below the water
      depth: 1.8, // how far below it starts
      hold: 0.5, // extra seconds held close after it has surfaced
      settle: 4, // seconds easing out to the default framing
      dist: 6.5, tilt: 54, heading: 35, drift: 3, // the close shot: distance, tilt, heading from default, slow spin °/s
      rate: 1.5, // how briskly it eases out
    },
    kill: {
      lead: 1.1, run: 1.8, after: 7.5, // swing in, torpedo travel, pull back and circle
      cardDelay: 3.5, // the mission-end card waits this long after impact
      aim: 0.35, // the close-up looks this far along the line from sub to ship
      closeDist: 1, closeTilt: 32, closeHeading: 18, closeRate: 2.2,
      followDist: 5.2, followTilt: 28, followSwing: -30, followRate: 6,
      pullDist: 1, pullTilt: 36, pullHeading: -12, circle: 9, pullRate: 1.6,
    },
    focusRate: 3, // how briskly the camera pans to the targeted ship
    returnRate: 2.5, // how briskly it eases back after a shot
  },
  sun: {
    // Low, warm and slightly behind the board so the water glints toward the camera.
    elevationDeg: 16,
    azimuthDeg: 186,
    color: 0xffc58a,
    intensity: 3.2,
    shadowMapSize: 2048,
  },
  sky: {
    turbidity: 6,
    rayleigh: 1.6,
    mieCoefficient: 0.006,
    mieDirectionalG: 0.86,
  },
  ambient: {
    skyColor: 0x9fc4e8,
    groundColor: 0x0d2a3a,
    intensity: 0.5,
    envIntensity: 0.55,
  },
  /** Wave steepness multiplier: 0.4 calm, 1 moderate, 1.8 rough. `?sea=` overrides. */
  seaState: 1,
  exposure: 0.95,
  post: {
    bloomStrength: 0.45,
    bloomRadius: 0.45,
    bloomThreshold: 0.9,
    // Tilt-shift depth of field: focus on the board, blur the near and far edges.
    dofFocalLength: 9,
    dofBokehScale: 3.2,
    vignette: 0.42,
    saturation: 1.12,
    warmth: 0.05,
  },
} as const;
