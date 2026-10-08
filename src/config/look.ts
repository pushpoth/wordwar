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
    // First load: from the loading screen's dark, high over the sea, down to the sub surfacing; the main menu then shows.
    title: {
      fadeIn: 2.6, // seconds from dark to the scene
      high: 4, // seconds on the high view of the horizon
      descend: 6, // seconds from high above down to the close, low view of the sub
      surfaceAt: 5.4, // seconds in when the sub starts to rise
      height: 14, back: 30, highPitch: 4, // the high view: height, distance back from the sub, degrees below level
      lowHeight: 5, lowBack: 11, // halfway down: looking at the sub's spot
      dist: 2.6, eyeHeight: 0.6, // the menu view: distance from the sub's front half, height over the water
      bearing: 70, // the menu view's bearing off the sub's bow, degrees
      frameX: 0.38, // where the sub sits across the screen: 0 middle, 1 right edge
      horizon: 0.33, // the horizon's height from the top of the screen, as a fraction
      sunAngle: 55, // degrees between the view and straight down-sun (0 puts the sun right behind the camera)
      sway: 0.05, // the camera's gentle bob while the menu shows
      menuDelay: 0.6, // seconds after the camera settles before the letterbox opens and the menu shows
    },
    // Leaving for a mission: letterbox in, pull back while the sub dives, fade to black.
    depart: {
      bars: 0.9, // seconds for the letterbox to close in
      seconds: 4.2, // the pull-back
      pull: 1.6, rise: 9, swing: -12, // distance ×, tilt and heading change, degrees
      sink: 3.2, // seconds for the sub to dive
      fadeAt: 2.6, fadeOut: 1.4, // when the fade to black starts, and how long it takes
    },
    // Mission start (the tuner's "opening" knobs): in from high above the rising sub, then on to the default framing.
    intro: {
      surface: 2.4, // the sub rises from below the water
      depth: 1.8, // how far below it starts
      hold: 0.6, // extra seconds before the camera reaches its close view
      settle: 3.6, // seconds from the close view to the default framing
      highDist: 17, highTilt: 74, // where the camera comes in from
      dist: 6.5, tilt: 50, heading: 35, drift: 6, // the close view: distance, tilt, heading from default, spin °/s
      fadeIn: 1.4, // seconds of fade in from black
      barsOut: 1.6, // seconds for the letterbox to open at the end
    },
    kill: {
      lead: 1.1, run: 1.8, after: 7.5, // swing in, torpedo travel, pull back and circle
      cardDelay: 3.5, // the mission-end card waits this long after impact
      aim: 0.35, // the close-up looks this far along the line from sub to ship
      closeDist: 1, closeTilt: 26, closeHeading: 18, closeRate: 1.8,
      followDist: 5.5, followTilt: 24, followSwing: 14, followRate: 2.2,
      pullDist: 1, pullTilt: 34, circle: 12, pullRate: 1.4,
      // The drone kill: a close-up of the launch at the bow, then a high view from behind the sub.
      droneChance: 0.2, droneMinGap: 6, // how often it plays, and the least sub-to-ship distance (cells)
      dip: 0.3, // seconds of each dip to black
      droneLead: 0.7, // seconds on the bow before the launch
      droneRun: 3.4, // the torpedo's run, seconds
      droneCut: 1.1, // seconds after the launch before the cut to the high view
      bowDist: 2.6, bowZoom: 0.7, bowBearing: 105, bowHeight: 0.45, // the bow close-up
      droneBack: 5, droneHeight: 5.5, droneRise: 0.6, // the high view: behind and above the sub, rising per second
    },
    reveal: {
      turn: true, // turn to face a newly found ship's word
      rate: 1.4, // how briskly
      maxTurn: 120, // the furthest it turns to keep the sun behind the camera, degrees
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
    bloomStrength: 0.07, // 15% of the phase 0 value (0.45): a faint glow on lamps and fire only
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
