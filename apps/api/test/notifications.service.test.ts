import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { NotificationsService } from "../src/notifications/notifications.service";

const actor = {
  user: {
    id: "operator-1",
    username: "operator",
    displayName: "Operator",
    role: "OPERATOR" as const,
  },
  sessionId: "session-1",
  tokenHash: "hash",
};
const row = {
  id: "notification-1",
  eventType: "BAR_ASSIGNED_TO_MACHINE",
  title: "Barre affectée à la machine",
  message: "La barre AFF-B001 a été affectée à Scie 01.",
  actorName: "Manager",
  href: "/offers/offer-1/bars",
  offerId: "offer-1",
  readAt: null,
  createdAt: new Date("2026-01-02T10:00:00Z"),
};

describe("NotificationsService", () => {
  it("lists only the recipient's persisted inbox rows and returns a real unread count", async () => {
    const notification = {
      findMany: vi.fn().mockResolvedValue([row]),
      count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(3),
      groupBy: vi.fn().mockResolvedValue([{ eventType: row.eventType }]),
    };
    const service = new NotificationsService({ notification } as never as PrismaService);

    await expect(
      service.list(actor, {
        page: 1,
        pageSize: 10,
        search: "scie",
        unreadOnly: true,
        includeEventTypes: true,
      }),
    ).resolves.toMatchObject({
      unreadCount: 3,
      notifications: [
        { id: row.id, title: row.title, href: row.href, readAt: null, offerId: "offer-1" },
      ],
      eventTypes: [row.eventType],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
    expect(notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recipientUserId: "operator-1",
          readAt: null,
          OR: expect.any(Array),
        }),
        skip: 0,
        take: 10,
      }),
    );
    expect(notification.count).toHaveBeenNthCalledWith(2, {
      where: { recipientUserId: "operator-1", readAt: null },
    });
    expect(notification.groupBy).toHaveBeenCalledOnce();
  });

  it("skips the event-type aggregation for the lightweight header preview", async () => {
    const notification = {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn(),
    };
    const service = new NotificationsService({ notification } as never as PrismaService);

    await expect(service.list(actor, { page: 1, pageSize: 5 })).resolves.toMatchObject({
      eventTypes: [],
      unreadCount: 0,
    });
    expect(notification.groupBy).not.toHaveBeenCalled();
  });

  it("serves the operator tablet inbox using only its authenticated recipient id", async () => {
    const notification = {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn(),
    };
    const service = new NotificationsService({ notification } as never as PrismaService);

    await service.listForRecipient("tablet-operator", { page: 1, pageSize: 10 });

    expect(notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientUserId: "tablet-operator" },
        skip: 0,
        take: 10,
      }),
    );
    expect(notification.groupBy).not.toHaveBeenCalled();
  });

  it("marks only a notification owned by the authenticated user as read, idempotently", async () => {
    const notification = {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce({ id: row.id, readAt: null })
        .mockResolvedValueOnce({ id: row.id, readAt: new Date("2026-01-02T11:00:00Z") }),
      update: vi.fn().mockResolvedValue({}),
    };
    const service = new NotificationsService({ notification } as never as PrismaService);

    await expect(service.markRead(actor, row.id)).resolves.toMatchObject({ id: row.id });
    await service.markRead(actor, row.id);
    expect(notification.findFirst).toHaveBeenCalledWith({
      where: { id: row.id, recipientUserId: "operator-1" },
      select: { id: true, readAt: true },
    });
    expect(notification.update).toHaveBeenCalledTimes(1);
  });

  it("does not reveal or mutate another user's notification", async () => {
    const notification = { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() };
    const service = new NotificationsService({ notification } as never as PrismaService);

    await expect(service.markRead(actor, "someone-elses-id")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(notification.update).not.toHaveBeenCalled();
  });

  it("marks all unread rows only for the current user", async () => {
    const notification = { updateMany: vi.fn().mockResolvedValue({ count: 4 }) };
    const service = new NotificationsService({ notification } as never as PrismaService);

    await expect(service.markAllRead(actor)).resolves.toMatchObject({ updatedCount: 4 });
    expect(notification.updateMany).toHaveBeenCalledWith({
      where: { recipientUserId: "operator-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});
