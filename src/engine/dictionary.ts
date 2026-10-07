import { WORDS } from '../config/words';
import type { WordEntry, WordPick, MissionWordCriteria } from './types';
import type { Rng } from './rng';

export function loadDictionary(): WordEntry[] {
  return WORDS; // assuming it's imported as a const array, it's frozen enough or we can Object.freeze
}

export function getMostCommonLetter(word: string): string {
  if (!word) return '';
  const counts: Record<string, number> = {};
  for (const char of word) {
    const upperChar = char.toUpperCase();
    if (upperChar >= 'A' && upperChar <= 'Z') {
      counts[upperChar] = (counts[upperChar] || 0) + 1;
    }
  }
  let maxCount = 0;
  let dominantChar = '';
  // Deterministic alphabetical tie-breaking
  const sortedChars = Object.keys(counts).sort();
  for (const char of sortedChars) {
    if (counts[char] > maxCount) {
      maxCount = counts[char];
      dominantChar = char;
    }
  }
  return dominantChar;
}

export function redistributeWeights(
  baseWeights: Record<number, number>,
  byTier: Map<number, WordEntry[]>
): Record<number, number> {
  const currentWeights: Record<number, number> = { ...baseWeights };
  const available: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const list = byTier.get(i);
    if (list && list.length > 0) {
      available.push(i);
    }
  }

  if (available.length === 0) {
    return currentWeights;
  }

  for (let t = 1; t <= 5; t++) {
    const list = byTier.get(t);
    const weight = currentWeights[t] || 0;
    if ((!list || list.length === 0) && weight > 0) {
      currentWeights[t] = 0;

      // Find nearest available tier(s)
      let minDist = Infinity;
      let nearestTiers: number[] = [];
      for (const a of available) {
        const dist = Math.abs(a - t);
        if (dist < minDist) {
          minDist = dist;
          nearestTiers = [a];
        } else if (dist === minDist) {
          nearestTiers.push(a);
        }
      }

      if (nearestTiers.length > 0) {
        const share = weight / nearestTiers.length;
        for (const n of nearestTiers) {
          currentWeights[n] = (currentWeights[n] || 0) + share;
        }
      }
    }
  }

  return currentWeights;
}

function selectTier(weights: Record<number, number>, byTier: Map<number, WordEntry[]>, rng: Rng): number | null {
  const redistributed = redistributeWeights(weights, byTier);

  let totalWeight = 0;
  const availableTiers: number[] = [];

  for (let i = 1; i <= 5; i++) {
    const w = redistributed[i] ?? 0;
    if (byTier.get(i)!.length > 0 && w > 0) {
      totalWeight += w;
      availableTiers.push(i);
    }
  }

  if (availableTiers.length === 0) return null;

  let r = rng.next() * totalWeight;
  for (const tier of availableTiers) {
    const w = redistributed[tier] ?? 0;
    r -= w;
    if (r <= 0) return tier;
  }
  return availableTiers[availableTiers.length - 1];
}

function findAnyTier(byTier: Map<number, WordEntry[]>, rng: Rng): number | null {
  const available: number[] = [];
  for (let i = 1; i <= 5; i++) {
    if (byTier.get(i)!.length > 0) available.push(i);
  }
  if (available.length === 0) return null;
  return available[rng.int(0, available.length)];
}

function pickAndRemove(list: WordEntry[], rng: Rng): WordEntry {
  const idx = rng.int(0, list.length);
  const item = list[idx];
  list.splice(idx, 1);
  return item;
}

function evaluatePicks(picks: WordEntry[]): number {
  const counts: Record<string, number> = {};
  for (const w of picks) {
    const dominant = getMostCommonLetter(w.text);
    if (dominant) {
      counts[dominant] = (counts[dominant] || 0) + 1;
    }
  }
  let penalty = 0;
  for (const k in counts) {
    if (counts[k] > 3) {
      penalty += counts[k] - 3;
    }
  }
  return penalty;
}

export function pickWords(
  criteria: MissionWordCriteria,
  rng: Rng,
  dictionary?: WordEntry[]
): WordPick[] {
  const allWords = dictionary || loadDictionary();
  const available = allWords.filter(w => !criteria.recentlyUsedWords.has(w.text));

  const minLen = criteria.minLength ?? 3;
  const maxLen = criteria.maxLength ?? 99;

  let candidates = available.filter(w => w.length >= minLen && w.length <= maxLen);

  const byTier = new Map<number, WordEntry[]>();
  for (let i = 1; i <= 5; i++) {
    byTier.set(i, []);
  }
  for (const w of candidates) {
    byTier.get(w.difficultyTier)!.push(w);
  }

  const picked: WordEntry[] = [];
  const weights = { ...criteria.tierWeights };

  // First pass: pick criteria.count words
  for (let i = 0; i < criteria.count; i++) {
    const tier = selectTier(weights, byTier, rng);
    const selectedTier = tier !== null ? tier : findAnyTier(byTier, rng);
    if (selectedTier === null) {
      throw new Error("Not enough words to satisfy criteria");
    }
    picked.push(pickAndRemove(byTier.get(selectedTier)!, rng));
  }

  // Soft constraint: avoid >3 words sharing the same most-common letter
  let currentScore = evaluatePicks(picked);
  let bestPicks = [...picked];
  let bestScore = currentScore;

  let attempts = 0;
  while (currentScore > 0 && attempts < 20) {
    attempts++;
    // Identify a "bad" word
    const counts: Record<string, number> = {};
    for (const w of picked) {
      const dom = getMostCommonLetter(w.text);
      if (dom) {
        counts[dom] = (counts[dom] || 0) + 1;
      }
    }
    
    let badWordIdx = -1;
    for (let i = 0; i < picked.length; i++) {
      const dom = getMostCommonLetter(picked[i].text);
      if (dom && counts[dom] > 3) {
        badWordIdx = i;
        break;
      }
    }

    if (badWordIdx !== -1) {
      const badWord = picked[badWordIdx];
      const tier = badWord.difficultyTier;
      const tierPool = byTier.get(tier)!;
      
      if (tierPool.length > 0) {
        // Swap it out
        const newWord = pickAndRemove(tierPool, rng);
        picked[badWordIdx] = newWord;
        tierPool.push(badWord); // put back the bad word into the pool
        
        const score = evaluatePicks(picked);
        if (score < bestScore) {
          bestScore = score;
          bestPicks = [...picked];
        }
        currentScore = score;
      } else {
        break;
      }
    }
  }

  return bestPicks.map(w => ({ ...w, repeatCount: 0 }));
}
