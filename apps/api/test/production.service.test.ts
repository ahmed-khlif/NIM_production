import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
const adminActor = {
  user: { id: "admin-1", username: "admin", displayName: "Admin", role: "ADMIN" as const },
  sessionId: "admin-session",
  tokenHash: "admin-hash",
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
  it("keeps active bar work out of the legacy current operation and unit queue", async () => {
    const prisma = {
      offer: { findUnique: vi.fn() },
      productionOperation: { findFirst: vi.fn().mockResolvedValue(null) },
      assignment: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = createService(prisma as never);

    await expect(service.getCurrent(actor, { machineId: machine.id })).resolves.toEqual({
      current: null,
      queue: [],
    });
    expect(prisma.productionOperation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: {
            pieceUnit: {
              barMemberships: {
                some: {
                  active: true,
                  cuttingBar: { is: { assignments: { some: { active: true } } } },
                },
              },
            },
          },
        }),
      }),
    );
    expect(prisma.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          barAssignmentId: null,
          pieceUnit: expect.objectContaining({
            NOT: {
              barMemberships: {
                some: {
                  active: true,
                  cuttingBar: { is: { assignments: { some: { active: true } } } },
                },
              },
            },
          }),
        }),
      }),
    );
  });

  it("lets an admin end an idle machine session, preserving history and notifying the team", async () => {
    const event = {
      id: "event-1",
      eventType: "MACHINE_SESSION_ENDED",
      entityType: "MACHINE_SESSION",
      entityId: "machine-session-1",
      actorUserId: adminActor.user.id,
      actorRole: "ADMIN",
      metadata: {},
    };
    const transaction = {
      machineSessionOperator: {
        findFirst: vi.fn().mockResolvedValue({
          machineSession: {
            id: "machine-session-1",
            machineId: machine.id,
            machine: { id: machine.id, name: machine.name },
            members: [{ operatorId: "operator-1" }, { operatorId: "operator-2" }],
          },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      productionRun: { findFirst: vi.fn().mockResolvedValue(null) },
      machineSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      historyEvent: { create: vi.fn().mockResolvedValue(event) },
      user: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({ displayName: "Admin" }),
      },
      machine: { findUnique: vi.fn().mockResolvedValue({ id: machine.id, name: machine.name, internalNumber: machine.internalNumber }) },
      offer: { findUnique: vi.fn() },
      pieceUnit: { findUnique: vi.fn() },
      cuttingBar: { findUnique: vi.fn() },
      notification: { createMany: vi.fn() },
    };
    const realtime = { publish: vi.fn() };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    };
    const service = new ProductionService(prisma as never, realtime as never);

    await expect(service.endMachineSessionByAdmin(adminActor, "operator-1")).resolves.toEqual({
      success: true,
    });
    expect(transaction.machineSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "machine-session-1", status: "ACTIVE" },
      data: expect.objectContaining({ status: "ENDED" }),
    }));
    expect(transaction.machineSessionOperator.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { machineSessionId: "machine-session-1", active: true },
      data: expect.objectContaining({ active: false }),
    }));
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventType: "MACHINE_SESSION_ENDED",
        actorUserId: adminActor.user.id,
        metadata: expect.objectContaining({ endedByAdmin: true }),
      }),
    }));
    expect(transaction.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ recipientUserId: "operator-1" }),
        expect.objectContaining({ recipientUserId: "operator-2" }),
      ]),
    }));
    expect(realtime.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: "machine-session.ended",
      entityId: "machine-session-1",
    }));
  });

  it("does not let an admin end a machine session while a bar is running", async () => {
    const transaction = {
      machineSessionOperator: {
        findFirst: vi.fn().mockResolvedValue({
          machineSession: {
            id: "machine-session-1",
            machineId: machine.id,
            machine: { id: machine.id, name: machine.name },
            members: [{ operatorId: "operator-1" }],
          },
        }),
        updateMany: vi.fn(),
      },
      productionRun: {
        findFirst: vi.fn().mockResolvedValue({ cuttingBar: { reference: "OFF-B001" } }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    };
    const service = createService(prisma as never);

    await expect(service.endMachineSessionByAdmin(adminActor, "operator-1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "SESSION_HAS_RUNNING_PRODUCTION" }),
    });
    expect(transaction.machineSessionOperator.updateMany).not.toHaveBeenCalled();
  });

  it("rejects non-admin attempts to end another operator's machine session", async () => {
    const prisma = { $transaction: vi.fn() };
    const service = createService(prisma as never);

    await expect(service.endMachineSessionByAdmin(actor, "operator-2")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ADMIN_REQUIRED" }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

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
      pieceUnit: {
        findUnique: vi.fn().mockResolvedValue(assignedUnit),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
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
    expect(transaction.pieceUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: assignedUnit.id, status: "ASSIGNED", version: assignedUnit.version },
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

  it("prevents legacy start on a PieceUnit attached to an active bar assignment", async () => {
    const transaction = {
      pieceUnit: {
        findUnique: vi.fn().mockResolvedValue(assignedUnit),
        updateMany: vi.fn(),
      },
      machine: { findUnique: vi.fn().mockResolvedValue(machine) },
      assignment: { findFirst: vi.fn().mockResolvedValue(assignment) },
      productionOperation: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      cuttingBarItem: { findFirst: vi.fn().mockResolvedValue({ id: "bar-item-1" }) },
    };
    const realtime = { publish: vi.fn() };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = new ProductionService(prisma as never, realtime as never);

    await expect(
      service.start(actor, { pieceUnitId: assignedUnit.id, machineId: machine.id }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "BAR_PRODUCTION_REQUIRES_PRODUCTION_RUN" }),
    });
    expect(transaction.cuttingBarItem.findFirst).toHaveBeenCalledWith({
      where: {
        pieceUnitId: assignedUnit.id,
        active: true,
        cuttingBar: { is: { assignments: { some: { active: true } } } },
      },
      select: { id: true },
    });
    expect(transaction.pieceUnit.updateMany).not.toHaveBeenCalled();
    expect(transaction.productionOperation.create).not.toHaveBeenCalled();
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it("surfaces serializable start races as a conflict and emits no realtime event", async () => {
    const serializationConflict = new Prisma.PrismaClientKnownRequestError(
      "Concurrent transaction conflict",
      { code: "P2034", clientVersion: "test" },
    );
    const prisma = {
      $transaction: vi.fn().mockRejectedValue(serializationConflict),
    };
    const realtime = { publish: vi.fn() };
    const service = new ProductionService(prisma as never, realtime as never);

    await expect(
      service.start(actor, { pieceUnitId: assignedUnit.id, machineId: machine.id }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "PRODUCTION_CONCURRENT_UPDATE" }),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    expect(realtime.publish).not.toHaveBeenCalled();
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

  it("does not let the legacy completion endpoint finish a unit on an active assigned bar", async () => {
    const active = operation();
    const transaction = {
      productionOperation: {
        findUnique: vi.fn().mockResolvedValue(active),
        updateMany: vi.fn(),
      },
      cuttingBarItem: { findFirst: vi.fn().mockResolvedValue({ id: "bar-item-1" }) },
      pieceUnit: { count: vi.fn(), updateMany: vi.fn() },
      piece: { update: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const realtime = { publish: vi.fn() };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = new ProductionService(prisma as never, realtime as never);

    await expect(service.complete(actor, active.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "BAR_PRODUCTION_REQUIRES_PRODUCTION_RUN" }),
    });
    expect(transaction.productionOperation.updateMany).not.toHaveBeenCalled();
    expect(transaction.pieceUnit.updateMany).not.toHaveBeenCalled();
    expect(transaction.historyEvent.create).not.toHaveBeenCalled();
    expect(realtime.publish).not.toHaveBeenCalled();
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

    await expect(service.complete(actor, active.id)).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.pieceUnit.updateMany).not.toHaveBeenCalled();
    expect(transaction.historyEvent.create).not.toHaveBeenCalled();
  });
});
