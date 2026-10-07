import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus, eventBus } from './events';
import { log } from './log';

describe('EventBus & Logging', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    eventBus.clear();
  });

  it('should handle basic subscribe and unsubscribe correctness', () => {
    const list: string[] = [];
    const unsub = eventBus.on('radar:fired', (e) => {
      list.push(`fired:${e.letter}`);
    });
    const unsubAny = eventBus.onAny((e) => {
      list.push(`any:${e.type}`);
    });

    eventBus.emit({ type: 'radar:fired', letter: 'A', battery: 5 });
    expect(list).toEqual(['fired:A', 'any:radar:fired']);

    list.length = 0;
    unsub();
    eventBus.emit({ type: 'radar:fired', letter: 'B', battery: 4 });
    expect(list).toEqual(['any:radar:fired']);

    list.length = 0;
    unsubAny();
    eventBus.emit({ type: 'radar:fired', letter: 'C', battery: 3 });
    expect(list).toEqual([]);
  });

  it('should preserve synchronous order across multiple subscribers', () => {
    const bus = new EventBus<any>();
    const order: number[] = [];

    bus.on('test', () => order.push(1));
    bus.onAny(() => order.push(2));
    bus.on('test', () => order.push(3));
    bus.onAny(() => order.push(4));

    bus.emit({ type: 'test' });
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('should catch subscriber errors, log them, and proceed to next subscriber', () => {
    const bus = new EventBus<any>();
    const order: string[] = [];

    const errSpy = vi.spyOn(log, 'error').mockImplementation(() => {});

    bus.on('test', () => {
      order.push('A');
      throw new Error('Subscriber A failed');
    });
    bus.on('test', () => {
      order.push('B');
    });

    bus.emit({ type: 'test' });

    expect(order).toEqual(['A', 'B']);
    expect(errSpy).toHaveBeenCalled();
    expect(errSpy.mock.calls[0][0]).toBe('engine');
    expect(errSpy.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it('should fire unknown-channel warning exactly once per session/type', () => {
    const bus = new EventBus<any>();
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {});

    // First emit of 'foo' - no subscribers
    bus.emit({ type: 'foo' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toBe('engine');
    expect(warnSpy.mock.calls[0][1]).toContain('foo');

    // Second emit of 'foo' - should not warn again
    bus.emit({ type: 'foo' });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Emit of 'bar' - no subscribers - should warn for 'bar'
    bus.emit({ type: 'bar' });
    expect(warnSpy).toHaveBeenCalledTimes(2);

    // Add subscriber to 'foo'
    bus.on('foo', () => {});
    bus.emit({ type: 'foo' });
    // Still shouldn't call warnSpy again
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('should toggle console output based on __TM_DEBUG', () => {
    const originalDebug = (globalThis as any).__TM_DEBUG;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      // Set to false
      (globalThis as any).__TM_DEBUG = false;
      log.debug('test', 'Hello World');
      expect(logSpy).not.toHaveBeenCalled();

      // Set to true
      (globalThis as any).__TM_DEBUG = true;
      log.debug('test', 'Hello Debug');
      expect(logSpy).toHaveBeenCalled();
      expect(logSpy.mock.calls[0][0]).toContain('[tm:test] Hello Debug');
    } finally {
      (globalThis as any).__TM_DEBUG = originalDebug;
    }
  });

  it('should prefix every line of log message with [tm:<scope>]', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.error('test_scope', 'Line 1\nLine 2\nLine 3');

    expect(errSpy).toHaveBeenCalled();
    expect(errSpy.mock.calls[0][0]).toBe(
      '[tm:test_scope] Line 1\n[tm:test_scope] Line 2\n[tm:test_scope] Line 3'
    );
  });
});
