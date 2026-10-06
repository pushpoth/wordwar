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
