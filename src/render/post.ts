import { RenderPipeline, type Camera, type Node as TslNode, type Scene, type WebGPURenderer } from 'three/webgpu';
import { Fn, abs, float, length, mix, pass, renderOutput, saturation, screenUV, smoothstep, uniform, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { LOOK } from '../config/look';
import { tune } from '../config/tunables';

type N4 = TslNode<'vec4'>;

/**
 * Scene → blur → bloom → tone map → colour grade → SMAA. The grade runs after
 * tone mapping, in display space, like a film LUT.
 *
 * Two kinds of miniature blur, both tunable: depth of field (true focus by
 * distance; the expensive one) and an edge blur (screen-space, softens toward
 * the top and bottom; cheap, used on phones). Turning either expensive pass off
 * rebuilds the chain without it, so it costs nothing.
 */
export function createPost(renderer: WebGPURenderer, scene: Scene, camera: Camera, focusDistance: number) {
  const u = {
    focus: uniform(focusDistance + tune.get('post.focusOffset')),
    focalLength: uniform(tune.get('post.dofRange')),
    bokeh: uniform(tune.get('post.dofBokeh')),
    edgeBlur: uniform(tune.get('post.edgeBlur')),
    edgeBand: uniform(tune.get('post.edgeBand')),
    edgeCenter: uniform(tune.get('post.edgeCenter')),
    edgeRamp: uniform(0.28),
    vignette: uniform(tune.get('post.vignette')),
    saturation: uniform(tune.get('post.saturation')),
    warmth: uniform(tune.get('post.warmth')),
  };
  let baseFocus = focusDistance;

  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output') as unknown as N4;
  const viewZ = scenePass.getViewZNode();

  const grade = Fn(([input]: [N4]) => {
    let c = input.rgb;
    // Split tone: cool teal shadows, warm highlights.
    const lum = c.dot(vec3(0.2126, 0.7152, 0.0722));
    const shadows = vec3(-0.012, 0.004, 0.02);
    const highs = vec3(u.warmth, u.warmth.mul(0.35), u.warmth.negate());
    c = c.add(mix(shadows, highs, smoothstep(0.15, 0.85, lum)));
    c = saturation(c, u.saturation);
    const d = length(screenUV.sub(0.5).mul(vec3(1.25, 1.0, 0).xy));
    c = c.mul(mix(float(1), float(1).sub(u.vignette), smoothstep(0.35, 0.95, d)));
    return vec4(c, 1);
  });

  let glow: ReturnType<typeof bloom> | null = null;
  const pipeline = new RenderPipeline(renderer);
  pipeline.outputColorTransform = false;

  function build() {
    let hdr: N4 = color;
    if (tune.get<boolean>('quality.depthOfField')) {
      hdr = dof(color, viewZ, u.focus, u.focalLength, u.bokeh) as unknown as N4;
    }
    if (tune.get('post.edgeBlur') > 0) {
      const soft = gaussianBlur(hdr, 2.2, 4, { resolutionScale: 0.5 }) as unknown as N4;
      const off = abs(screenUV.y.sub(u.edgeCenter));
      const mask = smoothstep(u.edgeBand, u.edgeBand.add(u.edgeRamp), off).mul(u.edgeBlur).min(1);
      hdr = mix(hdr, soft, mask);
    }
    if (tune.get<boolean>('quality.bloom')) {
      glow = bloom(color, tune.get('post.bloomStrength'), LOOK.post.bloomRadius, tune.get('post.bloomThreshold'));
      hdr = hdr.add(glow) as unknown as N4;
    } else {
      glow = null;
    }
    const graded = grade(renderOutput(hdr) as unknown as N4);
    // SMAA is three full-screen passes; FXAA (phones) is one.
    const aa = tune.get<string>('quality.antialias');
    pipeline.outputNode = aa === 'smaa' ? smaa(graded) : aa === 'fxaa' ? fxaa(graded) : graded;
    pipeline.needsUpdate = true;
  }
  build();

  // Structural switches rebuild the chain; everything else is a uniform.
  tune.onAny(['quality.depthOfField', 'quality.bloom', 'quality.antialias'], build);
  let edgeOn = tune.get('post.edgeBlur') > 0;
  tune.on('post.edgeBlur', (v) => {
    u.edgeBlur.value = v as number;
    if ((v as number) > 0 !== edgeOn) {
      edgeOn = (v as number) > 0;
      build();
    }
  });
  const bind = (key: string, set: (v: number) => void) => tune.on(key, (v) => set(v as number));
  bind('post.dofRange', (v) => (u.focalLength.value = v));
  bind('post.dofBokeh', (v) => (u.bokeh.value = v));
  bind('post.focusOffset', (v) => (u.focus.value = baseFocus + v));
  bind('post.edgeBand', () => setHorizon(horizon));
  bind('post.edgeCenter', () => setHorizon(horizon));
  bind('post.vignette', (v) => (u.vignette.value = v));
  bind('post.saturation', (v) => (u.saturation.value = v));
  bind('post.warmth', (v) => (u.warmth.value = v));
  bind('post.bloomStrength', (v) => { if (glow) glow.strength.value = v; });
  bind('post.bloomThreshold', (v) => { if (glow) glow.threshold.value = v; });
  bind('post.exposure', (v) => (renderer.toneMappingExposure = v));
  renderer.toneMappingExposure = tune.get('post.exposure');

  /**
   * How much the view looks out to the horizon (0 down at the board, 1 level):
   * the edge blur's sharp band slides down and narrows so the horizon, a third
   * of the way down the screen, goes soft. Depth of field does this by itself.
   */
  let horizon = 0;
  function setHorizon(a: number) {
    horizon = a;
    const lerp = (x: number, y: number) => x + (y - x) * a;
    u.edgeCenter.value = lerp(tune.get('post.edgeCenter'), 0.36);
    u.edgeBand.value = lerp(tune.get('post.edgeBand'), 0.2);
    u.edgeRamp.value = lerp(0.28, 0.1);
  }

  /** The camera moved: keep the board in focus. */
  function setFocusDistance(d: number) {
    baseFocus = d;
    u.focus.value = d + tune.get('post.focusOffset');
  }

  return { pipeline, uniforms: u, setFocusDistance, setHorizon };
}
