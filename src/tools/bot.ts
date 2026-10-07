import { LETTER_FREQ } from '../config/balance';
import { configFor, starsFor, type Level } from '../config/campaign';
import { WORDS } from '../config/words';
import { createGame, type Game } from '../game/game';
import { mulberry32 } from '../engine/rng';
import type { Unit } from '../engine/types';

/**
 * A headless player for balancing. It only uses what the screen shows: word
 * lengths, letters already revealed, and which letters it has tried. `expert`
 * narrows the dictionary to words that fit and guesses the likeliest letter;
 * `average` does the same but guesses a random fitting letter 45% of the time
 * (a person who doesn't see every word); `novice` guesses by plain English
 * letter frequency. Typing speed isn't modelled: the bot always waits out the battery.
 */
export type Skill = 'expert' | 'average' | 'novice';
const SLIP = 0.45;

export type Result = { won: boolean; torpedoes: number; accuracy: number; stars: number };

const BY_FREQ = Object.keys(LETTER_FREQ).sort((a, b) => LETTER_FREQ[b] - LETTER_FREQ[a]);

function fits(word: string, unit: Unit): boolean {
  if (word.length !== unit.length) return false;
  for (let i = 0; i < word.length; i++) {
    if (unit.revealedLetters.has(i)) continue; // already shown on screen: matched by the caller via known chars
    if (unit.triedLetters.has(word[i])) return false; // a tried letter shows wherever it occurs
  }
  return true;
}

function nextTorpedoLetter(unit: Unit, skill: Skill, rnd: () => number): string | null {
  const hidden = [...Array(unit.length).keys()].filter((i) => !unit.revealedLetters.has(i));
  if (hidden.length === 0) return null;
  if (skill === 'novice') return BY_FREQ.find((l) => !unit.triedLetters.has(l)) ?? null;
  const known = (w: string) => [...unit.revealedLetters].every((i) => w[i] === unit.word[i]);
  const pool = WORDS.map((w) => w.text).filter((w) => fits(w, unit) && known(w));
  const score = new Map<string, number>();
  for (const w of pool) for (const i of hidden) score.set(w[i], (score.get(w[i]) ?? 0) + 1);
  if (skill === 'average' && rnd() < SLIP) {
    const options = [...score.keys()].filter((l) => !unit.triedLetters.has(l));
    if (options.length) return options[Math.floor(rnd() * options.length)];
  }
  let best: string | null = null;
  for (const [l, n] of score) if (!unit.triedLetters.has(l) && (best === null || n > score.get(best)!)) best = l;
  return best ?? BY_FREQ.find((l) => !unit.triedLetters.has(l)) ?? null;
}

/** Play one mission to its end. `keys`, if given, collects what a person would press (letters, Escape). */
export function playLevel(level: Level, seed: number, skill: Skill, keys?: string[]): Result {
  const game: Game = createGame(configFor(level), seed);
  const usedRadar = new Set<string>();
  const rng = mulberry32(seed * 7919 + 13);
  const rnd = () => rng.next();
  for (let guard = 0; guard < 2000 && game.state.outcome === 'in_progress'; guard++) {
    const st = game.state;
    const active = game.unit(st.activeUnitId);
    if (st.mode === 'TORPEDO' && active && !active.destroyed) {
      const l = nextTorpedoLetter(active, skill, rnd);
      if (l) { keys?.push(l); game.torpedo(l); continue; }
    }
    if (st.mode === 'TORPEDO') { keys?.push('Escape'); game.toRadar(); continue; }
    if (st.battery < 1) { game.tick(st.config.batteryRegenSeconds * 1000); continue; }
    const l = BY_FREQ.find((c) => !usedRadar.has(c));
    if (!l) break;
    usedRadar.add(l);
    keys?.push(l);
    game.radar(l);
  }
  const s = game.summary();
  const result = { won: s.outcome === 'success', torpedoes: s.shotsFiredTorpedo, accuracy: s.hitRateTorpedo, stars: starsFor(level, s) };
  game.dispose();
  return result;
}

export type Stats = { winRate: number; torpedoes: number; accuracy: number; stars: number };

/** Average over many seeds. */
export function simulate(level: Level, skill: Skill, runs = 100): Stats {
  let wins = 0, torp = 0, acc = 0, stars = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const r = playLevel(level, seed, skill);
    if (r.won) wins++;
    torp += r.torpedoes;
    acc += r.accuracy;
    stars += r.stars;
  }
  return { winRate: wins / runs, torpedoes: torp / runs, accuracy: acc / runs, stars: stars / runs };
}
