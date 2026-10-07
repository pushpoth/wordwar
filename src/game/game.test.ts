import { describe, expect, it } from 'vitest';
import { createGame, DEFAULT_MISSION, restoreGame } from './game';

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

  it('restores a mission exactly from its save', () => {
    const game = createGame(DEFAULT_MISSION, 4242);
    for (const l of 'EASTRO') {
      game.tick(700);
      if (game.state.mode === 'TORPEDO') game.torpedo(l);
      else game.radar(l);
    }
    game.tick(1234);
    const back = restoreGame(JSON.parse(JSON.stringify(game.save())));
    const view = (g: typeof game) => JSON.stringify({
      tiles: g.state.grid.tiles.flat().map((t) => t.revealed),
      units: g.state.units.map((u) => [u.destroyed, [...u.revealedLetters].sort()]),
      mode: g.state.mode, active: g.state.activeUnitId, battery: g.state.battery,
      torpedoes: g.state.torpedoes, score: g.state.score, elapsed: g.state.elapsedMs,
    });
    expect(view(back)).toBe(view(game));
  });

  it('restores a mission where the player picked a target by id', () => {
    const game = createGame(DEFAULT_MISSION, 4242);
    for (let i = 0; i < 40 && game.state.discoveredUnitsQueue.length < 2; i++) {
      game.tick(game.state.config.batteryRegenSeconds * 1000);
      game.radar('EASTRO'[i % 6]);
    }
    const queue = game.state.discoveredUnitsQueue;
    expect(queue.length).toBeGreaterThan(1);
    game.torpedo('Q'); // enters torpedo mode on the first ship
    game.selectTarget(queue[1]);
    expect(game.state.activeUnitId).toBe(queue[1]);
    const back = restoreGame(JSON.parse(JSON.stringify(game.save())));
    expect(back.state.activeUnitId).toBe(queue[1]);
  });
});
