import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { HistoryService } from "../src/history/history.service";

const actor = {
  user: { id: "admin-1", username: "admin", displayName: "Admin", role: "ADMIN" as const },
  sessionId: "session-1",
  tokenHash: "hash",
};
const event = {
  id: "event-1",
  eventType: "QUALITY_VALIDATED",
  entityType: "QUALITY_CONTROL",
  entityId: "control-1",
  actorUserId: actor.user.id,
  actorRole: actor.user.role,
  metadata: { pieceId: "piece-1", result: "CONFORM" },
  createdAt: new Date("2026-01-01T10:00:00Z"),
  actor: { displayName: actor.user.displayName },
};

function createService(prisma: Partial<PrismaService>): HistoryService {
  return new HistoryService(prisma as PrismaService);
}

describe("HistoryService", () => {
  it("rejects invalid pagination before querying persistence", async () => {
    const prisma = { historyEvent: { count: vi.fn(), findMany: vi.fn() } };
    const service = createService(prisma as never);

    await expect(service.list(actor, { page: 0 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.historyEvent.count).not.toHaveBeenCalled();
    expect(prisma.historyEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns a mapped page with actor, metadata, and pagination", async () => {
    const prisma = {
      historyEvent: {
        count: vi.fn().mockResolvedValue(26),
        findMany: vi.fn().mockResolvedValue([event]),
      },
    };
    const service = createService(prisma as never);

    await expect(
      service.list(actor, { page: 2, pageSize: 25, eventType: "QUALITY_VALIDATED" }),
    ).resolves.toMatchObject({
      events: [
        {
          id: event.id,
          eventType: event.eventType,
          actorName: "Admin",
          metadata: event.metadata,
        },
      ],
      page: 2,
      pageSize: 25,
      total: 26,
      totalPages: 2,
    });
    expect(prisma.historyEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    );
  });

  it("scopes piece history through entity IDs and persisted metadata references", async () => {
    const prisma = {
      historyEvent: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = createService(prisma as never);

    await service.list(actor, {}, { metadataKey: "pieceId", id: "piece-1" });
    expect(prisma.historyEvent.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { entityId: "piece-1" },
                { metadata: { path: ["pieceId"], equals: "piece-1" } },
              ]),
            }),
          ]),
        }),
      }),
    );
  });
});
