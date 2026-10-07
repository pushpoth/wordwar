import { describe, expect, it, vi } from 'vitest';
import { dispatch, keyIntent, type Intents } from './input';

describe('keyIntent', () => {
  it('maps letters to upper-case letter intents', () => {
    expect(keyIntent('a')).toEqual({ k: 'letter', letter: 'A' });
    expect(keyIntent('Q')).toEqual({ k: 'letter', letter: 'Q' });
  });
  it('ignores held-down letters', () => {
    expect(keyIntent('a', true)).toBeNull();
  });
  it('maps control keys', () => {
    expect(keyIntent(' ')).toEqual({ k: 'pause' });
    expect(keyIntent('Tab')).toEqual({ k: 'next-target' });
    expect(keyIntent('Escape')).toEqual({ k: 'to-radar' });
  });
  it('ignores everything else, including arrows and digits', () => {
    for (const k of ['ArrowLeft', '1', '[', 'Enter', 'Shift']) expect(keyIntent(k)).toBeNull();
  });
});

describe('dispatch', () => {
  it('calls the matching handler with its argument', () => {
    const h: Intents = { letter: vi.fn(), nextTarget: vi.fn(), selectTarget: vi.fn(), toRadar: vi.fn(), pause: vi.fn() };
    dispatch(h, { k: 'letter', letter: 'Z' });
    dispatch(h, { k: 'select-target', id: 'u2' });
    dispatch(h, { k: 'pause' });
    expect(h.letter).toHaveBeenCalledWith('Z');
    expect(h.selectTarget).toHaveBeenCalledWith('u2');
    expect(h.pause).toHaveBeenCalledOnce();
    expect(h.nextTarget).not.toHaveBeenCalled();
  });
});
