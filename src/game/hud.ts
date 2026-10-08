import './hud.css';

export type HudView = {
  /** "MISSION 03" or "QUICK GAME". */
  title: string;
  /** The level's name, or a one-line brief. */
  name: string;
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

export type MenuAction = {
  label: string;
  key: string;
  run: () => void;
  /** A second, dimmer line under the label. */
  sub?: string;
  /** Shown on the right in place of the key hint, e.g. "★★☆". */
  badge?: string;
  locked?: boolean;
};

/** A centred card with a title, optional stats and buttons: pause, mission end, and future screens. */
export type MenuView = {
  title: string;
  subtitle?: string;
  tone?: 'win' | 'lose' | 'neutral';
  stats?: [string, string][];
  actions: MenuAction[];
  /** Lay the buttons out in this many columns (a level grid). */
  columns?: number;
  /** Which button is the highlighted default (first by default). */
  primary?: number;
  /** `title`: the main menu, top right over the scene with no scrim. */
  variant?: 'card' | 'title';
  /** An opaque card rather than a see-through one. */
  solid?: boolean;
};

/**
 * QWERTY split in two like a tablet's split keyboard. Each half is a grid of
 * half-key columns; a row starts at a column so the stagger matches a real keyboard.
 */
const KEY_HALVES = [
  { cls: 'kl', cols: 13, rows: [['QWERT', 1], ['ASDFG', 2], ['ZXCVB', 4]] },
  { cls: 'kr', cols: 10, rows: [['YUIOP', 1], ['HJKL', 2], ['NM', 4]] },
] as const;

/** The brand mark, as on the loading screen. */
const LOGO = '<div class="logo">WORD <span>WAR</span></div>';

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
    <div class="keys"></div>`);
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

  const keys = word.querySelector('.keys')!;
  const keyEls = new Map<string, HTMLElement>();
  let letterFn: (letter: string) => void = () => {};
  for (const half of KEY_HALVES) {
    const block = el('div', `kb ${half.cls}`);
    for (const [letters, start] of half.rows) {
      const r = el('div', 'row');
      r.style.gridTemplateColumns = `repeat(${half.cols}, 1fr)`;
      [...letters].forEach((k, i) => {
        const b = el('button', 'key', k);
        b.type = 'button';
        b.style.gridColumn = `${start + i * 2} / span 2`;
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
      });
      block.appendChild(r);
    }
    keys.appendChild(block);
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
      ${LOGO}
      <div class="title"><span class="value">${v.title}</span></div>
      <div class="label brief">${v.name}</div>
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
  let leaveTimer = 0;

  /** Show a menu card, or hide it with null. */
  function menu(v: MenuView | null) {
    clearTimeout(leaveTimer);
    menuEl.classList.remove('leaving');
    menuEl.style.transitionDuration = '';
    root.classList.remove('menu-leaving');
    menuActions = v?.actions ?? [];
    root.classList.toggle('menu-open', !!v);
    root.classList.toggle('title-open', v?.variant === 'title');
    if (!v) return;
    const title = v.variant === 'title';
    menuEl.className = `panel menu ${v.tone ?? 'neutral'}${title ? ' title' : ''}${v.solid ? ' solid' : ''}`;
    menuEl.innerHTML = `
      ${LOGO}
      ${title ? '<div class="tag">NAVAL WORD WARFARE</div>' : `<h2>${v.title}</h2>`}
      ${v.subtitle ? `<div class="label">${v.subtitle}</div>` : ''}
      ${v.stats ? `<dl>${v.stats.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('')}</dl>` : ''}
      <div class="actions"></div>`;
    const box = menuEl.querySelector('.actions')!;
    (box as HTMLElement).style.gridTemplateColumns = v.columns ? `repeat(${v.columns}, 1fr)` : '';
    menuEl.classList.toggle('wide', !!v.columns);
    const primary = v.primary ?? 0;
    v.actions.forEach((a, i) => {
      const b = el('button', `${i === primary && !a.locked ? 'primary' : ''} ${a.locked ? 'locked' : ''}`.trim(),
        `<span class="l">${a.label}${a.sub ? `<small>${a.sub}</small>` : ''}</span><span class="r">${a.locked ? '🔒' : a.badge ?? `<kbd>${a.key}</kbd>`}</span>`);
      b.disabled = !!a.locked;
      b.addEventListener('click', () => a.run());
      box.appendChild(b);
    });
    ((box.querySelectorAll('button')[primary] ?? box.querySelector('button')) as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  /** Fade the open menu out over `seconds`, then close it; its buttons stop working at once. */
  function fadeMenu(seconds = 1) {
    menuActions = [];
    menuEl.querySelectorAll('button').forEach((b) => (b.disabled = true));
    menuEl.style.transitionDuration = `${seconds}s`;
    menuEl.classList.add('leaving');
    root.classList.remove('menu-open');
    root.classList.add('menu-leaving');
    leaveTimer = window.setTimeout(() => {
      menuEl.classList.remove('leaving');
      menuEl.style.transitionDuration = '';
      root.classList.remove('menu-leaving', 'title-open');
    }, seconds * 1000);
  }

  /** Hide the game's panels (menus stay) while a cinematic plays. */
  function cine(on: boolean) {
    root.classList.toggle('cine', on);
  }

  /** Route a key to the open menu; returns true if it was handled. */
  function menuKey(key: string) {
    const k = key === ' ' ? 'Space' : key === 'Escape' ? 'Esc' : key.length === 1 ? key.toUpperCase() : key;
    const hit = menuActions.find((a) => a.key.split('/').map((s) => s.trim()).includes(k));
    hit?.run();
    return menuActions.length > 0;
  }

  /**
   * On a portrait phone the keyboard is docked at the bottom: report the height the
   * camera should keep clear (0 on desktop) so the board is framed above it,
   * and expose the keyboard's height to CSS as --dock for the controls above it.
   */
  function watchDock(fn: (px: number) => void) {
    const compact = window.matchMedia('(max-width: 760px) and (orientation: portrait), (max-height: 520px) and (orientation: landscape)');
    const portrait = window.matchMedia('(max-width: 760px) and (orientation: portrait)');
    const measure = () => {
      // Only the portrait keyboard is a dock; the landscape halves sit in the corners.
      const docked = compact.matches && portrait.matches;
      const dock = docked ? Math.ceil(window.innerHeight - word.getBoundingClientRect().top) + 4 : 0;
      document.documentElement.style.setProperty('--dock', `${dock}px`);
      // In portrait the mode card sits on top of the keyboard.
      fn(docked ? dock + mode.offsetHeight + 8 : 0);
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

  return { render, note, banner, menu, fadeMenu, cine, menuKey, onPause, onCamera, onLetter, ping, watchDock, flash, ready, isMenuOpen: () => menuActions.length > 0 };
}

export type Hud = ReturnType<typeof createHud>;
