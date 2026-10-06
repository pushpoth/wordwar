import { describe, expect, it } from 'vitest';
import { createGame, DEFAULT_MISSION } from './game';

/** Plays a mission perfectly: ping each ship's letters until found, then type its word. */
function solve(seed: number) {
  const game = createGame(DEFAULT_MISSION, seed);
  for (let guard = 0; guard < 500 && game.state.outcome === 'in_progress'; guard++) {
    const st = game.state;
    const active = game.unit(st.activeUnitId);
    if (st.mode === 'TORPEDO' && active && !active.destroyed) {
      const next = [...active.word].find((ch, i) => !active.revealedLetters.has(i) && !active.triedLetters.has(ch));
      if (next) {
        game.torpedo(next);
        continue;
      }
    }
    const hidden = st.units.find((u) => !u.destroyed);
    if (!hidden) break;
    if (st.battery < 1) game.tick(st.config.batteryRegenSeconds * 1000);
    if (st.mode === 'TORPEDO') game.toRadar();
    game.radar(hidden.word[Math.floor(guard / 3) % hidden.word.length]);
  }
  return game;
}

describe('game façade', () => {
  it('can be won by sinking every ship', () => {
    const game = solve(4242);
    expect(game.state.outcome).toBe('success');
    expect(game.summary().unitsDestroyed).toBe(DEFAULT_MISSION.unitCount);
  });

  it('builds the same board for the same seed', () => {
    const a = createGame(DEFAULT_MISSION, 77).state.units.map((u) => u.word + u.origin.x + u.origin.y);
    const b = createGame(DEFAULT_MISSION, 77).state.units.map((u) => u.word + u.origin.x + u.origin.y);
    expect(a).toEqual(b);
  });
});
