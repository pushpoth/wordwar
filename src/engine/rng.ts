export type Rng = {
  next(): number;
  int(min: number, max: number): number;
  sample<T>(arr: T[], n: number): T[];
  state: number;
  setState(n: number): void;
};

export function mulberry32(seed: number): Rng {
  let currentState = seed;
  return {
    get state() {
      return currentState;
    },
    setState(n: number) {
      currentState = n;
    },
    next() {
      currentState |= 0;
      currentState = (currentState + 0x6d2b79f5) | 0;
      let t = Math.imul(currentState ^ (currentState >>> 15), 1 | currentState);
      t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min: number, max: number) {
      // Returns an integer between min (inclusive) and max (exclusive)
      return Math.floor(this.next() * (max - min)) + min;
    },
    sample<T>(arr: T[], n: number): T[] {
      const copy = arr.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = this.int(0, i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, n);
    }
  };
}

export function deriveRngs(missionSeed: number) {
  return {
    setupRng: mulberry32(missionSeed ^ 0x9e3779b1),
    playRng: mulberry32(missionSeed ^ 0x85ebca6b)
  };
}
