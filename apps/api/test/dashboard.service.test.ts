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
  it("builds dashboard metrics from persisted pieces, units, machines, and history", async () => {
    const dueDate = new Date(Date.now() + 86_400_000);
    const prisma = {
      piece: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "piece-1",
            reference: "CMD-001",
            profile: "HEA 200",
            lengthMm: 6000,
            quantity: 2,
            priority: "HIGH",
            dueDate,
            status: "IN_PROGRESS",
            units: [
              { status: "COMPLETED", currentMachine: { name: "CNC-01" } },
              { status: "IN_PROGRESS", currentMachine: { name: "CNC-01" } },
            ],
          },
        ]),
        count: vi
          .fn()
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0),
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([{ status: "IN_PROGRESS", _count: { _all: 1 } }])
          .mockResolvedValueOnce([{ priority: "HIGH", _count: { _all: 1 } }]),
      },
      pieceUnit: {
        count: vi
          .fn()
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(0),
        groupBy: vi.fn().mockResolvedValue([{ status: "IN_PROGRESS", _count: { _all: 1 } }]),
      },
      qualityControl: {
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([{ result: "CONFORM", _count: { _all: 1 } }])
          .mockResolvedValueOnce([]),
        findMany: vi.fn().mockResolvedValue([]),
      },
      qualityDisposition: {
        groupBy: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      productionOperation: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      machine: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "machine-1",
            name: "CNC-01",
            internalNumber: "CNC-01",
            type: "Découpe",
            status: "ACTIVE",
            assignments: [{ id: "assignment-1" }],
            productionOperations: [{ id: "operation-1" }],
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
      nonConformity: { count: vi.fn().mockResolvedValue(0) },
    };
    const service = new DashboardService(prisma as never as PrismaService);

    await expect(service.overview(actor)).resolves.toMatchObject({
      summary: {
        totalPieces: 1,
        totalUnits: 2,
        completedUnits: 1,
        progressPercent: 50,
        inProductionUnits: 1,
        delayedPieces: 0,
        activeMachines: 1,
      },
      machineLoads: [{ name: "CNC-01", queueCount: 1, inProgressCount: 1, utilization: 50 }],
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
  });
});
