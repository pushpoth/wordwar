import { ACESFilmicToneMapping, PCFSoftShadowMap, WebGPURenderer } from 'three/webgpu';
import { LOOK } from '../config/look';

export type Backend = 'webgpu' | 'webgl';

/** `?backend=webgl` forces the WebGL 2 backend; otherwise WebGPU when available. */
export function requestedBackend(): Backend | 'auto' {
  const b = new URLSearchParams(location.search).get('backend');
  return b === 'webgl' || b === 'webgpu' ? b : 'auto';
}

/**
 * Render resolution as a multiple of CSS pixels. Retina screens would otherwise
 * render (and post-process) 4× the pixels for little visible gain under the
 * depth-of-field blur. Starts at 1.25 at most and adapts to the frame rate:
 * steps down when frames run slow, back up when there's headroom.
 * `?dpr=<n>` pins it.
 */
export const resolution = (() => {
  const pinned = Number(new URLSearchParams(location.search).get('dpr')) || 0;
  const max = pinned || Math.min(window.devicePixelRatio, 1.25);
  const min = pinned || 0.7;
  let current = max;
  let frames = 0;
  let since = performance.now();
  return {
    initial: () => current,
    /** Call once per frame; returns a new ratio when it should change. */
    sample(): number | null {
      frames++;
      const now = performance.now();
      if (now - since < 2000) return null;
      const fps = (frames * 1000) / (now - since);
      frames = 0;
      since = now;
      let next = current;
      if (fps < 48) next = Math.max(min, current - 0.1);
      else if (fps > 58.5) next = Math.min(max, current + 0.05);
      if (Math.abs(next - current) < 0.01) return null;
      current = next;
      return current;
    },
  };
})();

export async function createRenderer(canvasHost: HTMLElement) {
  const want = requestedBackend();
  const renderer = new WebGPURenderer({
    antialias: false,
    forceWebGL: want === 'webgl',
    powerPreference: 'high-performance',
  });
  await renderer.init();
  renderer.setPixelRatio(resolution.initial());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = LOOK.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  canvasHost.appendChild(renderer.domElement);

  const backend: Backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl';
  return { renderer, backend };
}
