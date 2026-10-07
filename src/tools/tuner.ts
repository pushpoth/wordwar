import { Pane } from 'tweakpane';
import { KNOBS, QUALITY, tune } from '../config/tunables';

const css = `
.ww-tuner { position: fixed; top: 64px; right: 16px; width: 300px; max-height: calc(100vh - 80px); overflow-y: auto; z-index: 20; display: none; }
.ww-tuner.open { display: block; }
.ww-tuner-btn {
  position: fixed; right: 196px; top: 16px; z-index: 20; width: 40px; height: 40px; border-radius: 50%;
  border: 1px solid rgba(150,190,210,0.22); background: rgba(8,18,26,0.72); color: #dbe8ef; font-size: 18px; cursor: pointer;
}
.ww-tuner-btn.dirty::after { content: ''; position: absolute; right: 4px; top: 4px; width: 8px; height: 8px; border-radius: 50%; background: #f2b33d; }
@media (max-width: 760px) and (orientation: portrait), (max-height: 520px) and (orientation: landscape) { .ww-tuner-btn { right: calc(max(8px, env(safe-area-inset-right)) + 164px); top: max(8px, env(safe-area-inset-top)); } }
.ww-tuner .note { font: 11px ui-monospace, monospace; color: #8ea6b4; padding: 4px 8px 8px; }
`;

/**
 * Dev tuner (`?tune`, always on in `npm run dev`): one Tweakpane folder per
 * group in `KNOBS`. Change things, then "Copy changes" and paste into chat to
 * make them the new defaults. ↻ = applies on mission restart, ⟳ = on reload.
 */
export function mountTuner() {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const host = document.createElement('div');
  host.className = 'ww-tuner';
  document.body.appendChild(host);
  const btn = document.createElement('button');
  btn.className = 'ww-tuner-btn';
  btn.textContent = '⚙';
  btn.title = 'Tuner';
  document.body.appendChild(btn);
  btn.addEventListener('click', () => host.classList.toggle('open'));

  const pane = new Pane({ container: host, title: `Tuner · ${QUALITY} tier` });
  const note = document.createElement('div');
  note.className = 'note';
  host.appendChild(note);

  const markDirty = () => {
    const n = Object.keys(tune.changes()).length;
    btn.classList.toggle('dirty', n > 0);
    note.textContent = `${n} changed · ↻ restart · ⟳ reload · hover a control for help`;
  };

  pane.addButton({ title: 'Copy changes for chat' }).on('click', async () => {
    const text = tune.report();
    try {
      await navigator.clipboard.writeText(text);
      note.textContent = 'Copied. Paste it into chat.';
    } catch {
      window.prompt('Copy this into chat:', text);
    }
  });
  pane.addButton({ title: '↻ Restart mission' }).on('click', () => window.dispatchEvent(new Event('ww:restart')));
  pane.addButton({ title: '⟳ Reload page' }).on('click', () => location.reload());

  const model: Record<string, number | boolean | string> = {};
  for (const [group, knobs] of Object.entries(KNOBS)) {
    const folder = pane.addFolder({ title: group, expanded: group === 'Quality' });
    for (const k of knobs) {
      model[k.key] = tune.get(k.key);
      const suffix = k.apply === 'restart' ? ' ↻' : k.apply === 'reload' ? ' ⟳' : '';
      const binding = folder.addBinding(model, k.key, {
        label: k.label + suffix,
        ...(k.options ? { options: k.options } : {}),
        ...(k.min !== undefined ? { min: k.min, max: k.max, step: k.step } : {}),
      });
      binding.on('change', (ev) => {
        tune.set(k.key, ev.value as number | boolean | string);
        markDirty();
      });
      if (k.hint) binding.element.title = k.hint;
    }
    folder.addButton({ title: `Reset ${group.toLowerCase()}` }).on('click', () => {
      tune.reset(knobs.map((k) => k.key));
      for (const k of knobs) model[k.key] = tune.get(k.key);
      pane.refresh();
      markDirty();
    });
  }

  pane.addButton({ title: 'Reset everything' }).on('click', () => {
    tune.reset();
    for (const key of Object.keys(model)) model[key] = tune.get(key);
    pane.refresh();
    markDirty();
  });

  markDirty();
}
