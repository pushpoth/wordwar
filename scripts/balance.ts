// Balance report: how the headless bots fare on every level.
//   npm run balance            (100 seeds per level)
//   npm run balance -- 300     (more seeds)
import { LEVELS } from '../src/config/campaign';
import { playLevel, simulate } from '../src/tools/bot';

const fit = process.argv.includes('--fit');
const runs = Number(process.argv.find((a) => /^\d+$/.test(a))) || 100;
const TARGET = [0.99, 0.95, 0.9, 0.85, 0.75, 0.65, 0.55, 0.45]; // average player's win rate, level by level

if (fit) {
  // With an unlimited budget, a budget that gives the average player win rate w is the w-quantile of torpedoes used.
  console.log('level  name              budget for target win rate | torpedoes used, expert median / average median');
  for (const level of LEVELS) {
    const use = (k: 'expert' | 'average') => Array.from({ length: runs }, (_, i) => playLevel({ ...level, torpedoBudget: 999 }, i + 1, k).torpedoes).sort((a, b) => a - b);
    const q = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
    const a = use('average'), e = use('expert');
    const w = TARGET[level.id - 1] ?? 0.5;
    console.log(`${String(level.id).padStart(5)}  ${level.name.padEnd(17)} ${String(q(a, w)).padStart(6)} (win ${Math.round(w * 100)}%) | ${q(e, 0.5)} / ${q(a, 0.5)}`);
  }
  process.exit(0);
}
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);
console.log('level  name              size ships budget |  expert        |  average       |  novice        (win%, torpedoes used, stars)');
const cell = (x: ReturnType<typeof simulate>) => `${pct(x.winRate)} ${x.torpedoes.toFixed(0).padStart(3)} ${x.stars.toFixed(1)}`;
for (const level of LEVELS) {
  const [e, a, n] = (['expert', 'average', 'novice'] as const).map((k) => simulate(level, k, runs));
  console.log(`${String(level.id).padStart(5)}  ${level.name.padEnd(17)} ${String(level.gridSize).padStart(4)} ${String(level.unitCount).padStart(5)} ${String(level.torpedoBudget).padStart(6)} | ${cell(e)}      | ${cell(a)}      | ${cell(n)}`);
}
