import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { NotificationsService } from "../src/notifications/notifications.service";

const actor = { user: { id: "operator-1", username: "operator", displayName: "Operator", role: "OPERATOR" as const }, sessionId: "session-1", tokenHash: "hash" };

describe("NotificationsService", () => {
  it("projects recent persisted history into role-scoped activity notifications", async () => {
    const historyEvent = { findMany: vi.fn().mockResolvedValue([{ id: "event-1", eventType: "PRODUCTION_STARTED", entityType: "PRODUCTION_OPERATION", entityId: "operation-1", createdAt: new Date("2026-01-02T10:00:00Z") }]) };
    const userSettings = { findUnique: vi.fn().mockResolvedValue({ notificationsEnabled: true }) };
    const service = new NotificationsService({ historyEvent, userSettings } as never as PrismaService);

    await expect(service.list(actor)).resolves.toMatchObject({ unreadCount: 1, notifications: [{ id: "event-1", eventType: "PRODUCTION_STARTED", message: "PRODUCTION_OPERATION · operation-1" }] });
    expect(historyEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ actorUserId: "operator-1" }) }));
  });

  it("honors the persisted notification preference", async () => {
    const historyEvent = { findMany: vi.fn() };
    const userSettings = { findUnique: vi.fn().mockResolvedValue({ notificationsEnabled: false }) };
    const service = new NotificationsService({ historyEvent, userSettings } as never as PrismaService);

    await expect(service.list(actor)).resolves.toEqual({ notifications: [], unreadCount: 0 });
    expect(historyEvent.findMany).not.toHaveBeenCalled();
  });
});
