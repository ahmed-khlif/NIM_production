import { Injectable } from "@nestjs/common";
import type { RealtimeEvent } from "@nim/types";

type RealtimeListener = (event: RealtimeEvent) => void;

@Injectable()
export class RealtimeService {
  private readonly listeners = new Set<RealtimeListener>();

  subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: Omit<RealtimeEvent, "occurredAt">): void {
    const completeEvent: RealtimeEvent = { ...event, occurredAt: new Date().toISOString() };
    for (const listener of this.listeners) listener(completeEvent);
  }
}
