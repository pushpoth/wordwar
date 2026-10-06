/**
 * The loading screen: a progress bar over the stage until the first frame is
 * drawn. Progress is reported in stages with weights, so the bar moves at a
 * steady pace even though shader compilation can't report its own progress.
 */
export function createLoader() {
  const el = document.getElementById('loader');
  const bar = el?.querySelector<HTMLElement>('.bar i');
  const label = el?.querySelector<HTMLElement>('.stage');
  let shown = 0;
  let creep = 0;

  function set(fraction: number, text?: string) {
    shown = Math.max(shown, Math.min(1, fraction));
    if (bar) bar.style.width = `${(shown * 100).toFixed(1)}%`;
    if (text && label) label.textContent = text;
  }

  /** Inch forward toward `ceiling` while a long step (like shader compilation) runs. */
  function creepTo(ceiling: number) {
    clearInterval(creep);
    creep = window.setInterval(() => set(shown + (ceiling - shown) * 0.08), 120);
  }

  function done() {
    clearInterval(creep);
    set(1);
    el?.classList.add('done');
    window.setTimeout(() => el?.remove(), 700);
  }

  return { set, creepTo, done };
}
