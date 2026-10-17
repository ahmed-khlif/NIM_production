import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { OffersService } from "../src/offers/offers.service";

const actor = {
  user: { id: "admin-1", username: "admin", displayName: "Admin", role: "ADMIN" as const },
  sessionId: "session-1",
  tokenHash: "hash",
};

function serviceWith(prisma: Partial<PrismaService>): OffersService {
  return new OffersService(prisma as PrismaService);
}

describe("OffersService", () => {
  it("loads Offer detail metrics using aggregate queries instead of every unit row", async () => {
    const now = new Date("2026-10-17T10:00:00.000Z");
    const validatedPlan = {
      id: "plan-a",
      reference: "OFF-A-CP-001",
      status: "VALIDATED",
      totalBars: 2,
      totalWasteMm: 300,
      utilizationRate: 95,
      createdAt: now,
      proposals: [{ id: "proposal-a" }],
    };
    const groupBy = vi.fn().mockResolvedValue([
      { profile: "IPE200", _count: { _all: 2 }, _sum: { quantity: 5 } },
      { profile: " ipe200 ", _count: { _all: 1 }, _sum: { quantity: 2 } },
    ]);
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(validatedPlan)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(validatedPlan);
    const prisma = {
      offer: {
        findUnique: vi.fn().mockResolvedValue({
          id: "offer-a",
          reference: "OFF-A",
          revision: "A",
          name: "Offer A",
          status: "DRAFT",
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      },
      piece: { groupBy, findMany: vi.fn() },
      pieceUnit: { count: vi.fn().mockResolvedValue(4) },
      cuttingPlan: { findFirst, findMany: vi.fn().mockResolvedValue([validatedPlan]) },
      importBatch: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const result = await serviceWith(prisma as never).get("offer-a");

    expect(result).toMatchObject({
      pieceRows: 3,
      totalUnits: 7,
      manufacturedUnits: 4,
      profileCount: 1,
      plannedBars: 2,
      latestPlan: { id: "plan-a", reference: "OFF-A-CP-001" },
    });
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.piece.findMany).not.toHaveBeenCalled();
    expect(prisma.pieceUnit.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ manufacturedAt: { not: null } }),
      }),
    );
  });

  it("keeps metrics isolated between offers", async () => {
    const now = new Date("2026-10-14T10:00:00.000Z");
    const prisma = {
      offer: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "offer-a",
            reference: "OFF-A",
            revision: "A",
            name: "A",
            clientName: null,
            site: null,
            description: null,
            status: "DRAFT",
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "offer-b",
            reference: "OFF-B",
            revision: "A",
            name: "B",
            clientName: null,
            site: null,
            description: null,
            status: "DRAFT",
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        ]),
        count: vi.fn().mockResolvedValue(2),
        groupBy: vi.fn().mockResolvedValue([]),
      },
      piece: {
        findMany: vi.fn().mockResolvedValue([
          { id: "piece-a", offerId: "offer-a", quantity: 3, profile: "IPE200" },
          { id: "piece-b", offerId: "offer-b", quantity: 2, profile: "HEA140" },
        ]),
      },
      pieceUnit: {
        groupBy: vi.fn().mockResolvedValue([
          { pieceId: "piece-a", _count: { _all: 1 } },
          { pieceId: "piece-b", _count: { _all: 2 } },
        ]),
      },
      cuttingPlan: { findMany: vi.fn().mockResolvedValue([]) },
      cuttingPlanProposal: { groupBy: vi.fn().mockResolvedValue([]) },
    };

    const result = await serviceWith(prisma as never).list();
    expect(result.offers).toEqual([
      expect.objectContaining({
        id: "offer-a",
        totalUnits: 3,
        manufacturedUnits: 1,
        profileCount: 1,
      }),
      expect.objectContaining({
        id: "offer-b",
        totalUnits: 2,
        manufacturedUnits: 2,
        profileCount: 1,
      }),
    ]);
    expect(result.pagination).toMatchObject({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
  });

  it("rejects a duplicate business reference", async () => {
    const prisma = { offer: { findUnique: vi.fn().mockResolvedValue({ id: "existing" }) } };
    const service = serviceWith(prisma as never);

    await expect(
      service.create(actor, { reference: "OFF-001", revision: "A", name: "Offre 1" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not allow READY without an approved cutting plan", async () => {
    const now = new Date("2026-10-14T10:00:00.000Z");
    const prisma = {
      offer: {
        findUnique: vi.fn().mockResolvedValue({
          id: "offer-a",
          reference: "OFF-A",
          status: "DRAFT",
          version: 1,
          createdAt: now,
          updatedAt: now,
        }),
      },
      piece: { count: vi.fn().mockResolvedValue(1) },
      cuttingPlan: { count: vi.fn().mockResolvedValue(0) },
    };
    const service = serviceWith(prisma as never);

    await expect(service.update(actor, "offer-a", { status: "READY" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("requires archiving instead of deleting an offer that already contains data", async () => {
    const now = new Date("2026-10-14T10:00:00.000Z");
    const prisma = {
      offer: {
        findUnique: vi.fn().mockResolvedValue({
          id: "offer-a",
          reference: "OFF-A",
          status: "DRAFT",
          version: 1,
          createdAt: now,
          updatedAt: now,
        }),
      },
      piece: { count: vi.fn().mockResolvedValue(1) },
      importBatch: { count: vi.fn().mockResolvedValue(0) },
      cuttingPlan: { count: vi.fn().mockResolvedValue(0) },
    };
    const service = serviceWith(prisma as never);

    await expect(service.remove(actor, "offer-a")).rejects.toBeInstanceOf(BadRequestException);
  });
  it("returns production metrics isolated to one offer", async () => {
    const now = new Date("2026-10-14T10:00:00.000Z");
    const prisma = {
      offer: {
        findUnique: vi.fn().mockResolvedValue({
          id: "offer-a",
          reference: "OFF-A",
          status: "IN_PRODUCTION",
          createdAt: now,
          updatedAt: now,
        }),
      },
      piece: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "piece-1",
            reference: "P1",
            profile: "IPE200",
            quantity: 3,
            status: "COMPLETED",
            units: [{ status: "ACCEPTED" }, { status: "QUALITY_PENDING" }, { status: "SCRAPPED" }],
          },
        ]),
      },
      pieceUnit: {
        groupBy: vi.fn().mockResolvedValue([
          { status: "ACCEPTED", _count: { _all: 1 } },
          { status: "QUALITY_PENDING", _count: { _all: 1 } },
          { status: "SCRAPPED", _count: { _all: 1 } },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
      assignment: { count: vi.fn().mockResolvedValue(1) },
      productionOperation: { count: vi.fn().mockResolvedValue(0) },
    };

    const result = await serviceWith(prisma as never).getProductionSummary("offer-a");
    expect(result.totals).toMatchObject({
      totalUnits: 3,
      manufacturedUnits: 3,
      acceptedUnits: 1,
      scrappedUnits: 1,
      resolvedUnits: 2,
      pendingQuality: 1,
      activeAssignments: 1,
      productionRate: 100,
    });
    expect(result.pieces[0]).toMatchObject({
      reference: "P1",
      completedUnits: 3,
      resolvedUnits: 2,
    });
  });

  it("does not complete an offer while quality is unresolved", async () => {
    const now = new Date("2026-10-14T10:00:00.000Z");
    const prisma = {
      offer: {
        findUnique: vi.fn().mockResolvedValue({
          id: "offer-a",
          reference: "OFF-A",
          status: "IN_PRODUCTION",
          version: 2,
          createdAt: now,
          updatedAt: now,
        }),
      },
      piece: { count: vi.fn().mockResolvedValue(1) },
      pieceUnit: { count: vi.fn().mockResolvedValue(1) },
      productionOperation: { count: vi.fn().mockResolvedValue(0) },
    };
    const service = serviceWith(prisma as never);

    await expect(service.update(actor, "offer-a", { status: "COMPLETED" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("blocks archiving an offer while production is active", async () => {
    const now = new Date("2026-10-14T10:00:00.000Z");
    const prisma = {
      offer: {
        findUnique: vi.fn().mockResolvedValue({
          id: "offer-a",
          reference: "OFF-A",
          status: "IN_PRODUCTION",
          version: 3,
          createdAt: now,
          updatedAt: now,
        }),
      },
    };
    const service = serviceWith(prisma as never);

    await expect(service.archive(actor, "offer-a")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("restores an archived offer as a draft and invalidates any approved plan", async () => {
    const now = new Date("2026-10-14T10:00:00.000Z");
    const archived = {
      id: "offer-a",
      reference: "OFF-A",
      revision: "A",
      name: "A",
      clientName: null,
      site: null,
      description: null,
      status: "ARCHIVED",
      archivedAt: now,
      version: 4,
      createdAt: now,
      updatedAt: now,
    };
    const restored = { ...archived, status: "DRAFT", archivedAt: null, version: 5 };
    const transaction = {
      cuttingPlan: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      offer: { update: vi.fn().mockResolvedValue(restored) },
      historyEvent: { create: vi.fn().mockResolvedValue({ id: "history-1" }) },
    };
    const prisma = {
      offer: {
        findUnique: vi.fn().mockResolvedValueOnce(archived).mockResolvedValueOnce(restored),
      },
      piece: {
        findMany: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn().mockResolvedValue([]),
      },
      pieceUnit: { count: vi.fn().mockResolvedValue(0) },
      cuttingPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      importBatch: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = serviceWith(prisma as never);

    await expect(service.restore(actor, "offer-a")).resolves.toMatchObject({ status: "DRAFT" });
    expect(transaction.cuttingPlan.updateMany).toHaveBeenCalledWith({
      where: {
        offerId: "offer-a",
        status: { in: ["APPROVED", "PARTIALLY_VALIDATED", "VALIDATED"] },
      },
      data: { status: "ARCHIVED" },
    });
    expect(transaction.offer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "offer-a" },
        data: expect.objectContaining({ status: "DRAFT", archivedAt: null }),
      }),
    );
  });
});
