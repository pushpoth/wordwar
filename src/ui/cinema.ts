import type { Cinema } from '../render/camera';

/**
 * The letterbox bars and the fade to black that camera shots drive (see
 * `Pose.fade` and `Pose.bars`). They sit over the scene but under the HUD, so
 * a dip to black never hides a menu.
 */
export function createCinema() {
  const root = document.createElement('div');
  root.className = 'cinema';
  root.innerHTML = '<i class="bar top"></i><i class="bar bottom"></i><div class="fade"></div>';
  document.body.appendChild(root);
  const fade = root.querySelector<HTMLElement>('.fade')!;

  function set(c: Cinema) {
    root.style.setProperty('--bars', c.bars.toFixed(4));
    fade.style.opacity = c.fade.toFixed(4);
  }
  set({ fade: 0, bars: 0 });
  return { set };
}
