import { describe, expect, it, vi } from "vitest";
import { RealtimeGateway } from "../src/realtime/realtime.gateway";
import { RealtimeService } from "../src/realtime/realtime.service";

describe("RealtimeService", () => {
  it("publishes only after a subscriber is registered and supports cleanup", () => {
    const service = new RealtimeService();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    service.publish({ type: "production.started", entityType: "PRODUCTION_OPERATION", entityId: "operation-1" });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "production.started", entityId: "operation-1", occurredAt: expect.any(String) }));
    unsubscribe();
    service.publish({ type: "production.completed", entityType: "PRODUCTION_OPERATION", entityId: "operation-1" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not fail committed mutations before Socket.IO is ready", () => {
    const realtime = new RealtimeService();
    const auth = { readSessionCookie: vi.fn(), validateSession: vi.fn() };
    const gateway = new RealtimeGateway(realtime, auth as never);
    (gateway as unknown as { server: undefined }).server = undefined;
    gateway.onModuleInit();

    expect(() => realtime.publish({ type: "piece.assigned", entityType: "ASSIGNMENT", entityId: "assignment-1" })).not.toThrow();
  });

  it("isolates subscriber failures and still notifies remaining subscribers", () => {
    const realtime = new RealtimeService();
    const failingSubscriber = vi.fn(() => { throw new Error("subscriber failed"); });
    const healthySubscriber = vi.fn();
    const logError = vi.spyOn((realtime as unknown as { logger: { error: (message: string, stack?: string) => void } }).logger, "error").mockImplementation(() => undefined);
    realtime.subscribe(failingSubscriber);
    realtime.subscribe(healthySubscriber);

    expect(() => realtime.publish({ type: "schedule.created", entityType: "SCHEDULE_EVENT", entityId: "schedule-1" })).not.toThrow();
    expect(failingSubscriber).toHaveBeenCalledOnce();
    expect(healthySubscriber).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledOnce();
    logError.mockRestore();
  });
});
