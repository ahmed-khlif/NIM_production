import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { DashboardService } from "../src/dashboard/dashboard.service";

const actor = {
  user: {
    id: "manager-1",
    username: "manager",
    displayName: "Manager",
    role: "PRODUCTION_MANAGER" as const,
  },
  sessionId: "session-1",
  tokenHash: "hash",
};

describe("DashboardService", () => {
  it("builds dashboard data from bounded projections and the consolidated database aggregate", async () => {
    const dueDate = new Date(Date.now() + 86_400_000);
    const todayUtc = new Date().toISOString().slice(0, 10);
    const prisma = {
      piece: {
        findMany: vi.fn()
          .mockResolvedValueOnce([
            {
              id: "piece-1",
              reference: "CMD-001",
              profile: "HEA 200",
              lengthMm: 6000,
              quantity: 2,
              priority: "HIGH",
              dueDate,
              status: "IN_PROGRESS",
              _count: { units: 1 },
              units: [{ currentMachine: { name: "CNC-01" } }],
            },
          ])
          .mockResolvedValueOnce([]),
      },
      machine: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "machine-1",
            name: "CNC-01",
            internalNumber: "CNC-01",
            type: "Découpe",
            status: "ACTIVE",
            _count: { barAssignments: 1, productionRuns: 1 },
          },
        ]),
      },
      historyEvent: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "event-1",
            eventType: "PRODUCTION_STARTED",
            entityType: "PRODUCTION_OPERATION",
            entityId: "operation-1",
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: { pieceId: "piece-1" },
            createdAt: new Date("2026-01-01T10:00:00Z"),
            actor: { displayName: actor.user.displayName },
            actorOperator: null,
          },
        ]),
      },
      $queryRaw: vi.fn().mockResolvedValue([
        {
          totalPieces: 1,
          totalUnits: 2,
          completedUnits: 1,
          inProductionUnits: 1,
          delayedPiecesCount: 0,
          dueTodayPieces: 0,
          dueNextSevenDaysPieces: 0,
          withoutDueDatePieces: 0,
          qualityPendingCount: 0,
          openProductionNonConformityCount: 0,
          pendingDeviationCount: 0,
          statusCounts: [{ status: "IN_PROGRESS", count: 1 }],
          unitStatusCounts: [{ status: "IN_PROGRESS", count: 1 }],
          priorityCounts: [{ priority: "HIGH", count: 1 }],
          qualityCounts: [{ result: "CONFORM", count: 1 }],
          qualityDefectCounts: [],
          qualityDispositionCounts: [],
          productionTrendOperations: [{ date: todayUtc, startedUnits: 2, completedUnits: 1 }],
          productionTrendQuality: [{ date: todayUtc, conformUnits: 1, nonConformUnits: 1 }],
        },
      ]),
    };
    const service = new DashboardService(prisma as never as PrismaService);

    const result = await service.overview(actor);
    expect(result).toMatchObject({
      summary: {
        totalPieces: 1,
        totalUnits: 2,
        completedUnits: 1,
        progressPercent: 50,
        inProductionUnits: 1,
        delayedPieces: 0,
        activeMachines: 1,
      },
      machineLoads: [{ name: "CNC-01", queueCount: 1, inProgressCount: 1 }],
      recentActivity: [{ eventType: "PRODUCTION_STARTED", actorName: "Manager" }],
      activePieces: [{ reference: "CMD-001", completedUnits: 1, machineName: "CNC-01" }],
      statusBreakdown: [
        { status: "PLANNED", count: 0 },
        { status: "ASSIGNED", count: 0 },
        { status: "IN_PROGRESS", count: 1 },
        { status: "COMPLETED", count: 0 },
        { status: "DELAYED", count: 0 },
      ],
      unitStatusBreakdown: [
        { status: "PENDING", count: 0 },
        { status: "ASSIGNED", count: 0 },
        { status: "IN_PROGRESS", count: 1 },
        { status: "COMPLETED", count: 0 },
        { status: "QUALITY_PENDING", count: 0 },
        { status: "ACCEPTED", count: 0 },
        { status: "REJECTED", count: 0 },
        { status: "SCRAPPED", count: 0 },
      ],
      priorityBreakdown: [
        { priority: "HIGH", count: 1 },
        { priority: "NORMAL", count: 0 },
        { priority: "LOW", count: 0 },
      ],
      quality: {
        pendingUnits: 0,
        inspectedUnits: 1,
        conformUnits: 1,
        nonConformUnits: 0,
        conformityRate: 100,
      },
      dueDateSummary: {
        overduePieces: 0,
        dueTodayPieces: 0,
        dueNextSevenDaysPieces: 0,
        withoutDueDatePieces: 0,
      },
    });
    expect(result.machineLoads[0]).not.toHaveProperty("utilization");
    expect(result.productionTrend.find((point) => point.date === todayUtc)).toMatchObject({
      startedUnits: 2,
      completedUnits: 1,
      conformUnits: 1,
      nonConformUnits: 1,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    const aggregateSql = (
      prisma.$queryRaw.mock.calls[0]?.[0] as { strings: readonly string[] }
    ).strings.join(" ");
    expect(aggregateSql).toContain('"ProductionRun"');
    expect(aggregateSql).toContain('"MachineBarAssignment"');
    expect(aggregateSql).toContain('"standaloneOperationEvents"');
    expect(aggregateSql).toContain('"releasedAt"');
    expect(prisma.piece.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.piece.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { status: { notIn: ["COMPLETED", "ARCHIVED"] } },
        take: 8,
        select: expect.objectContaining({ _count: expect.any(Object) }),
      }),
    );
    expect(prisma.piece.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ status: { notIn: ["COMPLETED", "ARCHIVED"] }, dueDate: expect.objectContaining({ lt: expect.any(Date) }) }),
        take: 8,
      }),
    );
    expect(prisma.machine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: {
            select: {
              barAssignments: {
                where: {
                  active: true,
                  cuttingBar: { is: { status: "AFFECTEE" } },
                },
              },
              productionRuns: { where: { status: "RUNNING" } },
            },
          },
        }),
      }),
    );
  });

  it("coalesces dashboard aggregate reads, then invalidates the short cache on domain events", async () => {
    const prisma = {
      piece: { findMany: vi.fn().mockResolvedValue([]) },
      machine: { findMany: vi.fn().mockResolvedValue([]) },
      historyEvent: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn().mockResolvedValue([{
        totalPieces: 0,
        totalUnits: 0,
        completedUnits: 0,
        inProductionUnits: 0,
        delayedPiecesCount: 0,
        dueTodayPieces: 0,
        dueNextSevenDaysPieces: 0,
        withoutDueDatePieces: 0,
        qualityPendingCount: 0,
        openProductionNonConformityCount: 0,
        pendingDeviationCount: 0,
        statusCounts: [],
        unitStatusCounts: [],
        priorityCounts: [],
        qualityCounts: [],
        qualityDefectCounts: [],
        qualityDispositionCounts: [],
        productionTrendOperations: [],
        productionTrendQuality: [],
      }]),
    };
    let invalidate: (() => void) | undefined;
    const realtime = {
      subscribe: vi.fn((listener: () => void) => {
        invalidate = listener;
        return vi.fn();
      }),
    };
    const service = new DashboardService(prisma as never as PrismaService, realtime as never);

    await service.overview(actor);
    await service.overview(actor);
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    invalidate?.();
    await service.overview(actor);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    expect(realtime.subscribe).toHaveBeenCalledOnce();
  });
});
