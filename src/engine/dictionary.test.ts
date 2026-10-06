import { describe, it, expect } from 'vitest';
import { getMostCommonLetter, redistributeWeights, pickWords } from './dictionary';
import { mulberry32 } from './rng';

describe('Word Dictionary', () => {
  it('getMostCommonLetter returns the most common letter with alphabetical tie-breaking', () => {
    expect(getMostCommonLetter('SEA')).toBe('A'); // S:1, E:1, A:1 -> A (alphabetical first)
    expect(getMostCommonLetter('TEST')).toBe('T'); // T:2, E:1, S:1 -> T (most frequent)
    expect(getMostCommonLetter('BANANA')).toBe('A'); // B:1, A:3, N:2 -> A (most frequent)
    expect(getMostCommonLetter('SEASHELL')).toBe('E'); // S:2, E:2, L:2, A:1, H:1 -> E (alphabetical first among ties)
    expect(getMostCommonLetter('')).toBe('');
  });

  it('redistributeWeights redistributes weights of exhausted tiers to nearest available', () => {
    const baseWeights = { 1: 0.1, 2: 0.2, 3: 0.4, 4: 0.2, 5: 0.1 };

    // Case 1: Tier 3 is exhausted. 3's weight (0.4) is split between 2 and 4 (dist 1 to both)
    const byTier1 = new Map<number, any[]>([
      [1, [{ text: 'A' }]],
      [2, [{ text: 'B' }]],
      [3, []], // exhausted
      [4, [{ text: 'D' }]],
      [5, [{ text: 'E' }]]
    ]);
    const res1 = redistributeWeights(baseWeights, byTier1);
    expect(res1[1]).toBeCloseTo(0.1);
    expect(res1[2]).toBeCloseTo(0.4); // 0.2 + 0.2
    expect(res1[3]).toBe(0);
    expect(res1[4]).toBeCloseTo(0.4); // 0.2 + 0.2
    expect(res1[5]).toBeCloseTo(0.1);

    // Case 2: Tiers 3 and 4 are exhausted.
    // 3's weight (0.4) goes to 2 (dist 1 vs 5 dist 2)
    // 4's weight (0.2) goes to 5 (dist 1 vs 2 dist 2)
    const byTier2 = new Map<number, any[]>([
      [1, [{ text: 'A' }]],
      [2, [{ text: 'B' }]],
      [3, []], // exhausted
      [4, []], // exhausted
      [5, [{ text: 'E' }]]
    ]);
    const res2 = redistributeWeights(baseWeights, byTier2);
    expect(res2[1]).toBeCloseTo(0.1);
    expect(res2[2]).toBeCloseTo(0.6); // 0.2 + 0.4
    expect(res2[3]).toBe(0);
    expect(res2[4]).toBe(0);
    expect(res2[5]).toBeCloseTo(0.3); // 0.1 + 0.2
  });

  it('pickWords is deterministic given the same seed and criteria', () => {
    const criteria = {
      count: 10,
      tierWeights: { 1: 0.2, 2: 0.3, 3: 0.3, 4: 0.1, 5: 0.1 },
      recentlyUsedWords: new Set<string>()
    };
    const rng1 = mulberry32(456);
    const rng2 = mulberry32(456);
    const picks1 = pickWords(criteria, rng1);
    const picks2 = pickWords(criteria, rng2);
    expect(picks1).toEqual(picks2);
  });

  it('1000 picks never produce a duplicate within the returned list and never return recentlyUsedWords', () => {
    const recentlyUsed = new Set(['SEA', 'SUN', 'AIR', 'BOW', 'AFT', 'PORT', 'STAR', 'WIND', 'WAVE', 'TIDE']);
    const criteria = {
      count: 15,
      tierWeights: { 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 },
      recentlyUsedWords: recentlyUsed
    };

    for (let i = 0; i < 1000; i++) {
      const rng = mulberry32(i * 17 + 100);
      const picks = pickWords(criteria, rng);
      expect(picks.length).toBe(15);

      const seen = new Set<string>();
      for (const p of picks) {
        expect(seen.has(p.text)).toBe(false);
        seen.add(p.text);
        expect(recentlyUsed.has(p.text)).toBe(false);
      }
    }
  });

  it('tier weight distribution matches criteria within tolerance (±10% over 200 picks)', () => {
    // We will do 200 picks of 1 word each from a specific weight distribution
    const criteria = {
      count: 1,
      tierWeights: { 1: 0.1, 2: 0.2, 3: 0.4, 4: 0.2, 5: 0.1 },
      recentlyUsedWords: new Set<string>()
    };

    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    // Use a fixed seed sequence to be completely deterministic and avoid flakiness
    for (let i = 0; i < 200; i++) {
      const rng = mulberry32(i + 12345);
      const picks = pickWords(criteria, rng);
      expect(picks.length).toBe(1);
      const tier = picks[0].difficultyTier;
      counts[tier]++;
    }

    const total = 200;
    const tolerance = total * 0.10; // 20 picks tolerance (i.e. ±10 percentage points)

    expect(Math.abs(counts[1] - total * 0.1)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(counts[2] - total * 0.2)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(counts[3] - total * 0.4)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(counts[4] - total * 0.2)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(counts[5] - total * 0.1)).toBeLessThanOrEqual(tolerance);
  });

  it('soft constraint reduces dominant letter sharing', () => {
    const criteria = {
      count: 10,
      tierWeights: { 1: 0.2, 2: 0.3, 3: 0.3, 4: 0.1, 5: 0.1 },
      recentlyUsedWords: new Set<string>()
    };

    for (let i = 0; i < 50; i++) {
      const rng = mulberry32(i + 7777);
      const picks = pickWords(criteria, rng);
      expect(picks.length).toBe(10);

      const dominantCounts: Record<string, number> = {};
      for (const w of picks) {
        const dom = getMostCommonLetter(w.text);
        if (dom) {
          dominantCounts[dom] = (dominantCounts[dom] || 0) + 1;
        }
      }

      // Verify that no dominant letter is shared by more than 3 words
      for (const char in dominantCounts) {
        expect(dominantCounts[char]).toBeLessThanOrEqual(3);
      }
    }
  });
});
