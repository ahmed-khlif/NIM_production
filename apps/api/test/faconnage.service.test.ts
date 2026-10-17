import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { FaconnageService } from "../src/faconnage/faconnage.service";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import type { CuttingOptimizer } from "../src/faconnage/cutting-optimizer";

const actor = {
  user: { id: "admin-1", username: "admin", displayName: "Admin", role: "ADMIN" as const },
  sessionId: "session-1",
  tokenHash: "hash",
};

function serviceWith(
  prisma: Partial<PrismaService>,
  cuttingBars = {},
  optimizerOverride?: Pick<CuttingOptimizer, "optimize">,
) {
  const optimizer = (optimizerOverride ?? { optimize: vi.fn() }) as unknown as CuttingOptimizer;
  return new FaconnageService(prisma as PrismaService, optimizer, {
    createFromPlanProposals: vi.fn().mockResolvedValue(1),
    publishGeneratedBars: vi.fn(),
    ...cuttingBars,
  } as never);
}

describe("FaconnageService partial plan validation", () => {
  it("keeps the optimization plan and audit event atomic with a workload-appropriate timeout", async () => {
    const now = new Date("2026-10-17T10:00:00.000Z");
    const offer = {
      id: "offer-a",
      reference: "OFF-A",
      status: "DRAFT",
      materialRevision: 1,
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      offer: { findUnique: vi.fn().mockResolvedValue(offer) },
      cuttingPlan: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: data.id,
            reference: data.reference,
            status: "DRAFT",
            createdAt: now,
          }),
        ),
      },
      pieceUnit: { count: vi.fn().mockResolvedValue(1) },
      historyEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
    };
    const $transaction = vi.fn(
      async (
        callback: (client: typeof transaction) => Promise<unknown>,
        options: { maxWait: number; timeout: number },
      ) => {
        expect(options).toEqual({ maxWait: 10_000, timeout: 30_000 });
        return callback(transaction);
      },
    );
    const optimizer = {
      optimize: vi.fn().mockResolvedValue({
        profile: "IPE200",
        status: "HEURISTIC",
        totalBars: 1,
        totalRawLengthMm: 6000,
        totalUsedLengthMm: 3200,
        totalWasteMm: 2800,
        utilizationRate: 53.33,
        bars: [
          {
            rawLengthMm: 6000,
            cuts: [{ lengthMm: 3200, quantity: 1 }],
            usedLengthMm: 3200,
            wasteMm: 2800,
            utilizationRate: 53.33,
          },
        ],
        requirementSummary: [{ lengthMm: 3200, requestedQuantity: 1, producedQuantity: 1 }],
        alternatives: [],
        diagnostics: {
          method: "BEST_FIT_DECREASING_FALLBACK",
          solver: "INTERNAL",
          generatedPatternCount: 1,
          columnGenerationIterations: 0,
          columnGenerationConverged: false,
          exhaustivePatternSet: true,
          solveTimeMs: 1,
        },
      }),
    };
    const prisma = {
      offer: { findUnique: vi.fn().mockResolvedValue(offer) },
      pieceUnit: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "unit-1", piece: { profile: "IPE200", lengthMm: 3200 } }]),
      },
      $transaction,
    };
    const service = serviceWith(prisma as never, {}, optimizer);

    const result = await service.optimize(actor, offer.id, {
      profiles: [
        {
          profile: "IPE200",
          requirements: [{ lengthMm: 3200, quantity: 1 }],
          rawLengths: [{ lengthMm: 6000 }],
        },
      ],
    });

    expect(result.plan).toMatchObject({
      status: "DRAFT",
      reference: expect.stringContaining("OFF-A"),
    });
    expect(transaction.cuttingPlan.create).toHaveBeenCalledTimes(1);
    expect(transaction.historyEvent.create).toHaveBeenCalledTimes(1);
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale plan before materializing any proposed bar", async () => {
    const now = new Date("2026-10-14T10:00:00.000Z");
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      offer: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "offer-a", status: "DRAFT", materialRevision: 3 }),
      },
      cuttingPlan: {
        findFirst: vi.fn().mockResolvedValue({
          id: "plan-a",
          offerId: "offer-a",
          status: "DRAFT",
          sourceRevision: 2,
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    await expect(
      serviceWith(prisma as never).validatePlanBars(actor, "offer-a", "plan-a", {
        proposalIds: ["proposal-1"],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(now).toBeInstanceOf(Date);
  });

  it("materializes only the selected proposal and leaves the plan partially validated", async () => {
    const offer = { id: "offer-a", reference: "OFF-A", status: "DRAFT", materialRevision: 4 };
    const plan = {
      id: "plan-a",
      offerId: offer.id,
      reference: "OFF-A-CP-001",
      status: "DRAFT",
      sourceRevision: 4,
      approvedById: null,
      approvedAt: null,
    };
    const selected = {
      id: "proposal-1",
      reference: "OFF-A-P001",
      profile: "IPE200",
      rawLengthMm: 6000,
      usedLengthMm: 3200,
      wasteMm: 2800,
      cuts: [{ lengthMm: 3200, quantity: 1 }],
      items: [
        {
          pieceUnitId: "unit-1",
          pieceUnit: {
            id: "unit-1",
            status: "PENDING",
            piece: { offerId: offer.id, profile: "IPE200", lengthMm: 3200, status: "ACTIVE" },
            assignments: [],
            barMemberships: [],
            productionOperations: [],
          },
        },
      ],
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      offer: { findUnique: vi.fn().mockResolvedValue(offer), update: vi.fn() },
      cuttingPlan: {
        findFirst: vi.fn().mockResolvedValue(plan),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      cuttingPlanProposal: {
        findMany: vi.fn().mockResolvedValue([selected]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
      },
      historyEvent: { create: vi.fn() },
    };
    let committed = false;
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) => {
        const result = await callback(transaction);
        committed = true;
        return result;
      }),
    };
    const createFromPlanProposals = vi.fn().mockResolvedValue(1);
    const publishGeneratedBars = vi.fn(() => expect(committed).toBe(true));
    const service = serviceWith(prisma as never, { createFromPlanProposals, publishGeneratedBars });

    await expect(
      service.validatePlanBars(actor, offer.id, plan.id, { proposalIds: [selected.id] }),
    ).resolves.toMatchObject({
      status: "PARTIALLY_VALIDATED",
      validatedBarCount: 1,
      remainingBarCount: 1,
      barsCreated: 1,
    });
    expect(createFromPlanProposals).toHaveBeenCalledWith(transaction, actor, offer, plan, [
      selected,
    ]);
    expect(transaction.cuttingPlan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PARTIALLY_VALIDATED" }),
      }),
    );
    expect(transaction.offer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "READY" }) }),
    );
    expect(publishGeneratedBars).toHaveBeenCalledWith(actor, plan.id);
  });

  it("rejects duplicate proposal ids before opening a transaction", async () => {
    const $transaction = vi.fn();
    await expect(
      serviceWith({ $transaction } as never).validatePlanBars(actor, "offer-a", "plan-a", {
        proposalIds: ["proposal-1", "proposal-1"],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("lists cutting plans with bounded server-side pagination", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      offer: { findUnique: vi.fn().mockResolvedValue({ id: "offer-a", status: "DRAFT" }) },
      cuttingPlan: { findMany, count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn(),
    };
    const count = prisma.cuttingPlan.count;
    await expect(serviceWith(prisma as never).listPlans("offer-a", 2, 10)).resolves.toMatchObject({
      plans: [],
      pagination: { page: 2, pageSize: 10, total: 0, totalPages: 0 },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { offerId: "offer-a", status: { notIn: ["ARCHIVED", "CANCELLED"] } },
        skip: 10,
        take: 10,
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: { offerId: "offer-a", status: { notIn: ["ARCHIVED", "CANCELLED"] } } });
  });

  it("physically deletes an unmaterialized draft and retains an audit history event", async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      cuttingPlan: {
        findFirst: vi.fn().mockResolvedValue({ id: "plan-a", offerId: "offer-a", reference: "OFF-A-CP-1", status: "DRAFT", _count: { bars: 0 }, proposals: [{ id: "proposal-a" }] }),
        delete: vi.fn().mockResolvedValue({}),
      },
      cuttingPlanProposalItem: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      cuttingPlanProposal: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      historyEvent: { create: vi.fn().mockResolvedValue({ id: "event-a" }) },
    };
    const prisma = { $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)) };
    await expect(serviceWith(prisma as never).deleteDraftPlan(actor, "offer-a", "plan-a")).resolves.toMatchObject({
      id: "plan-a",
      reference: "OFF-A-CP-1",
    });
    expect(transaction.cuttingPlanProposalItem.deleteMany).toHaveBeenCalledWith({ where: { proposalId: { in: ["proposal-a"] } } });
    expect(transaction.cuttingPlan.delete).toHaveBeenCalledWith({ where: { id: "plan-a" } });
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: "CUTTING_PLAN_DELETED", entityId: "plan-a" }),
    }));
  });

  it("refuses to physically delete plans with materialized production bars", async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      cuttingPlan: {
        findFirst: vi.fn().mockResolvedValue({ id: "plan-a", reference: "OFF-A-CP-1", status: "PARTIALLY_VALIDATED", _count: { bars: 1 }, proposals: [] }),
        delete: vi.fn(),
      },
      historyEvent: { create: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)) };
    await expect(serviceWith(prisma as never).deleteDraftPlan(actor, "offer-a", "plan-a")).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.cuttingPlan.delete).not.toHaveBeenCalled();
  });

  it("deletes only unvalidated remainder rows and preserves validated bar history", async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      cuttingPlan: {
        findFirst: vi.fn().mockResolvedValue({ id: "plan-a", reference: "OFF-A-CP-1", status: "PARTIALLY_VALIDATED" }),
        update: vi.fn().mockResolvedValue({}),
      },
      cuttingPlanProposal: {
        findMany: vi.fn().mockResolvedValue([{ id: "proposal-pending" }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      cuttingPlanProposalItem: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
      historyEvent: { create: vi.fn().mockResolvedValue({ id: "event-a" }) },
    };
    const prisma = { $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)) };
    await expect(serviceWith(prisma as never).cancelPlan(actor, "offer-a", "plan-a")).resolves.toMatchObject({ status: "CANCELLED" });
    expect(transaction.cuttingPlanProposalItem.deleteMany).toHaveBeenCalledWith({ where: { proposalId: { in: ["proposal-pending"] } } });
    expect(transaction.cuttingPlanProposal.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["proposal-pending"] } } });
    expect(transaction.cuttingPlan.update).toHaveBeenCalledWith({ where: { id: "plan-a" }, data: { status: "CANCELLED" } });
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: "CUTTING_PLAN_CANCELLED", entityId: "plan-a" }),
    }));
  });
});
