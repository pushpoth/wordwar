import { ACESFilmicToneMapping, PCFSoftShadowMap, WebGPURenderer } from 'three/webgpu';
import { LOOK } from '../config/look';
import { tune } from '../config/tunables';
import { createResolution } from './resolution';

export type Backend = 'webgpu' | 'webgl';

/** `?backend=webgl` forces the WebGL 2 backend; otherwise WebGPU when available. */
export function requestedBackend(): Backend | 'auto' {
  const b = new URLSearchParams(location.search).get('backend');
  return b === 'webgl' || b === 'webgpu' ? b : 'auto';
}

/**
 * Render resolution as a multiple of CSS pixels. Retina screens would otherwise
 * render (and post-process) 4× the pixels for little visible gain under the
 * blur. Adapts to frame rate between the tuner's min and max (see
 * `resolution.ts`); `?dpr=` pins it.
 */
export const resolution = (() => {
  const pinned = Number(new URLSearchParams(location.search).get('dpr')) || 0;
  const max = () => pinned || Math.min(window.devicePixelRatio, tune.get('quality.maxResolution'));
  const min = () => pinned || Math.min(max(), tune.get('quality.minResolution'));
  // Start where this device settled last time, so a reload doesn't search again (not when pinned).
  const KEY = 'wordwar.resolution';
  let saved = 0;
  try { saved = pinned ? 0 : Number(localStorage.getItem(KEY)) || 0; } catch { /* storage blocked */ }
  const r = createResolution({ min, max }, undefined, saved || undefined);
  const remember = (v: number | null) => {
    if (v !== null && !pinned) try { localStorage.setItem(KEY, String(v)); } catch { /* ignore */ }
    return v;
  };
  return {
    initial: () => r.current, settle: r.settle,
    reset: () => remember(r.reset())!,
    sample: (fpsCap: number) => remember(r.sample(fpsCap)),
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
