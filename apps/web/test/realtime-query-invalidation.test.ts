import { describe, expect, it } from "vitest";
import { getRealtimeInvalidationKeys } from "../lib/realtime-query-invalidation";

describe("realtime query invalidation", () => {
  it("invalidates the changed domain and shared activity instead of every cached query", () => {
    const keys = getRealtimeInvalidationKeys({
      type: "piece.updated",
      entityType: "PIECE",
      entityId: "piece-1",
      occurredAt: "2026-10-22T12:00:00.000Z",
    });

    expect(keys).toContainEqual(["pieces"]);
    expect(keys).toContainEqual(["piece-facets"]);
    expect(keys).toContainEqual(["offer"]);
    expect(keys).toContainEqual(["dashboard"]);
    expect(keys).toContainEqual(["history"]);
    expect(keys).toContainEqual(["notifications"]);
    expect(keys).not.toContainEqual(["users"]);
  });

  it("keeps unknown event types safe by refreshing aggregate and activity views", () => {
    expect(getRealtimeInvalidationKeys({
      type: "future.event",
      entityType: "FUTURE_ENTITY",
      entityId: "event-1",
      occurredAt: "2026-10-22T12:00:00.000Z",
    })).toEqual([["dashboard"], ["history"], ["notifications"]]);
  });
});
