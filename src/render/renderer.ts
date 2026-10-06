import { ACESFilmicToneMapping, PCFSoftShadowMap, WebGPURenderer } from 'three/webgpu';
import { LOOK } from '../config/look';

export type Backend = 'webgpu' | 'webgl';

/** `?backend=webgl` forces the WebGL 2 backend; otherwise WebGPU when available. */
export function requestedBackend(): Backend | 'auto' {
  const b = new URLSearchParams(location.search).get('backend');
  return b === 'webgl' || b === 'webgpu' ? b : 'auto';
}

export async function createRenderer(canvasHost: HTMLElement) {
  const want = requestedBackend();
  const renderer = new WebGPURenderer({
    antialias: false,
    forceWebGL: want === 'webgl',
    powerPreference: 'high-performance',
  });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = LOOK.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  canvasHost.appendChild(renderer.domElement);

  const backend: Backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl';
  return { renderer, backend };
}
