import { Injectable, Logger } from "@nestjs/common";
import type { RealtimeEvent } from "@nim/types";

type RealtimeListener = (event: RealtimeEvent) => void;

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly listeners = new Set<RealtimeListener>();

  subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: Omit<RealtimeEvent, "occurredAt">): void {
    const completeEvent: RealtimeEvent = { ...event, occurredAt: new Date().toISOString() };
    for (const listener of this.listeners) {
      try {
        listener(completeEvent);
      } catch (error) {
        // Realtime delivery is best-effort: a subscriber must never turn an
        // already committed business mutation into an HTTP 500 response.
        this.logger.error(
          "A realtime subscriber failed after a committed mutation.",
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
