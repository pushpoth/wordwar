import './hud.css';

export type HudView = {
  mission: number;
  seed: number;
  battery: number;
  batteryMax: number;
  torpedoes: number;
  torpedoMax: number;
  score: number;
  mode: 'RADAR' | 'TORPEDO';
  /** The target's letters with their states (1 confirmed hit, 0.5 radar hint, 0 unknown), or null in radar mode. */
  target: { ch: string; state: number }[] | null;
  /** Letters already tried on the target: true for hits, false for misses. */
  tried: Map<string, boolean>;
};

export type MenuAction = { label: string; key: string; run: () => void };

/** A centred card with a title, optional stats and buttons: pause, mission end, and future screens. */
export type MenuView = {
  title: string;
  subtitle?: string;
  tone?: 'win' | 'lose' | 'neutral';
  stats?: [string, string][];
  actions: MenuAction[];
};

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** The game's heads-up display: plain DOM panels over the canvas. */
export function createHud() {
  const root = el('div', 'hud');
  const status = el('div', 'panel status');
  const word = el('div', 'panel word', `
    <div class="head"><div class="letters"></div><div class="len label"></div></div>
    <div class="keys"></div>
    <button type="button" class="kb-side to-left" aria-label="Move the keyboard to the left">◀</button>
    <button type="button" class="kb-side to-right" aria-label="Move the keyboard to the right">▶</button>`);
  const log = el('div', 'panel log');
  const mode = el('div', 'panel mode', '<div class="value"></div><div class="hint"></div>');
  const toast = el('div', 'panel toast', '<div><div class="value"></div><div class="sub"></div></div>');
  const menuEl = el('div', 'panel menu');
  const scrim = el('div', 'scrim');
  const auxBtn = el('button', 'aux-btn', 'LOG');
  auxBtn.type = 'button';
  auxBtn.setAttribute('aria-label', 'Show or hide the sonar and log');
  auxBtn.addEventListener('click', () => root.classList.toggle('show-aux'));
  // Top right: a solid Menu button over one card holding the camera buttons and the sonar dial.
  const side = el('div', 'side');
  const menuBtn = el('button', 'menu-btn', 'Menu');
  menuBtn.type = 'button';
  menuBtn.dataset.act = 'menu';
  menuBtn.title = 'Pause menu (Space)';
  const tools = el('div', 'panel tools', `
    <div class="cam">
      <button type="button" data-act="zoom-out" aria-label="Zoom out">−</button>
      <button type="button" data-act="zoom-in" aria-label="Zoom in">+</button>
      <button type="button" data-act="rotate" aria-label="Rotate the board">⟳</button>
    </div>
    <div class="sonar">
      <svg viewBox="-60 -60 120 120" aria-hidden="true">
        <circle r="55" class="face"/>
        <circle r="40" class="ring"/><circle r="25" class="ring"/><circle r="10" class="ring"/>
        <line x1="-55" x2="55" class="ring"/><line y1="-55" y2="55" class="ring"/>
        <g class="sweep"><path d="M0 0 L55 0 A55 55 0 0 0 47.6 -27.5 Z"/></g>
        <circle r="4" class="ping"/>
      </svg>
      <div class="range"><span class="label">Range</span><span class="value">400m</span></div>
    </div>`);
  side.append(menuBtn, tools);
  const camBtn = (act: string) => side.querySelector<HTMLButtonElement>(`[data-act="${act}"]`)!;
  root.append(status, word, side, log, mode, toast, scrim, menuEl, auxBtn);
  document.body.appendChild(root);

  // Landscape phones: the keyboard can sit in either bottom corner.
  const SIDE_KEY = 'wordwar.keyboardSide';
  const setSide = (left: boolean) => {
    root.classList.toggle('kb-left', left);
    try { localStorage.setItem(SIDE_KEY, left ? 'left' : 'right'); } catch { /* not remembered */ }
  };
  try { root.classList.toggle('kb-left', localStorage.getItem(SIDE_KEY) === 'left'); } catch { /* default right */ }
  word.querySelector('.to-left')!.addEventListener('click', () => setSide(true));
  word.querySelector('.to-right')!.addEventListener('click', () => setSide(false));

  const keys = word.querySelector('.keys')!;
  const keyEls = new Map<string, HTMLElement>();
  let letterFn: (letter: string) => void = () => {};
  for (const row of KEY_ROWS) {
    const r = el('div');
    for (const k of row) {
      const b = el('button', 'key', k);
      b.type = 'button';
      b.setAttribute('aria-label', `Letter ${k}`);
      // Pointer-down fires at once (a click waits for release); keep focus off the key
      // so Space and Enter can't re-press it.
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        letterFn(k);
        flash(k);
      });
      r.appendChild(b);
      keyEls.set(k, b);
    }
    keys.appendChild(r);
  }

  /** Pulse a key, for presses on the physical keyboard as well as taps. */
  function flash(letter: string) {
    const e = keyEls.get(letter);
    if (!e) return;
    e.classList.remove('pulse');
    void e.offsetWidth;
    e.classList.add('pulse');
  }

  const lines: string[] = [];
  let toastTimer = 0;

  function render(v: HudView) {
    const pct = Math.round((v.battery / v.batteryMax) * 100);
    const tpct = Math.round((v.torpedoes / v.torpedoMax) * 100);
    status.innerHTML = `
      <div class="title"><span class="value">MISSION ${String(v.mission).padStart(2, '0')}</span></div>
      <div class="label brief">Sink all enemy units</div>
      <div class="meter"><div class="row"><span class="label">Score</span><span class="value">${v.score}</span></div></div>
      <div class="meter"><div class="row"><span class="label">Battery</span><span class="value">${v.battery}/${v.batteryMax}</span></div>
        <div class="bar ${pct <= 20 ? 'low' : ''}"><i style="width:${pct}%"></i></div></div>
      <div class="meter"><div class="row"><span class="label">Torpedoes</span><span class="value">${v.torpedoes}</span></div>
        <div class="bar ${v.torpedoes <= 5 ? 'low' : ''}"><i style="width:${tpct}%"></i></div></div>`;

    word.querySelector('.letters')!.innerHTML = v.target
      ? v.target.map((l) => (l.state === 1 ? `<b>${l.ch}</b>` : l.state > 0 ? `<em>${l.ch}</em>` : '<b>_</b>')).join('')
      : '—';
    word.querySelector('.len')!.textContent = v.target ? `${v.target.length} letters` : '';
    for (const [k, e] of keyEls) {
      const t = v.tried.get(k);
      e.classList.toggle('hit', t === true);
      e.classList.toggle('miss', t === false);
    }

    mode.className = `panel mode ${v.mode === 'TORPEDO' ? 'torpedo' : 'radar'}`;
    mode.querySelector('.value')!.textContent = v.mode === 'TORPEDO' ? 'TORPEDO' : 'RADAR';
    mode.querySelector('.hint')!.textContent = v.mode === 'TORPEDO'
      ? 'Type every letter (amber = radar hint) · Tab next target · Esc radar'
      : 'Type a letter to ping · ← → ↑ ↓ camera';
  }

  function note(text: string) {
    const d = new Date();
    const ts = d.toTimeString().slice(0, 8);
    lines.push(`<div><time>${ts}</time>${text}</div>`);
    while (lines.length > 6) lines.shift();
    log.innerHTML = lines.join('');
  }

  function banner(title: string, sub = '') {
    toast.querySelector('.value')!.textContent = title;
    toast.querySelector('.sub')!.textContent = sub;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
  }

  let menuActions: MenuAction[] = [];

  /** Show a menu card, or hide it with null. */
  function menu(v: MenuView | null) {
    menuActions = v?.actions ?? [];
    root.classList.toggle('menu-open', !!v);
    if (!v) return;
    menuEl.className = `panel menu ${v.tone ?? 'neutral'}`;
    menuEl.innerHTML = `
      <h2>${v.title}</h2>
      ${v.subtitle ? `<div class="label">${v.subtitle}</div>` : ''}
      ${v.stats ? `<dl>${v.stats.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('')}</dl>` : ''}
      <div class="actions"></div>`;
    const box = menuEl.querySelector('.actions')!;
    v.actions.forEach((a, i) => {
      const b = el('button', i === 0 ? 'primary' : '', `${a.label}<kbd>${a.key}</kbd>`);
      b.addEventListener('click', () => a.run());
      box.appendChild(b);
    });
    (box.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  /** Route a key to the open menu; returns true if it was handled. */
  function menuKey(key: string) {
    const k = key === ' ' ? 'Space' : key === 'Escape' ? 'Esc' : key.length === 1 ? key.toUpperCase() : key;
    const hit = menuActions.find((a) => a.key.split('/').map((s) => s.trim()).includes(k));
    hit?.run();
    return menuActions.length > 0;
  }

  /**
   * On phones the keyboard is docked at the bottom: report the height the
   * camera should keep clear (0 on desktop) so the board is framed above it,
   * and expose the keyboard's height to CSS as --dock for the controls above it.
   */
  function watchDock(fn: (px: number) => void) {
    const compact = window.matchMedia('(max-width: 760px) and (orientation: portrait), (max-height: 520px) and (orientation: landscape)');
    const portrait = window.matchMedia('(max-width: 760px) and (orientation: portrait)');
    const measure = () => {
      const dock = compact.matches ? Math.ceil(window.innerHeight - word.getBoundingClientRect().top) + 4 : 0;
      document.documentElement.style.setProperty('--dock', `${dock}px`);
      // In portrait the mode card sits on top of the keyboard.
      fn(dock + (compact.matches && portrait.matches ? mode.offsetHeight + 8 : 0));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(word);
    ro.observe(mode);
    compact.addEventListener('change', measure);
    window.addEventListener('resize', measure);
    measure();
  }

  /** A radar ping went out: pulse the dial. */
  function ping() {
    const p = tools.querySelector('.ping')!;
    p.classList.remove('go');
    void (p as unknown as HTMLElement).getBoundingClientRect();
    p.classList.add('go');
  }

  function onLetter(fn: (letter: string) => void) {
    letterFn = fn;
  }

  function onPause(fn: () => void) {
    camBtn('menu').addEventListener('click', fn);
  }

  /** Camera buttons: zoom out and in, rotate a quarter turn. */
  function onCamera(c: { zoomIn: () => void; zoomOut: () => void; rotate: () => void }) {
    camBtn('zoom-in').addEventListener('click', c.zoomIn);
    camBtn('zoom-out').addEventListener('click', c.zoomOut);
    camBtn('rotate').addEventListener('click', c.rotate);
  }

  /** Reveal the HUD once the scene is ready (it stays hidden behind the loader). */
  function ready() {
    root.classList.add('ready');
  }

  return { render, note, banner, menu, menuKey, onPause, onCamera, onLetter, ping, watchDock, flash, ready, isMenuOpen: () => menuActions.length > 0 };
}

export type Hud = ReturnType<typeof createHud>;
