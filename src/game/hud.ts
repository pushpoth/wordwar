import './hud.css';

/** Letter states: 1 confirmed hit, 0.5 radar hint (still to be torpedoed), 0 unknown. */
export type IntelRow = { length: number; revealed: number[]; sunk: boolean; active: boolean };

export type HudView = {
  mission: number;
  seed: number;
  battery: number;
  batteryMax: number;
  torpedoes: number;
  torpedoMax: number;
  score: number;
  mode: 'RADAR' | 'TORPEDO';
  /** The target's letters with their states, or null in radar mode. */
  target: { ch: string; state: number }[] | null;
  /** Letters already tried on the target: true for hits, false for misses. */
  tried: Map<string, boolean>;
  intel: IntelRow[];
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
  const intel = el('div', 'panel intel', '<div class="label">Target intel</div><ul></ul><div class="empty">No contacts. Type a letter to ping.</div>');
  const word = el('div', 'panel word', '<div class="label">Word progress</div><div class="letters"></div><div class="keys"></div>');
  const log = el('div', 'panel log');
  const mode = el('div', 'panel mode', '<div class="value"></div><div class="hint"></div>');
  const toast = el('div', 'panel toast', '<div><div class="value"></div><div class="sub"></div></div>');
  const menuEl = el('div', 'panel menu');
  const scrim = el('div', 'scrim');
  const pauseBtn = el('button', 'pause-btn', '❚❚');
  pauseBtn.title = 'Pause (Space)';
  pauseBtn.setAttribute('aria-label', 'Pause');
  root.append(status, intel, word, log, mode, toast, scrim, menuEl, pauseBtn);
  document.body.appendChild(root);

  const keys = word.querySelector('.keys')!;
  const keyEls = new Map<string, HTMLElement>();
  for (const row of KEY_ROWS) {
    const r = el('div');
    for (const k of row) {
      const s = el('span', '', k);
      r.appendChild(s);
      keyEls.set(k, s);
    }
    keys.appendChild(r);
  }

  const lines: string[] = [];
  let toastTimer = 0;

  function render(v: HudView) {
    const pct = Math.round((v.battery / v.batteryMax) * 100);
    const tpct = Math.round((v.torpedoes / v.torpedoMax) * 100);
    status.innerHTML = `
      <div class="title"><span class="value">MISSION ${String(v.mission).padStart(2, '0')}</span><span class="label">Score ${v.score}</span></div>
      <div class="label">Sink all enemy units · seed ${v.seed}</div>
      <div class="meter"><div class="row"><span class="label">Battery</span><span class="value">${v.battery}/${v.batteryMax}</span></div>
        <div class="bar ${pct <= 20 ? 'low' : ''}"><i style="width:${pct}%"></i></div></div>
      <div class="meter"><div class="row"><span class="label">Torpedoes</span><span class="value">${v.torpedoes}</span></div>
        <div class="bar ${v.torpedoes <= 5 ? 'low' : ''}"><i style="width:${tpct}%"></i></div></div>`;

    const ul = intel.querySelector('ul')!;
    ul.innerHTML = v.intel.map((r) => `
      <li class="${r.active ? 'active' : ''} ${r.sunk ? 'sunk' : ''}">
        <span>??? · ${r.length} LETTERS</span>
        <span class="boxes">${r.revealed.map((on) => `<i class="${on === 1 ? 'on' : on > 0 ? 'hint' : ''}"></i>`).join('')}</span>
      </li>`).join('');
    (intel.querySelector('.empty') as HTMLElement).style.display = v.intel.length ? 'none' : 'block';

    word.querySelector('.letters')!.innerHTML = v.target
      ? v.target.map((l) => (l.state === 1 ? `<b>${l.ch}</b>` : l.state > 0 ? `<em>${l.ch}</em>` : '<b>_</b>')).join('')
      : '—';
    for (const [k, e] of keyEls) {
      const t = v.tried.get(k);
      e.className = t === undefined ? '' : t ? 'hit' : 'miss';
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

  function onPause(fn: () => void) {
    pauseBtn.addEventListener('click', fn);
  }

  /** Reveal the HUD once the scene is ready (it stays hidden behind the loader). */
  function ready() {
    root.classList.add('ready');
  }

  return { render, note, banner, menu, menuKey, onPause, ready, isMenuOpen: () => menuActions.length > 0 };
}

export type Hud = ReturnType<typeof createHud>;
