import { describe, expect, it } from 'vitest';
import { LEVELS } from '../config/campaign';
import { simulate } from './bot';

describe('balance bot', () => {
  // Fewer seeds than `npm run balance`, to keep the suite quick.
  const stats = LEVELS.map((l) => ({ level: l, expert: simulate(l, 'expert', 40), average: simulate(l, 'average', 40), novice: simulate(l, 'novice', 40) }));

  it.each(stats.map((s) => [s.level.id, s] as const))('level %i can be won by a good player, usually by an average one', (_id, s) => {
    expect(s.expert.winRate).toBeGreaterThanOrEqual(0.9);
    expect(s.average.winRate).toBeGreaterThanOrEqual(0.7);
  });

  it('is harder for a guesser on the last level than the first', () => {
    expect(stats[stats.length - 1].novice.winRate).toBeLessThan(stats[0].novice.winRate);
  });

  it('gives a good player at least two stars on average, and a guesser fewer than a good player', () => {
    for (const s of stats) {
      expect(s.expert.stars).toBeGreaterThanOrEqual(2);
      expect(s.novice.stars).toBeLessThanOrEqual(s.expert.stars);
    }
  });
});
