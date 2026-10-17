import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { ProductionService } from "../src/production/production.service";

const actor = {
  user: {
    id: "operator-1",
    username: "operator",
    displayName: "Opérateur",
    role: "OPERATOR" as const,
  },
  sessionId: "session-1",
  tokenHash: "hash",
};
const dates = { createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") };
const piece = {
  id: "piece-1",
  offerId: "offer-1",
  reference: "CMD-001",
  quantity: 1,
  profile: "Profil 40",
  lengthMm: 6000,
  unitWeightKg: null,
  priority: "HIGH",
  dueDate: null,
  status: "ASSIGNED",
  createdById: "admin-1",
  version: 2,
  ...dates,
};
const machine = {
  id: "machine-1",
  name: "CNC-01",
  internalNumber: "CNC-01",
  type: "Usinage",
  status: "ACTIVE",
  description: null,
  location: "Atelier A",
  ...dates,
};
const assignedUnit = {
  id: "unit-1",
  pieceId: "piece-1",
  sequenceNumber: 1,
  status: "ASSIGNED",
  currentMachineId: machine.id,
  currentOperatorId: null,
  startedAt: null,
  manufacturedAt: null,
  controlledAt: null,
  qualityResult: null,
  version: 2,
  piece,
};
const assignment = {
  id: "assignment-1",
  pieceUnitId: assignedUnit.id,
  machineId: machine.id,
  assignedById: "admin-1",
  queuePosition: 1,
  assignedAt: new Date("2026-01-01T08:00:00Z"),
  unassignedAt: null,
  active: true,
  reason: null,
  version: 1,
  pieceUnit: assignedUnit,
  machine,
};

function operation(status: "IN_PROGRESS" | "COMPLETED" = "IN_PROGRESS") {
  return {
    id: "operation-1",
    pieceId: piece.id,
    pieceUnitId: assignedUnit.id,
    machineId: machine.id,
    operatorId: actor.user.id,
    status,
    startedAt: new Date("2026-01-01T09:00:00Z"),
    completedAt: status === "COMPLETED" ? new Date("2026-01-01T10:00:00Z") : null,
    version: status === "COMPLETED" ? 2 : 1,
    piece,
    pieceUnit: { ...assignedUnit, status: status === "COMPLETED" ? "IN_PROGRESS" : "IN_PROGRESS" },
    machine,
    operator: { id: actor.user.id, displayName: actor.user.displayName },
  };
}

function createService(prisma: Partial<PrismaService>): ProductionService {
  return new ProductionService(prisma as PrismaService);
}

describe("ProductionService", () => {
  it("rejects invalid start input before persistence", async () => {
    const prisma = { $transaction: vi.fn() };
    const service = createService(prisma as never);

    await expect(service.start(actor, { pieceUnitId: "", machineId: "" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("blocks a machine in maintenance", async () => {
    const transaction = {
      pieceUnit: { findUnique: vi.fn().mockResolvedValue(assignedUnit) },
      machine: { findUnique: vi.fn().mockResolvedValue({ ...machine, status: "MAINTENANCE" }) },
      assignment: { findFirst: vi.fn().mockResolvedValue(assignment) },
      offer: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "offer-1", reference: "OFF-001", status: "READY" }),
        update: vi.fn(),
      },
      productionOperation: { findFirst: vi.fn(), create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.start(actor, { pieceUnitId: assignedUnit.id, machineId: machine.id }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.productionOperation.create).not.toHaveBeenCalled();
  });

  it("starts an assigned unit and records the production event transactionally", async () => {
    const started = operation();
    const transaction = {
      pieceUnit: { findUnique: vi.fn().mockResolvedValue(assignedUnit), update: vi.fn() },
      machine: { findUnique: vi.fn().mockResolvedValue(machine) },
      assignment: { findFirst: vi.fn().mockResolvedValue(assignment) },
      offer: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "offer-1", reference: "OFF-001", status: "READY" }),
        update: vi.fn(),
      },
      productionOperation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(started),
      },
      cuttingBarItem: { findFirst: vi.fn().mockResolvedValue(null) },
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
      service.start(actor, { pieceUnitId: assignedUnit.id, machineId: machine.id }),
    ).resolves.toMatchObject({
      id: "operation-1",
      unitStatus: "IN_PROGRESS",
      pieceStatus: "IN_PROGRESS",
    });
    expect(transaction.pieceUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "IN_PROGRESS", currentOperatorId: actor.user.id }),
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "PRODUCTION_STARTED",
          actorUserId: actor.user.id,
        }),
      }),
    );
    expect(transaction.offer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "offer-1" },
        data: expect.objectContaining({ status: "IN_PRODUCTION" }),
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "OFFER_PRODUCTION_STARTED",
          entityType: "OFFER",
          entityId: "offer-1",
        }),
      }),
    );
  });

  it("completes a unit into quality pending and records the completion", async () => {
    const active = operation();
    const completed = operation("COMPLETED");
    const transaction = {
      productionOperation: {
        findUnique: vi.fn().mockResolvedValueOnce(active).mockResolvedValueOnce(completed),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      pieceUnit: {
        count: vi.fn().mockResolvedValue(1),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      cuttingBarItem: { findFirst: vi.fn().mockResolvedValue(null) },
      piece: { update: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(service.complete(actor, active.id)).resolves.toMatchObject({
      id: active.id,
      status: "COMPLETED",
      unitStatus: "QUALITY_PENDING",
      pieceStatus: "COMPLETED",
    });
    expect(transaction.pieceUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "QUALITY_PENDING", currentOperatorId: null }),
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "PRODUCTION_COMPLETED",
          actorUserId: actor.user.id,
        }),
      }),
    );
  });

  it("marks a bar fabricated when its last active unit completes and records the timestamp", async () => {
    const active = operation();
    const completed = operation("COMPLETED");
    const transaction = {
      productionOperation: {
        findUnique: vi.fn().mockResolvedValueOnce(active).mockResolvedValueOnce(completed),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      pieceUnit: {
        count: vi.fn().mockResolvedValue(1),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      cuttingBarItem: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ cuttingBarId: "bar-1", cuttingBar: { status: "LANCEE" } }),
        count: vi.fn().mockResolvedValue(0),
      },
      cuttingBar: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      piece: { update: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await service.complete(actor, active.id);

    expect(transaction.cuttingBar.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bar-1", status: "LANCEE" },
        data: { status: "FABRIQUEE", fabricatedAt: expect.any(Date) },
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "BAR_PRODUCTION_COMPLETED", entityId: "bar-1" }),
      }),
    );
  });

  it("rejects duplicate completion", async () => {
    const completed = operation("COMPLETED");
    const transaction = {
      productionOperation: { findUnique: vi.fn().mockResolvedValue(completed) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(service.complete(actor, completed.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects a completion that loses an optimistic concurrency update", async () => {
    const active = operation();
    const transaction = {
      productionOperation: {
        findUnique: vi.fn().mockResolvedValue(active),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      pieceUnit: { count: vi.fn(), updateMany: vi.fn() },
      piece: { update: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(service.complete(actor, active.id)).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.pieceUnit.updateMany).not.toHaveBeenCalled();
    expect(transaction.historyEvent.create).not.toHaveBeenCalled();
  });
});
