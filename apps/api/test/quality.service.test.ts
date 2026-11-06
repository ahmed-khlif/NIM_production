import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { QualityService } from "../src/quality/quality.service";

const actor = {
  user: {
    id: "quality-1",
    username: "quality",
    displayName: "Contrôleur qualité",
    role: "QUALITY_CONTROLLER" as const,
  },
  sessionId: "session-1",
  tokenHash: "hash",
};
const manager = {
  ...actor,
  user: { ...actor.user, role: "PRODUCTION_MANAGER" as const },
};
const admin = {
  ...actor,
  user: { ...actor.user, role: "ADMIN" as const },
};
const piece = {
  id: "piece-1",
  reference: "CMD-001",
  quantity: 1,
  profile: "Profil 40",
  lengthMm: 6000,
  unitWeightKg: null,
  priority: "HIGH",
  dueDate: null,
  status: "COMPLETED",
  createdById: "admin-1",
  version: 2,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};
const unit = {
  id: "unit-1",
  pieceId: piece.id,
  sequenceNumber: 1,
  status: "QUALITY_PENDING",
  currentMachineId: "machine-1",
  currentOperatorId: null,
  startedAt: new Date("2026-01-01T09:00:00Z"),
  manufacturedAt: new Date("2026-01-01T10:00:00Z"),
  controlledAt: null,
  qualityResult: null,
  version: 3,
  piece,
};
const control = {
  id: "control-1",
  pieceId: piece.id,
  pieceUnitId: unit.id,
  controllerId: actor.user.id,
  result: "CONFORM",
  comment: "Mesures conformes.",
  defectCategory: null,
  cycle: 1,
  controlledAt: new Date("2026-01-01T11:00:00Z"),
  version: 1,
  piece,
  pieceUnit: unit,
  controller: { id: actor.user.id, displayName: actor.user.displayName },
  images: [],
  dispositions: [],
};

function createService(prisma: Partial<PrismaService>): QualityService {
  return new QualityService(prisma as PrismaService);
}

describe("QualityService", () => {
  it("rejects a non-conform decision without a comment before persistence", async () => {
    const prisma = { $transaction: vi.fn() };
    const service = createService(prisma as never);

    await expect(
      service.validate(actor, unit.id, { result: "NON_CONFORM", comment: " " }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("lists pending units with manufacturing context", async () => {
    const prisma = {
      pieceUnit: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            ...unit,
            currentMachine: { name: "CNC-01" },
            productionOperations: [
              { machine: { name: "CNC-01" }, operator: { displayName: "Opérateur" } },
            ],
          },
        ]),
      },
    };
    const service = createService(prisma as never);

    await expect(service.listPending()).resolves.toMatchObject({
      units: [{
        pieceUnitId: unit.id,
        reference: "CMD-001",
        machineName: "CNC-01",
        operatorName: "Opérateur",
        status: "QUALITY_PENDING",
      }],
      pagination: { page: 1, pageSize: 20, total: 1 },
    });
  });

  it("accepts a pending unit, persists the result, and records quality history", async () => {
    const transaction = {
      pieceUnit: { findUnique: vi.fn().mockResolvedValue(unit), update: vi.fn() },
      qualityControl: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(control),
      },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.validate(actor, unit.id, { result: "CONFORM", comment: "Mesures conformes." }),
    ).resolves.toMatchObject({
      id: control.id,
      result: "CONFORM",
      reference: piece.reference,
    });
    expect(transaction.pieceUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: unit.id },
        data: expect.objectContaining({ status: "ACCEPTED", qualityResult: "CONFORM" }),
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "QUALITY_VALIDATED",
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
        }),
      }),
    );
  });

  it("rejects a unit that is no longer waiting for quality", async () => {
    const transaction = {
      pieceUnit: { findUnique: vi.fn().mockResolvedValue({ ...unit, status: "ACCEPTED" }) },
      qualityControl: { findUnique: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(service.validate(actor, unit.id, { result: "CONFORM" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.qualityControl.findUnique).not.toHaveBeenCalled();
  });

  it("rejects duplicate quality validation", async () => {
    const transaction = {
      pieceUnit: {
        findUnique: vi.fn().mockResolvedValue({ ...unit, controlledAt: control.controlledAt }),
      },
      qualityControl: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ cycle: control.cycle, controlledAt: control.controlledAt }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(service.validate(actor, unit.id, { result: "CONFORM" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("returns a rejected unit to production for rework and records the disposition", async () => {
    const disposition = {
      id: "disposition-1",
      pieceId: piece.id,
      pieceUnitId: unit.id,
      qualityControlId: control.id,
      type: "REWORK",
      status: "COMPLETED",
      reason: "Reprendre la soudure sur la zone B.",
      approvalComment: null,
      requestedById: manager.user.id,
      approvedById: null,
      requestedAt: new Date("2026-01-01T12:00:00Z"),
      decidedAt: new Date("2026-01-01T12:00:00Z"),
      completedAt: new Date("2026-01-01T12:00:00Z"),
      requestedBy: { id: manager.user.id, displayName: manager.user.displayName },
      approvedBy: null,
    };
    const transaction = {
      pieceUnit: {
        findUnique: vi.fn().mockResolvedValue({
          ...unit,
          status: "REJECTED",
          qualityControls: [{ ...control, result: "NON_CONFORM" }],
        }),
        update: vi.fn(),
      },
      qualityDisposition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(disposition),
      },
      assignment: { updateMany: vi.fn() },
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
      service.requestDisposition(manager, unit.id, {
        type: "REWORK",
        reason: disposition.reason,
      }),
    ).resolves.toMatchObject({ type: "REWORK", status: "COMPLETED" });
    expect(transaction.pieceUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: unit.id },
        data: expect.objectContaining({
          status: "PENDING",
          currentMachineId: null,
          currentOperatorId: null,
        }),
      }),
    );
    expect(transaction.piece.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "IN_PROGRESS" }) }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "QUALITY_DISPOSITION_COMPLETED" }),
      }),
    );
  });

  it("moves a rejected unit to terminal scrap without creating a new production cycle", async () => {
    const disposition = {
      id: "disposition-scrap",
      pieceId: piece.id,
      pieceUnitId: unit.id,
      qualityControlId: control.id,
      type: "SCRAP",
      status: "COMPLETED",
      reason: "Déformation irréparable.",
      approvalComment: null,
      requestedById: manager.user.id,
      approvedById: null,
      requestedAt: new Date("2026-01-01T12:00:00Z"),
      decidedAt: new Date("2026-01-01T12:00:00Z"),
      completedAt: new Date("2026-01-01T12:00:00Z"),
      requestedBy: { id: manager.user.id, displayName: manager.user.displayName },
      approvedBy: null,
    };
    const transaction = {
      pieceUnit: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            ...unit,
            status: "REJECTED",
            qualityControls: [{ ...control, result: "NON_CONFORM" }],
          }),
        update: vi.fn(),
      },
      qualityDisposition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(disposition),
      },
      assignment: { updateMany: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await service.requestDisposition(manager, unit.id, {
      type: "SCRAP",
      reason: disposition.reason,
    });
    expect(transaction.pieceUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SCRAPPED" }) }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "QUALITY_DISPOSITION_COMPLETED" }),
      }),
    );
  });

  it("requires an admin decision before accepting a deviation", async () => {
    const pending = {
      id: "disposition-deviation",
      pieceId: piece.id,
      pieceUnitId: unit.id,
      qualityControlId: control.id,
      type: "DEVIATION",
      status: "PENDING",
      reason: "Tolérance client approuvée.",
      approvalComment: null,
      requestedById: manager.user.id,
      approvedById: null,
      requestedAt: new Date("2026-01-01T12:00:00Z"),
      decidedAt: null,
      completedAt: null,
      requestedBy: { id: manager.user.id, displayName: manager.user.displayName },
      approvedBy: null,
      pieceUnit: {
        id: unit.id,
        status: "REJECTED",
        pieceId: piece.id,
        piece: { offerId: "offer-1" },
      },
    };
    const approved = {
      ...pending,
      status: "APPROVED",
      approvalComment: "Dérogation validée par le responsable qualité.",
      approvedById: admin.user.id,
      approvedBy: { id: admin.user.id, displayName: admin.user.displayName },
      decidedAt: new Date("2026-01-01T13:00:00Z"),
      completedAt: new Date("2026-01-01T13:00:00Z"),
    };
    const transaction = {
      qualityDisposition: {
        findUnique: vi.fn().mockResolvedValue(pending),
        update: vi.fn().mockResolvedValue(approved),
      },
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
      service.decideDeviation(admin, pending.id, {
        decision: "APPROVE",
        comment: approved.approvalComment,
      }),
    ).resolves.toMatchObject({ status: "APPROVED", approvedById: admin.user.id });
    expect(transaction.pieceUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACCEPTED" }) }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "QUALITY_DEVIATION_APPROVED" }),
      }),
    );
  });
});
