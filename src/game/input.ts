/** What the player can ask for. Keyboard, on-screen keys and taps all produce these. */
export type Intent =
  | { k: 'letter'; letter: string }
  | { k: 'next-target' }
  | { k: 'select-target'; id: string }
  | { k: 'to-radar' }
  | { k: 'pause' };

/** The game side of input: one handler per intent. */
export type Intents = {
  letter: (letter: string) => void;
  nextTarget: () => void;
  selectTarget: (id: string) => void;
  toRadar: () => void;
  pause: () => void;
};

export function dispatch(intents: Intents, i: Intent) {
  switch (i.k) {
    case 'letter': return intents.letter(i.letter);
    case 'next-target': return intents.nextTarget();
    case 'select-target': return intents.selectTarget(i.id);
    case 'to-radar': return intents.toRadar();
    case 'pause': return intents.pause();
  }
}

/** Map a physical key to an intent. Letters are always game input, never shortcuts. */
export function keyIntent(key: string, repeat = false): Intent | null {
  if (key === ' ') return { k: 'pause' };
  if (key === 'Tab') return { k: 'next-target' };
  if (key === 'Escape') return { k: 'to-radar' };
  if (/^[a-zA-Z]$/.test(key) && !repeat) return { k: 'letter', letter: key.toUpperCase() };
  return null;
}

type KeyHooks = {
  /** Offer a key to an open menu; true if a menu consumed it. */
  menuKey: (key: string) => boolean;
  menuOpen: () => boolean;
  /** True once the mission is over: only menus react then. */
  ended: () => boolean;
  /** Called for every accepted letter, so the on-screen key can pulse. */
  onLetter?: (letter: string) => void;
};

/** Listen to the physical keyboard and feed the intents. Returns a remover. */
export function installKeyboard(intents: Intents, hooks: KeyHooks) {
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement | null)?.closest?.('.tp-dfwv, input, textarea')) return; // typing in the tuner
    if (hooks.menuOpen()) {
      if (hooks.menuKey(e.key)) e.preventDefault();
      return;
    }
    if (hooks.ended()) return;
    const intent = keyIntent(e.key, e.repeat);
    if (!intent) return;
    if (e.key === ' ' || e.key === 'Tab') e.preventDefault();
    if (intent.k === 'letter') hooks.onLetter?.(intent.letter);
    dispatch(intents, intent);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
