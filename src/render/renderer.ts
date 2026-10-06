import { ACESFilmicToneMapping, PCFSoftShadowMap, WebGPURenderer } from 'three/webgpu';
import { LOOK } from '../config/look';
import { tune } from '../config/tunables';

export type Backend = 'webgpu' | 'webgl';

/** `?backend=webgl` forces the WebGL 2 backend; otherwise WebGPU when available. */
export function requestedBackend(): Backend | 'auto' {
  const b = new URLSearchParams(location.search).get('backend');
  return b === 'webgl' || b === 'webgpu' ? b : 'auto';
}

/**
 * Render resolution as a multiple of CSS pixels. Retina screens would otherwise
 * render (and post-process) 4× the pixels for little visible gain under the
 * blur. Adapts to frame rate between the tuner's min and max: steps down
 * quickly when frames run slow, steps up only after a long stretch of headroom,
 * because every change reallocates every screen-sized buffer. `?dpr=` pins it.
 */
export const resolution = (() => {
  const pinned = Number(new URLSearchParams(location.search).get('dpr')) || 0;
  const max = () => pinned || Math.min(window.devicePixelRatio, tune.get('quality.maxResolution'));
  const min = () => pinned || Math.min(max(), tune.get('quality.minResolution'));
  let current = max();
  let frames = 0;
  let since = performance.now();
  let lastDrop = -1e9;
  let goodWindows = 0;
  const WINDOW_MS = 2000;
  return {
    initial: () => current,
    /** Back to the top of the range (after the tuner changes it). */
    reset() {
      current = max();
      goodWindows = 0;
      return current;
    },
    /** Call once per frame with the frame cap; returns a new ratio when it should change. */
    sample(fpsCap: number): number | null {
      frames++;
      const now = performance.now();
      if (now - since < WINDOW_MS) return null;
      const fps = (frames * 1000) / (now - since);
      frames = 0;
      since = now;
      let next = current;
      if (fps < fpsCap * 0.8) {
        next = Math.max(min(), current - 0.1);
        lastDrop = now;
        goodWindows = 0;
      } else if (fps > fpsCap * 0.97) {
        goodWindows++;
        // Step up only after ~10 s of headroom and 20 s after the last drop.
        if (goodWindows >= 5 && now - lastDrop > 20000) {
          next = Math.min(max(), current + 0.05);
          goodWindows = 0;
        }
      } else {
        goodWindows = 0;
      }
      next = Math.round(next * 20) / 20;
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
