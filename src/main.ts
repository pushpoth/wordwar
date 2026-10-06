import { Scene } from 'three/webgpu';
import { createBoard } from './render/board';
import { createHulls } from './render/hulls';
import { SEA } from './render/waves';
import { createCamera, fitFov } from './render/camera';
import { pinnedTime, simTime, tickClock } from './render/clock';
import { createOcean } from './render/ocean';
import { createPost } from './render/post';
import { createRenderer, resolution } from './render/renderer';
import { createSky } from './render/sky';
import { createController } from './game/controller';
import { buildDiorama } from './scene/diorama';
import { LOOK } from './config/look';

declare global {
  interface Window {
    __ww?: { backend: string; frames: number; fps: number };
  }
}

async function boot() {
  const stage = document.getElementById('stage')!;
  const statsEl = document.getElementById('hud-stats')!;
  const params = new URLSearchParams(location.search);
  if (params.has('shot')) document.body.classList.add('shot');

  const { renderer, backend } = await createRenderer(stage);
  const scene = new Scene();
  const { camera, target, update: updateCamera, azimuth } = createCamera(window.innerWidth / window.innerHeight);
  const sky = createSky(scene, renderer);

  SEA.state = Number(params.get('sea') ?? LOOK.seaState);
  const board = createBoard(LOOK.board.size);
  const hulls = createHulls();
  const ocean = createOcean(sky.sun, { board, hulls });
  scene.add(ocean.mesh);

  // `?demo` shows the fixed phase 0 diorama for visual review; otherwise play.
  const world = params.has('demo')
    ? await buildDiorama(scene, board, hulls)
    : await createController(scene, board, hulls);
  ocean.setIslands(world.islands);

  const post = createPost(renderer, scene, camera, camera.position.distanceTo(target));

  // Compile every shader the game can need before the first frame, so the
  // first explosion or wreck doesn't stall while the GPU builds pipelines.
  if ('warmUp' in world) {
    const restore = world.warmUp();
    await renderer.compileAsync(scene, camera);
    restore();
    world.warmDone();
  }

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    fitFov(camera, window.innerWidth / window.innerHeight);
  });

  const state = { backend, frames: 0, fps: 0 };
  window.__ww = state;
  let acc = 0;
  let accFrames = 0;
  let lastStat = performance.now();

  // Cap at 60 fps: high-refresh screens would otherwise double the work (and the heat).
  const fpsCap = Number(params.get('fps')) || 60;
  let lastFrame = 0;
  renderer.setAnimationLoop((frameTime: number) => {
    if (frameTime - lastFrame < 1000 / fpsCap - 2) return;
    lastFrame = frameTime;
    const dt = tickClock();
    updateCamera(dt);
    ocean.update();
    world.update(simTime.value, dt, camera, azimuth());
    post.pipeline.render();
    const ratio = resolution.sample();
    if (ratio !== null) renderer.setPixelRatio(ratio);

    state.frames++;
    accFrames++;
    const now = performance.now();
    acc = now - lastStat;
    if (acc >= 500) {
      state.fps = (accFrames * 1000) / acc;
      accFrames = 0;
      lastStat = now;
      const info = renderer.info.render;
      statsEl.textContent =
        `${backend.toUpperCase()}  ${state.fps.toFixed(0)} fps\n` +
        `${renderer.domElement.width}×${renderer.domElement.height} @${renderer.getPixelRatio().toFixed(2)}  ${info.drawCalls} draws  ${(info.triangles / 1000).toFixed(0)}k tris` +
        (pinnedTime === null ? '\n← → spin   ↑ ↓ tilt' : `\nt pinned ${pinnedTime}s`);
    }
  });
}

boot().catch((err) => {
  console.error(err);
  const el = document.createElement('div');
  el.id = 'boot-error';
  el.textContent = `Word War couldn't start: ${err instanceof Error ? err.message : String(err)}`;
  document.body.appendChild(el);
});
