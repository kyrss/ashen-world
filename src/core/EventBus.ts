import type { GameShellState } from './config';
import type { SaveRecord, UserSettings } from '../save/SaveManager';

export interface TelemetrySnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  dashing: boolean;
  dashCooldownRatio: number;
  facing: 'left' | 'right';
  nearestWaystoneId: string | null;
  nearestWaystoneName: string | null;
  discoveredCount: number;
  totalWaystones: number;
  zoneTitle: string;
}

export interface AshenEvents {
  'state:changed': GameShellState;
  'telemetry:updated': TelemetrySnapshot;
  'waystone:attuned': { id: string; name: string; save: SaveRecord };
  'save:completed': SaveRecord;
  'save:reset': SaveRecord;
  'settings:changed': UserSettings;
  'toast:message': { text: string; tone: 'amber' | 'cyan' | 'neutral' };
}

type Handler<T> = (payload: T) => void;

class TypedEventBus {
  private listeners = new Map<keyof AshenEvents, Set<Handler<never>>>();

  on<K extends keyof AshenEvents>(event: K, handler: Handler<AshenEvents[K]>): () => void {
    let set = this.listeners.get(event) as Set<Handler<AshenEvents[K]>> | undefined;
    if (!set) {
      set = new Set<Handler<AshenEvents[K]>>();
      this.listeners.set(event, set as unknown as Set<Handler<never>>);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  emit<K extends keyof AshenEvents>(event: K, payload: AshenEvents[K]): void {
    const set = this.listeners.get(event) as Set<Handler<AshenEvents[K]>> | undefined;
    if (!set) return;
    for (const fn of set) {
      fn(payload);
    }
  }
}

export const eventBus = new TypedEventBus();
