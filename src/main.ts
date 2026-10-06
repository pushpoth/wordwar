import { Scene } from 'three/webgpu';
import { createBoard } from './render/board';
import { createCamera, fitFov } from './render/camera';
import { pinnedTime, simTime, tickClock } from './render/clock';
import { createOcean } from './render/ocean';
import { createPost } from './render/post';
import { createRenderer } from './render/renderer';
import { createSky } from './render/sky';
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
  const { camera, target } = createCamera(window.innerWidth / window.innerHeight);
  const sky = createSky(scene, renderer);

  const board = createBoard(LOOK.board.size);
  const ocean = createOcean(sky.sun, board);
  scene.add(ocean.mesh);

  const diorama = await buildDiorama(scene, board);
  ocean.setIslands(diorama.islands);

  const post = createPost(renderer, scene, camera, camera.position.distanceTo(target));

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    fitFov(camera, window.innerWidth / window.innerHeight);
  });

  const state = { backend, frames: 0, fps: 0 };
  window.__ww = state;
  let acc = 0;
  let accFrames = 0;
  let lastStat = performance.now();

  renderer.setAnimationLoop(() => {
    tickClock();
    diorama.update(simTime.value, camera);
    post.pipeline.render();

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
        `${renderer.domElement.width}×${renderer.domElement.height}  ${info.drawCalls} draws  ${(info.triangles / 1000).toFixed(0)}k tris` +
        (pinnedTime === null ? '' : `\nt pinned ${pinnedTime}s`);
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
