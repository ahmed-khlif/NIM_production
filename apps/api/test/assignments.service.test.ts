import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { AssignmentsService } from "../src/assignments/assignments.service";

const actor = {
  user: { id: "admin-1", username: "admin", displayName: "Admin", role: "ADMIN" as const },
  sessionId: "session-1",
  tokenHash: "hash",
};
const dates = { createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") };
const piece = {
  id: "piece-1",
  offerId: "offer-1",
  reference: "CMD-001",
  quantity: 2,
  profile: "Profil 40",
  lengthMm: 6000,
  unitWeightKg: null,
  priority: "NORMAL",
  dueDate: null,
  status: "PLANNED",
  createdById: "admin-1",
  version: 1,
  ...dates,
};
const unit = {
  id: "unit-1",
  pieceId: "piece-1",
  sequenceNumber: 1,
  status: "PENDING",
  currentMachineId: null,
  currentOperatorId: null,
  startedAt: null,
  manufacturedAt: null,
  controlledAt: null,
  qualityResult: null,
  version: 1,
  piece,
};
const machine = {
  id: "machine-1",
  name: "CNC-01",
  internalNumber: "CNC-01",
  type: "Découpe",
  status: "ACTIVE",
  description: null,
  location: "Atelier A",
  ...dates,
};

function assignment(id: string, machineRecord = machine, unitRecord = unit) {
  return {
    id,
    pieceUnitId: unitRecord.id,
    machineId: machineRecord.id,
    assignedById: "admin-1",
    queuePosition: null,
    assignedAt: new Date("2026-01-01T08:00:00Z"),
    unassignedAt: null,
    active: true,
    reason: null,
    barAssignmentId: null,
    version: 1,
    pieceUnit: unitRecord,
    machine: machineRecord,
  };
}

function createService(prisma: Partial<PrismaService>): AssignmentsService {
  return new AssignmentsService(prisma as PrismaService);
}

describe("AssignmentsService", () => {
  it("paginates and filters active assignment rows in the database", async () => {
    const row = assignment("assignment-1");
    const prisma = {
      assignment: {
        findMany: vi.fn().mockResolvedValue([row]),
        count: vi.fn().mockResolvedValue(21),
        groupBy: vi.fn().mockResolvedValue([{ machineId: "machine-1", _count: { _all: 3 } }]),
      },
      pieceUnit: { count: vi.fn().mockResolvedValue(4) },
    };
    const service = createService(prisma as never);
    const result = await service.listAssignments(undefined, { page: 2, pageSize: 10, search: "CMD", machineId: "machine-1" });
    expect(prisma.assignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ active: true, machineId: "machine-1", OR: expect.any(Array) }),
      skip: 10,
      take: 10,
    }));
    expect(result).toMatchObject({ pagination: { page: 2, pageSize: 10, total: 21, totalPages: 3 }, availableUnitCount: 4, activeMachineCount: 1 });
  });

  it("searches and paginates available units without loading the full assignment picker", async () => {
    const prisma = {
      pieceUnit: {
        findMany: vi.fn().mockResolvedValue([unit]),
        count: vi.fn().mockResolvedValue(11),
      },
    };
    const service = createService(prisma as never);
    const result = await service.listAvailableUnits(undefined, { page: 2, pageSize: 10, search: "CMD" });
    expect(prisma.pieceUnit.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PENDING", piece: expect.objectContaining({ OR: expect.any(Array) }) }),
      skip: 10,
      take: 10,
    }));
    expect(result).toMatchObject({ pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 }, availableUnits: [{ id: "unit-1" }] });
  });

  it("rejects invalid assignment input before persistence", async () => {
    const transaction = { pieceUnit: { findUnique: vi.fn() } };
    const prisma = { $transaction: vi.fn() };
    const service = createService(prisma as never);

    await expect(service.assign(actor, { pieceUnitId: "", machineId: "" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transaction.pieceUnit.findUnique).not.toHaveBeenCalled();
  });

  it("blocks assignment to a machine in maintenance", async () => {
    const transaction = {
      pieceUnit: { findUnique: vi.fn().mockResolvedValue(unit) },
      machine: { findUnique: vi.fn().mockResolvedValue({ ...machine, status: "MAINTENANCE" }) },
      assignment: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.assign(actor, { pieceUnitId: "unit-1", machineId: "machine-1" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.assignment.create).not.toHaveBeenCalled();
  });

  it("creates a unit assignment, updates the unit, and records the actor", async () => {
    const created = assignment("assignment-1");
    const transaction = {
      pieceUnit: { findUnique: vi.fn().mockResolvedValue(unit), update: vi.fn() },
      machine: { findUnique: vi.fn().mockResolvedValue(machine) },
      offer: { findUnique: vi.fn().mockResolvedValue({ status: "READY" }) },
      cuttingBar: { count: vi.fn().mockResolvedValue(0) },
      assignment: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
      piece: { update: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.assign(actor, { pieceUnitId: "unit-1", machineId: "machine-1", queuePosition: 2 }),
    ).resolves.toMatchObject({
      id: "assignment-1",
      unitStatus: "ASSIGNED",
      pieceStatus: "ASSIGNED",
    });
    expect(transaction.pieceUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "unit-1" },
        data: expect.objectContaining({ status: "ASSIGNED", currentMachineId: "machine-1" }),
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "ASSIGNMENT_CREATED",
          actorUserId: "admin-1",
          actorRole: "ADMIN",
        }),
      }),
    );
  });

  it("closes the previous assignment and creates a replacement during reassignment", async () => {
    const oldAssignment = assignment("assignment-1", machine, { ...unit, status: "ASSIGNED" });
    const newMachine = { ...machine, id: "machine-2", name: "CNC-02", internalNumber: "CNC-02" };
    const replacement = assignment("assignment-2", newMachine, { ...unit, status: "ASSIGNED" });
    const transaction = {
      assignment: {
        findUnique: vi.fn().mockResolvedValue(oldAssignment),
        update: vi.fn(),
        create: vi.fn().mockResolvedValue(replacement),
      },
      machine: { findUnique: vi.fn().mockResolvedValue(newMachine) },
      offer: { findUnique: vi.fn().mockResolvedValue({ status: "READY" }) },
      pieceUnit: { update: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.reassign(actor, "assignment-1", {
        machineId: "machine-2",
        reason: "Machine prioritaire",
      }),
    ).resolves.toMatchObject({ id: "assignment-2", machineId: "machine-2" });
    expect(transaction.assignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "assignment-1" },
        data: expect.objectContaining({ active: false }),
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "ASSIGNMENT_REASSIGNED",
          metadata: expect.objectContaining({
            previousAssignmentId: "assignment-1",
            oldMachineId: "machine-1",
            newMachineId: "machine-2",
          }),
        }),
      }),
    );
  });

  it("routes new unit assignments through bars once an Offer has bar tracking", async () => {
    const transaction = {
      pieceUnit: { findUnique: vi.fn().mockResolvedValue(unit) },
      machine: { findUnique: vi.fn().mockResolvedValue(machine) },
      assignment: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      offer: { findUnique: vi.fn().mockResolvedValue({ status: "READY" }) },
      cuttingBar: { count: vi.fn().mockResolvedValue(1) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.assign(actor, { pieceUnitId: "unit-1", machineId: "machine-1" }),
    ).rejects.toMatchObject({ response: { code: "BAR_ASSIGNMENT_REQUIRED" } });
    expect(transaction.assignment.create).not.toHaveBeenCalled();
  });

  it("prevents individual reassignment of a unit managed by a machine-bar assignment", async () => {
    const existing = {
      ...assignment("assignment-1", machine, { ...unit, status: "ASSIGNED" }),
      barAssignmentId: "bar-assignment-1",
    };
    const transaction = {
      assignment: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn(),
        create: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.reassign(actor, "assignment-1", { machineId: "machine-2", reason: "Réorganisation" }),
    ).rejects.toMatchObject({ response: { code: "BAR_ASSIGNMENT_REQUIRED" } });
    expect(transaction.assignment.update).not.toHaveBeenCalled();
    expect(transaction.assignment.create).not.toHaveBeenCalled();
  });

  it("prevents individual unassignment of a unit managed by a machine-bar assignment", async () => {
    const existing = {
      ...assignment("assignment-1", machine, { ...unit, status: "ASSIGNED" }),
      barAssignmentId: "bar-assignment-1",
    };
    const transaction = {
      assignment: { findUnique: vi.fn().mockResolvedValue(existing), update: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.unassign(actor, "assignment-1", { reason: "Réorganisation" }),
    ).rejects.toMatchObject({ response: { code: "BAR_ASSIGNMENT_REQUIRED" } });
    expect(transaction.assignment.update).not.toHaveBeenCalled();
  });
});
