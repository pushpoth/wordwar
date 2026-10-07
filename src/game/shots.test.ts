import { describe, expect, it } from 'vitest';
import { INTRO_SECONDS, introShot, KILL_AFTER, KILL_LEAD, KILL_RUN, killShot } from './shots';

const home = { az: -28, el: 52, dist: 25 };

describe('introShot', () => {
  const shot = introShot({ x: 2, z: -3 }, home);
  it('jumps to a close view of the sub, looking down', () => {
    const p = shot(0)!;
    expect(p.snap).toBe(true);
    expect(p.target).toMatchObject({ x: 2, z: -3 });
    expect(p.dist!).toBeLessThan(10);
    expect(p.el!).toBeGreaterThan(45); // steep enough that no horizon shows
  });
  it('then hands the framing back to the default, and ends', () => {
    expect(shot(5)).toMatchObject({ az: home.az, el: home.el, dist: home.dist });
    expect(shot(INTRO_SECONDS + 0.1)).toBeNull();
  });
});

describe('killShot', () => {
  const sub = { x: 0, z: 0 };
  const ship = { x: 6, z: 0 };
  const shot = killShot(sub, ship, 5);
  it('starts near the sub with the ship in view', () => {
    const p = shot(0.1)!;
    expect(p.target!.x).toBeGreaterThan(0);
    expect(p.target!.x).toBeLessThan(ship.x);
  });
  it('rides the torpedo from the sub to the ship', () => {
    const early = shot(KILL_LEAD + 0.1)!.target!.x;
    const late = shot(KILL_LEAD + KILL_RUN - 0.1)!.target!.x;
    expect(late).toBeGreaterThan(early);
    expect(late).toBeCloseTo(ship.x, 0);
  });
  it('pulls back and circles the ship after impact, then ends', () => {
    const impact = KILL_LEAD + KILL_RUN;
    const a = shot(impact + 1)!;
    const b = shot(impact + 3)!;
    expect(a.target).toMatchObject({ x: ship.x, z: ship.z });
    expect(a.dist!).toBeGreaterThan(shot(impact - 0.5)!.dist!);
    expect(b.az!).toBeGreaterThan(a.az!);
    expect(shot(impact + KILL_AFTER + 0.1)).toBeNull();
  });
});
