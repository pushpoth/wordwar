import { describe, it, expect } from 'vitest';
import { createMission, tick } from './mission';
import { applyBatteryRegen } from './battery';
import { BATTERY_MAX, BATTERY_REGEN_SECONDS } from '../config/balance';
import type { MissionConfig, WordEntry } from './types';

const mockDict: WordEntry[] = [
  { text: 'CAT', length: 3, difficultyTier: 1 },
  { text: 'DOG', length: 3, difficultyTier: 1 }
];

const mockConfig: MissionConfig = {
  id: 1,
  gridSize: 10,
  unitCount: 2,
  torpedoBudget: 10,
  allowDiagonal: false,
  tierWeights: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
  batteryRegenSeconds: 60
};

describe('Battery Regeneration Logic', () => {
  it('should start with BATTERY_MAX', () => {
    const state = createMission(mockConfig, 42, mockDict);
    expect(state.battery).toBe(BATTERY_MAX);
    expect(state.lastBatteryRegenMs).toBe(0);
  });

  it('should not regenerate if battery is already at BATTERY_MAX', () => {
    let state = createMission(mockConfig, 42, mockDict);
    expect(state.battery).toBe(BATTERY_MAX);

    state = tick(state, 60000); // 60s
    expect(state.battery).toBe(BATTERY_MAX);
    // lastBatteryRegenMs should not advance if battery is already max and can't be incremented
    expect(state.lastBatteryRegenMs).toBe(0);
  });

  it('should regenerate +1 battery every interval when below BATTERY_MAX', () => {
    let state = createMission(mockConfig, 42, mockDict);
    state.battery = 0;
    state.lastBatteryRegenMs = 0;
    state.elapsedMs = 0;

    // 1 interval (60s)
    state = tick(state, 60000);
    expect(state.battery).toBe(1);
    expect(state.lastBatteryRegenMs).toBe(60000);

    // Another interval (60s)
    state = tick(state, 60000);
    expect(state.battery).toBe(2);
    expect(state.lastBatteryRegenMs).toBe(120000);
  });

  it('should reach full battery over 5 * 60s of ticks and cap at BATTERY_MAX (5)', () => {
    let state = createMission(mockConfig, 42, mockDict);
    state.battery = 0;
    state.lastBatteryRegenMs = 0;
    state.elapsedMs = 0;

    // Tick 5 times for 60s each
    for (let i = 1; i <= 5; i++) {
      state = tick(state, 60000);
      expect(state.battery).toBe(i);
      expect(state.lastBatteryRegenMs).toBe(i * 60000);
    }

    // Tick one more time, should remain capped at BATTERY_MAX (5)
    state = tick(state, 60000);
    expect(state.battery).toBe(BATTERY_MAX);
    // lastBatteryRegenMs should not advance if battery is capped
    expect(state.lastBatteryRegenMs).toBe(300000);
  });

  it('should not regenerate on sub-interval ticks (e.g. 30s)', () => {
    let state = createMission(mockConfig, 42, mockDict);
    state.battery = 2;
    state.lastBatteryRegenMs = 0;
    state.elapsedMs = 0;

    state = tick(state, 30000); // 30s
    expect(state.battery).toBe(2);
    expect(state.lastBatteryRegenMs).toBe(0);

    state = tick(state, 30000); // another 30s, total 60s
    expect(state.battery).toBe(3);
    expect(state.lastBatteryRegenMs).toBe(60000);
  });

  it('should handle multiple intervals in one large tick (e.g. 180s)', () => {
    let state = createMission(mockConfig, 42, mockDict);
    state.battery = 1;
    state.lastBatteryRegenMs = 0;
    state.elapsedMs = 0;

    state = tick(state, 180000); // 180s (3 intervals)
    expect(state.battery).toBe(4);
    expect(state.lastBatteryRegenMs).toBe(180000);
  });

  it('should not exceed BATTERY_MAX even with a very large tick interval', () => {
    let state = createMission(mockConfig, 42, mockDict);
    state.battery = 0;
    state.lastBatteryRegenMs = 0;
    state.elapsedMs = 0;

    state = tick(state, 600000); // 10 minutes = 10 intervals, but max is 5
    expect(state.battery).toBe(BATTERY_MAX);
    expect(state.lastBatteryRegenMs).toBe(300000); // Should stop advancing regen time after reaching max battery
  });

  it('should not regenerate battery if the mission has ended (outcome !== in_progress)', () => {
    let state = createMission(mockConfig, 42, mockDict);
    state.battery = 2;
    state.lastBatteryRegenMs = 0;
    state.elapsedMs = 0;
    state.outcome = 'success';

    state = tick(state, 120000); // 120s
    expect(state.battery).toBe(2);
    expect(state.elapsedMs).toBe(0); // Should not advance elapsedMs
    expect(state.lastBatteryRegenMs).toBe(0);

    state.outcome = 'failure';
    state = tick(state, 120000);
    expect(state.battery).toBe(2);
    expect(state.elapsedMs).toBe(0);
    expect(state.lastBatteryRegenMs).toBe(0);
  });

  it('should return correct format { state, events } when applyBatteryRegen is called directly', () => {
    let state = createMission(mockConfig, 42, mockDict);
    state.battery = 3;
    state.lastBatteryRegenMs = 0;
    state.elapsedMs = 0;

    const result = applyBatteryRegen(state, 120000); // 120s -> 2 regen ticks
    expect(result.state.battery).toBe(5);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toEqual({ type: 'battery:regen', battery: 4 });
    expect(result.events[1]).toEqual({ type: 'battery:regen', battery: 5 });
  });

  it('should have default BATTERY_REGEN_SECONDS equal to 5', () => {
    expect(BATTERY_REGEN_SECONDS).toBe(5);
  });
});
