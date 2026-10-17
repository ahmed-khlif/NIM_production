import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { MachinesService } from "../src/machines/machines.service";

const actor = {
  user: { id: "admin-1", username: "admin", displayName: "Admin", role: "ADMIN" as const },
  sessionId: "session-1",
  tokenHash: "hash",
};

function createService(prisma: Partial<PrismaService>): MachinesService {
  return new MachinesService(prisma as PrismaService);
}

describe("MachinesService", () => {
  it("applies machine search and pagination in the database", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = createService({
      machine: {
        findMany,
        count: vi.fn().mockResolvedValue(51),
        groupBy: vi.fn().mockResolvedValue([{ status: "ACTIVE", _count: { _all: 8 } }]),
      },
      machineBarAssignment: { groupBy: vi.fn().mockResolvedValue([]) },
    } as never);
    const result = await service.listMachinesPage({ page: 2, pageSize: 10, search: "CNC", status: "ACTIVE" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
    expect(result.pagination).toMatchObject({ page: 2, total: 51, totalPages: 6 });
    expect(result.statusCounts).toEqual({ ACTIVE: 8 });
  });

  it("rejects invalid machine input before persistence", async () => {
    const machine = { findUnique: vi.fn() };
    const service = createService({ machine } as never);

    await expect(
      service.createMachine(actor, { name: "", internalNumber: "bad number", type: "" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(machine.findUnique).not.toHaveBeenCalled();
  });

  it("creates a machine and records the actor role", async () => {
    const created = {
      id: "machine-1",
      name: "CNC Découpe",
      internalNumber: "CNC-06",
      type: "Découpe",
      status: "ACTIVE",
      description: null,
      location: "Atelier A",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    const transaction = {
      machine: { create: vi.fn().mockResolvedValue(created) },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      machine: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.createMachine(actor, {
        name: "CNC Découpe",
        internalNumber: "cnc-06",
        type: "Découpe",
        status: "ACTIVE",
        location: "Atelier A",
      }),
    ).resolves.toMatchObject({ internalNumber: "CNC-06", status: "ACTIVE" });
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "MACHINE_CREATED", actorRole: "ADMIN" }),
      }),
    );
  });

  it("changes machine status transactionally and writes old/new status", async () => {
    const target = {
      id: "machine-1",
      name: "CNC-06",
      internalNumber: "CNC-06",
      type: "Découpe",
      status: "ACTIVE",
      description: null,
      location: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    const updated = { ...target, status: "MAINTENANCE" };
    const transaction = {
      machine: { update: vi.fn().mockResolvedValue(updated) },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      machine: { findUnique: vi.fn().mockResolvedValue(target) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(service.setStatus(actor, "machine-1", "MAINTENANCE")).resolves.toMatchObject({
      status: "MAINTENANCE",
    });
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "MACHINE_STATUS_CHANGED",
          metadata: { oldStatus: "ACTIVE", newStatus: "MAINTENANCE" },
        }),
      }),
    );
  });

  it("returns the persisted machine queue and active operation count", async () => {
    const machine = {
      id: "machine-1",
      name: "CNC-01",
      internalNumber: "CNC-01",
      type: "Découpe",
      status: "ACTIVE",
      description: null,
      location: "Atelier A",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    const assignment = {
      id: "assignment-1",
      pieceUnitId: "unit-1",
      machineId: "machine-1",
      queuePosition: 1,
      assignedAt: new Date("2026-01-02T10:00:00Z"),
      pieceUnit: {
        pieceId: "piece-1",
        sequenceNumber: 1,
        status: "ASSIGNED",
        piece: { reference: "CMD-001", profile: "Profil 40", lengthMm: 6000, priority: "HIGH" },
      },
      machine: { id: "machine-1", name: "CNC-01" },
    };
    const prisma = {
      machine: { findUnique: vi.fn().mockResolvedValue(machine) },
      assignment: { findMany: vi.fn().mockResolvedValue([assignment]) },
      productionOperation: { count: vi.fn().mockResolvedValue(1) },
      machineBarAssignment: { findMany: vi.fn().mockResolvedValue([]) },
      machineSession: { findFirst: vi.fn().mockResolvedValue(null) },
      productionRun: { findFirst: vi.fn().mockResolvedValue(null) },
      cuttingBar: { count: vi.fn().mockResolvedValue(0) },
    };
    const service = createService(prisma as never);

    await expect(service.getMachine("machine-1")).resolves.toMatchObject({
      name: "CNC-01",
      activeOperationCount: 1,
      assignedBarCount: 0,
      barMetrics: { assigned: 0, inProgress: 0, fabricatedToday: 0, fabricatedTotal: 0 },
      queue: [{ reference: "CMD-001", queuePosition: 1 }],
    });
  });

  it("adds active bar-assignment counts to the machine list", async () => {
    const machine = {
      id: "machine-1",
      name: "CNC-01",
      internalNumber: "CNC-01",
      type: "Découpe",
      status: "ACTIVE",
      description: null,
      location: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    const prisma = {
      machine: { findMany: vi.fn().mockResolvedValue([machine]) },
      machineBarAssignment: {
        groupBy: vi.fn().mockResolvedValue([{ machineId: "machine-1", _count: { _all: 3 } }]),
      },
    };
    const service = createService(prisma as never);

    await expect(service.listMachines()).resolves.toMatchObject([
      { id: "machine-1", assignedBarCount: 3 },
    ]);
  });

  it("derives machine bar lifecycle and fabrication metrics from persisted bars", async () => {
    const machine = {
      id: "machine-1",
      name: "CNC-01",
      internalNumber: "CNC-01",
      type: "Découpe",
      status: "ACTIVE",
      description: null,
      location: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    const record = (id: string, status: string) => ({
      id,
      offerId: "offer-1",
      reference: `OFF-001-${id}`,
      profile: "IPE200",
      rawLengthMm: 6000,
      usedLengthMm: 5500,
      wasteMm: 500,
      status,
      offer: { reference: "OFF-001" },
    });
    const prisma = {
      machine: { findUnique: vi.fn().mockResolvedValue(machine) },
      assignment: { findMany: vi.fn().mockResolvedValue([]) },
      productionOperation: { count: vi.fn().mockResolvedValue(2) },
      machineBarAssignment: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { cuttingBar: record("bar-a", "AFFECTEE") },
            { cuttingBar: record("bar-b", "LANCEE") },
          ]),
      },
      machineSession: { findFirst: vi.fn().mockResolvedValue(null) },
      productionRun: { findFirst: vi.fn().mockResolvedValue(null) },
      cuttingBar: { count: vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2) },
    };
    const service = createService(prisma as never);

    await expect(service.getMachine("machine-1")).resolves.toMatchObject({
      assignedBarCount: 2,
      cuttingBars: [{ status: "AFFECTEE" }, { status: "LANCEE" }],
      barMetrics: { assigned: 1, inProgress: 1, fabricatedToday: 2, fabricatedTotal: 5 },
    });
    expect(prisma.machineBarAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { cuttingBar: { select: expect.objectContaining({ id: true, offer: { select: { reference: true } } }) } },
      }),
    );
    expect(prisma.cuttingBar.count).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ fabricatedAt: { gte: expect.any(Date) } }),
      }),
    );
  });
});
