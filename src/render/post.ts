import { RenderPipeline, type Camera, type Node as TslNode, type Scene, type WebGPURenderer } from 'three/webgpu';
import { Fn, float, length, mix, pass, renderOutput, saturation, screenUV, smoothstep, uniform, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { LOOK } from '../config/look';

/**
 * Scene → tilt-shift depth of field → bloom → tone map → colour grade → SMAA.
 * The grade runs after tone mapping, in display space, like a film LUT.
 */
export function createPost(renderer: WebGPURenderer, scene: Scene, camera: Camera, focusDistance: number) {
  const p = LOOK.post;
  const uniforms = {
    focus: uniform(focusDistance),
    focalLength: uniform(p.dofFocalLength),
    bokeh: uniform(p.dofBokehScale),
    vignette: uniform(p.vignette),
    saturation: uniform(p.saturation),
    warmth: uniform(p.warmth),
  };

  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output');
  const viewZ = scenePass.getViewZNode();

  const blurred = <TslNode<'vec4'>>(<unknown>dof(color, viewZ, uniforms.focus, uniforms.focalLength, uniforms.bokeh));
  const glow = bloom(color, p.bloomStrength, p.bloomRadius, p.bloomThreshold);
  const hdr = blurred.add(glow);

  const grade = Fn(([input]: [TslNode<'vec4'>]) => {
    let c = input.rgb;
    // Split tone: cool teal shadows, warm highlights.
    const lum = c.dot(vec3(0.2126, 0.7152, 0.0722));
    const shadows = vec3(-0.012, 0.004, 0.02);
    const highs = vec3(uniforms.warmth, uniforms.warmth.mul(0.35), uniforms.warmth.negate());
    c = c.add(mix(shadows, highs, smoothstep(0.15, 0.85, lum)));
    c = saturation(c, uniforms.saturation);
    // Vignette.
    const d = length(screenUV.sub(0.5).mul(vec3(1.25, 1.0, 0).xy));
    c = c.mul(mix(float(1), float(1).sub(uniforms.vignette), smoothstep(0.35, 0.95, d)));
    return vec4(c, 1);
  });

  const pipeline = new RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  pipeline.outputNode = smaa(grade(<TslNode<'vec4'>>(<unknown>renderOutput(hdr))));

  return { pipeline, uniforms };
}
