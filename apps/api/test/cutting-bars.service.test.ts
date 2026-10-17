import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { CuttingBarsService } from "../src/cutting-bars/cutting-bars.service";

const actor = {
  user: {
    id: "manager-1",
    username: "manager",
    displayName: "Manager",
    role: "PRODUCTION_MANAGER" as const,
  },
  sessionId: "session-1",
  tokenHash: "token-hash",
};

function createService(prisma: Partial<PrismaService>): CuttingBarsService {
  return new CuttingBarsService(prisma as PrismaService);
}

function bar(status: string = "FACONNEE") {
  const pieceUnit = {
    id: "unit-1",
    pieceId: "piece-1",
    sequenceNumber: 1,
    status: "FACONNEE",
    piece: {
      id: "piece-1",
      offerId: "offer-1",
      reference: "P-001",
      profile: "IPE200",
      lengthMm: 3200,
      unitWeightKg: null,
    },
  };
  return {
    id: "bar-1",
    offerId: "offer-1",
    cuttingPlanId: "plan-1",
    reference: "OFF-001-B001",
    profile: "IPE200",
    rawLengthMm: 6000,
    usedLengthMm: 3200,
    wasteMm: 2800,
    status,
    createdAt: new Date("2026-10-15T08:00:00.000Z"),
    offer: { id: "offer-1", reference: "OFF-001" },
    items: [{ id: "bar-item-1", pieceUnitId: pieceUnit.id, active: true, pieceUnit }],
    assignments: [],
  };
}

describe("CuttingBarsService", () => {
  it("returns bar totals with a grouped database query instead of loading bar details", async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { status: "FACONNEE", _count: { _all: 4 } },
      { status: "AFFECTEE", _count: { _all: 2 } },
    ]);
    const findMany = vi.fn();
    const service = createService({
      offer: { findUnique: vi.fn().mockResolvedValue({ id: "offer-1", status: "READY" }) },
      cuttingBar: { groupBy, findMany },
    } as never);

    await expect(service.getBarSummary("offer-1")).resolves.toEqual({
      statusCounts: { FACONNEE: 4, AFFECTEE: 2 },
      total: 6,
    });
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ["status"] }));
    expect(findMany).not.toHaveBeenCalled();
  });

  it("rejects duplicate bar ids before opening a transaction", async () => {
    const transaction = vi.fn();
    const service = createService({ $transaction: transaction } as never);

    await expect(
      service.assignBars(actor, "offer-1", { machineId: "machine-1", barIds: ["bar-1", "bar-1"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("persists only selected proposals as bars with exact PieceUnit membership", async () => {
    const transaction = {
      pieceUnit: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      cuttingBar: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ id: "bar-1", reference: "OFF-001-B001" }),
      },
      cuttingBarItem: { createMany: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const service = createService({} as never);
    const result = await service.createFromPlanProposals(
      transaction as never,
      actor,
      { id: "offer-1", reference: "OFF-001" },
      { id: "plan-1", reference: "OFF-001-CP-001" },
      [{
        id: "proposal-1",
        reference: "OFF-001-CP-001-P001",
        profile: "IPE200",
        rawLengthMm: 6000,
        usedLengthMm: 3200,
        wasteMm: 2800,
        cuts: [{ lengthMm: 3200, quantity: 1 }],
        items: [{ pieceUnitId: "unit-1" }],
      }],
    );

    expect(result).toBe(1);
    expect(transaction.pieceUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["unit-1"] }, status: "PENDING" }),
        data: expect.objectContaining({ status: "FACONNEE" }),
      }),
    );
    expect(transaction.cuttingBar.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reference: "OFF-001-B001",
          profile: "IPE200",
          rawLengthMm: 6000,
        }),
      }),
    );
    expect(transaction.cuttingBarItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ cuttingBarId: "bar-1", pieceUnitId: "unit-1" })],
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledTimes(2);
  });

  it("keeps assignment queries offer-scoped and rejects a foreign/missing bar", async () => {
    const transaction = {
      offer: { findUnique: vi.fn().mockResolvedValue({ id: "offer-1", status: "READY" }) },
      machine: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "machine-1", name: "CNC-01", status: "ACTIVE" }),
      },
      cuttingBar: { findMany: vi.fn().mockResolvedValue([]) },
      machineBarAssignment: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.assignBars(actor, "offer-1", {
        machineId: "machine-1",
        barIds: ["bar-from-offer-2"],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.cuttingBar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["bar-from-offer-2"] }, offerId: "offer-1" } }),
    );
    expect(transaction.machineBarAssignment.create).not.toHaveBeenCalled();
  });

  it("rejects assignment to an inactive machine before changing any bar", async () => {
    const transaction = {
      offer: { findUnique: vi.fn().mockResolvedValue({ id: "offer-1", status: "READY" }) },
      machine: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "machine-1", name: "CNC-01", status: "MAINTENANCE" }),
      },
      cuttingBar: { findMany: vi.fn().mockResolvedValue([bar()]), updateMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.assignBars(actor, "offer-1", { machineId: "machine-1", barIds: ["bar-1"] }),
    ).rejects.toMatchObject({ response: { code: "MACHINE_UNAVAILABLE" } });
    expect(transaction.cuttingBar.updateMany).not.toHaveBeenCalled();
  });

  it("assigns the bar and its units with standard production assignments and audit events", async () => {
    const targetBar = bar();
    const transaction = {
      offer: { findUnique: vi.fn().mockResolvedValue({ id: "offer-1", status: "READY" }) },
      machine: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "machine-1", name: "CNC-01", status: "ACTIVE" }),
      },
      cuttingBar: {
        findMany: vi.fn().mockResolvedValue([targetBar]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      machineBarAssignment: { create: vi.fn() },
      pieceUnit: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      assignment: { createMany: vi.fn() },
      piece: { updateMany: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.assignBars(actor, "offer-1", { machineId: "machine-1", barIds: [targetBar.id] }),
    ).resolves.toEqual({ assignedCount: 1 });
    expect(transaction.cuttingBar.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: targetBar.id, offerId: "offer-1", status: "FACONNEE" },
        data: { status: "AFFECTEE" },
      }),
    );
    expect(transaction.pieceUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["unit-1"] }, status: "FACONNEE" },
        data: expect.objectContaining({ status: "ASSIGNED", currentMachineId: "machine-1" }),
      }),
    );
    expect(transaction.assignment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ pieceUnitId: "unit-1", machineId: "machine-1" })],
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledTimes(2);
  });

  it("assigns several bars in one transaction", async () => {
    const firstBar = bar();
    const secondBar = {
      ...bar(),
      id: "bar-2",
      reference: "OFF-001-B002",
      items: [
        {
          id: "bar-item-2",
          pieceUnitId: "unit-2",
          active: true,
          pieceUnit: {
            ...firstBar.items[0]!.pieceUnit,
            id: "unit-2",
            pieceId: "piece-2",
            piece: { ...firstBar.items[0]!.pieceUnit.piece, id: "piece-2", reference: "P-002" },
          },
        },
      ],
    };
    const transaction = {
      offer: { findUnique: vi.fn().mockResolvedValue({ id: "offer-1", status: "READY" }) },
      machine: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "machine-1", name: "CNC-01", status: "ACTIVE" }),
      },
      cuttingBar: {
        findMany: vi.fn().mockResolvedValue([firstBar, secondBar]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      machineBarAssignment: { create: vi.fn() },
      pieceUnit: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      assignment: { createMany: vi.fn() },
      piece: { updateMany: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.assignBars(actor, "offer-1", { machineId: "machine-1", barIds: ["bar-1", "bar-2"] }),
    ).resolves.toEqual({ assignedCount: 2 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.machineBarAssignment.create).toHaveBeenCalledTimes(2);
    expect(transaction.assignment.createMany).toHaveBeenCalledTimes(2);
    expect(transaction.historyEvent.create).toHaveBeenCalledTimes(3);
  });

  it("validates the full selection before writing any part of a bulk assignment", async () => {
    const transaction = {
      offer: { findUnique: vi.fn().mockResolvedValue({ id: "offer-1", status: "READY" }) },
      machine: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "machine-1", name: "CNC-01", status: "ACTIVE" }),
      },
      cuttingBar: {
        findMany: vi.fn().mockResolvedValue([bar(), { ...bar("AFFECTEE"), id: "bar-2" }]),
        updateMany: vi.fn(),
      },
      machineBarAssignment: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.assignBars(actor, "offer-1", { machineId: "machine-1", barIds: ["bar-1", "bar-2"] }),
    ).rejects.toMatchObject({ response: { code: "BAR_NOT_ASSIGNABLE" } });
    expect(transaction.cuttingBar.updateMany).not.toHaveBeenCalled();
    expect(transaction.machineBarAssignment.create).not.toHaveBeenCalled();
  });

  it("cannot remove a machine assignment after production starts", async () => {
    const transaction = {
      cuttingBar: { findFirst: vi.fn().mockResolvedValue(bar("LANCEE")), update: vi.fn() },
      machineBarAssignment: {
        findFirst: vi.fn().mockResolvedValue({ id: "assignment-1", machineId: "machine-1" }),
        updateMany: vi.fn(),
      },
      assignment: { updateMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(service.unassignBar(actor, "offer-1", "bar-1")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.machineBarAssignment.updateMany).not.toHaveBeenCalled();
    expect(transaction.assignment.updateMany).not.toHaveBeenCalled();
  });

  it("closes assignment history and returns all member units to shaped state before production", async () => {
    const assignedBar = {
      ...bar("AFFECTEE"),
      items: bar().items.map((item) => ({
        ...item,
        pieceUnit: { ...item.pieceUnit, status: "ASSIGNED" },
      })),
    };
    const shapedBar = bar();
    const transaction = {
      cuttingBar: { findFirst: vi.fn().mockResolvedValue(assignedBar), update: vi.fn() },
      machineBarAssignment: {
        findFirst: vi.fn().mockResolvedValue({ id: "bar-assignment-1", machineId: "machine-1" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assignment: { updateMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
      pieceUnit: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      piece: { updateMany: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      offer: { findUnique: vi.fn().mockResolvedValue({ id: "offer-1", status: "READY" }) },
      cuttingBar: { findFirst: vi.fn().mockResolvedValue(shapedBar) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(service.unassignBar(actor, "offer-1", "bar-1")).resolves.toMatchObject({
      bar: { status: "FACONNEE" },
    });
    expect(transaction.machineBarAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bar-assignment-1", active: true },
        data: expect.objectContaining({ active: false, unassignedById: actor.user.id }),
      }),
    );
    expect(transaction.assignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { barAssignmentId: "bar-assignment-1", active: true } }),
    );
    expect(transaction.pieceUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["unit-1"] },
          status: "ASSIGNED",
          currentMachineId: "machine-1",
        }),
        data: expect.objectContaining({ status: "FACONNEE", currentMachineId: null }),
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "BAR_UNASSIGNED_FROM_MACHINE" }),
      }),
    );
  });

  it("cancels only an unassigned shaped bar and releases its unit without deleting history", async () => {
    const targetBar = bar();
    const transaction = {
      cuttingBar: {
        findFirst: vi.fn().mockResolvedValue(targetBar),
        update: vi.fn().mockResolvedValue({ ...targetBar, status: "CANCELLED" }),
      },
      pieceUnit: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      cuttingBarItem: { updateMany: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      offer: { findUnique: vi.fn().mockResolvedValue({ id: "offer-1", status: "READY" }) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(service.cancelBar(actor, "offer-1", "bar-1")).resolves.toMatchObject({
      bar: { status: "CANCELLED" },
    });
    expect(transaction.pieceUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["unit-1"] }, status: "FACONNEE" },
        data: expect.objectContaining({ status: "PENDING" }),
      }),
    );
    expect(transaction.cuttingBarItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cuttingBarId: "bar-1", active: true },
        data: expect.objectContaining({ active: false }),
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "CUTTING_BAR_CANCELLED" }),
      }),
    );
  });
});
