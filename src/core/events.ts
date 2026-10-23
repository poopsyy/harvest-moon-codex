import type { GameEvent } from "../state/game";
export class EventBus {
  private listeners = new Set<(event: GameEvent) => void>();
  subscribe(listener: (event: GameEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  emit(events: GameEvent[]): void {
    for (const event of events)
      for (const listener of this.listeners) listener(event);
  }
  clear(): void {
    this.listeners.clear();
  }
}
