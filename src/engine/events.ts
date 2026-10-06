import { log } from './log';
import type { EngineEvent } from './types';

export type Unsubscribe = () => void;

export class EventBus<E extends { type: string }> {
  private subscriptions: Array<{
    type: string | null;
    handler: (e: any) => void;
  }> = [];
  private warnedTypes = new Set<string>();

  on<T extends E['type']>(
    type: T,
    handler: (e: Extract<E, { type: T }>) => void
  ): Unsubscribe {
    const sub = { type, handler };
    this.subscriptions.push(sub);
    return () => {
      const idx = this.subscriptions.indexOf(sub);
      if (idx !== -1) {
        this.subscriptions.splice(idx, 1);
      }
    };
  }

  onAny(handler: (e: E) => void): Unsubscribe {
    const sub = { type: null, handler };
    this.subscriptions.push(sub);
    return () => {
      const idx = this.subscriptions.indexOf(sub);
      if (idx !== -1) {
        this.subscriptions.splice(idx, 1);
      }
    };
  }

  emit(event: E): void {
    const type = event.type;
    let hasSubscribers = false;

    // Snapshot target handlers in subscription order in case handlers modify subscriptions during emit
    const targets: Array<(e: any) => void> = [];
    for (const sub of this.subscriptions) {
      if (sub.type === null || sub.type === type) {
        hasSubscribers = true;
        targets.push(sub.handler);
      }
    }

    if (!hasSubscribers) {
      if (!this.warnedTypes.has(type)) {
        this.warnedTypes.add(type);
        log.warn('engine', `No subscribers for event type: ${type}`);
      }
    }

    for (const handler of targets) {
      try {
        handler(event);
      } catch (err) {
        log.error('engine', err);
      }
    }
  }

  emitMany(events: E[]): void {
    for (const event of events) {
      this.emit(event);
    }
  }

  clear(): void {
    this.subscriptions = [];
    this.warnedTypes.clear();
  }
}

export const eventBus = new EventBus<EngineEvent>();
