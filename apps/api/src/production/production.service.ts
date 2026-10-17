import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { productionCurrentQuerySchema, startProductionSchema } from "@nim/validation";
import type { ManagedProductionOperation, ProductionQueueItem } from "@nim/types";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

const operationInclude = {
  piece: true,
  pieceUnit: true,
  machine: true,
  operator: { select: { id: true, displayName: true } },
} as const;

const queueInclude = {
  pieceUnit: { include: { piece: true } },
  machine: true,
} as const;

type OperationWithRelations = Prisma.ProductionOperationGetPayload<{
  include: typeof operationInclude;
}>;
type QueueAssignment = Prisma.AssignmentGetPayload<{ include: typeof queueInclude }>;

@Injectable()
export class ProductionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(RealtimeService) private readonly realtime?: RealtimeService,
  ) {}

  private toManagedOperation(operation: OperationWithRelations): ManagedProductionOperation {
    return {
      id: operation.id,
      pieceId: operation.pieceId,
      pieceUnitId: operation.pieceUnitId,
      reference: operation.piece.reference,
      sequenceNumber: operation.pieceUnit.sequenceNumber,
      profile: operation.piece.profile,
      lengthMm: operation.piece.lengthMm,
      machineId: operation.machineId,
      machineName: operation.machine.name,
      operatorId: operation.operatorId,
      operatorName: operation.operator.displayName,
      status: operation.status,
      unitStatus: operation.pieceUnit.status,
      pieceStatus: operation.piece.status,
      startedAt: operation.startedAt.toISOString(),
      completedAt: operation.completedAt?.toISOString() ?? null,
    };
  }

  private toQueueItem(assignment: QueueAssignment): ProductionQueueItem {
    return {
      pieceUnitId: assignment.pieceUnitId,
      pieceId: assignment.pieceUnit.pieceId,
      reference: assignment.pieceUnit.piece.reference,
      sequenceNumber: assignment.pieceUnit.sequenceNumber,
      profile: assignment.pieceUnit.piece.profile,
      lengthMm: assignment.pieceUnit.piece.lengthMm,
      priority: assignment.pieceUnit.piece.priority,
      status: assignment.pieceUnit.status,
      machineId: assignment.machineId,
      machineName: assignment.machine.name,
      assignedAt: assignment.assignedAt.toISOString(),
      queuePosition: assignment.queuePosition,
    };
  }

  async getCurrent(
    actor: AuthContext,
    input: unknown,
  ): Promise<{ current: ManagedProductionOperation | null; queue: ProductionQueueItem[] }> {
    const rawMachineId =
      input && typeof input === "object" && "machineId" in input
        ? (input as { machineId?: unknown }).machineId
        : undefined;
    const parsed = productionCurrentQuerySchema.safeParse({ machineId: rawMachineId });
    const offerId =
      input && typeof input === "object" && "offerId" in input
        ? String((input as { offerId?: unknown }).offerId ?? "").trim() || undefined
        : undefined;
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La machine sélectionnée est invalide.",
        details: parsed.error.flatten(),
      });
    }
    if (offerId) {
      const offer = await this.prisma.offer.findUnique({
        where: { id: offerId },
        select: { id: true },
      });
      if (!offer) {
        throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Offre introuvable." });
      }
    }

    const currentPromise = this.prisma.productionOperation.findFirst({
      where: {
        operatorId: actor.user.id,
        status: "IN_PROGRESS",
        ...(offerId ? { piece: { offerId } } : {}),
      },
      include: operationInclude,
      orderBy: { startedAt: "desc" },
    });
    const queuePromise = parsed.data.machineId
      ? this.prisma.assignment.findMany({
          where: {
            machineId: parsed.data.machineId,
            active: true,
            pieceUnit: {
              status: "ASSIGNED",
              ...(offerId ? { piece: { offerId } } : {}),
            },
          },
          include: queueInclude,
          orderBy: [{ queuePosition: "asc" }, { assignedAt: "asc" }],
        })
      : Promise.resolve([] as QueueAssignment[]);

    const [current, queue] = await Promise.all([currentPromise, queuePromise]);
    return {
      current: current ? this.toManagedOperation(current) : null,
      queue: queue.map((assignment) => this.toQueueItem(assignment)),
    };
  }

  async start(actor: AuthContext, input: unknown): Promise<ManagedProductionOperation> {
    const parsed = startProductionSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Sélectionnez une unité et une machine valides.",
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const [unit, machine, assignment, activeOperatorOperation] = await Promise.all([
          transaction.pieceUnit.findUnique({
            where: { id: parsed.data.pieceUnitId },
            include: { piece: true },
          }),
          transaction.machine.findUnique({ where: { id: parsed.data.machineId } }),
          transaction.assignment.findFirst({
            where: {
              pieceUnitId: parsed.data.pieceUnitId,
              machineId: parsed.data.machineId,
              active: true,
            },
          }),
          transaction.productionOperation.findFirst({
            where: { operatorId: actor.user.id, status: "IN_PROGRESS" },
            select: { id: true },
          }),
        ]);

        if (!unit) {
          throw new NotFoundException({
            code: "PIECE_UNIT_NOT_FOUND",
            message: "Unité de pièce introuvable.",
          });
        }
        if (!machine) {
          throw new NotFoundException({
            code: "MACHINE_NOT_FOUND",
            message: "Machine introuvable.",
          });
        }
        if (machine.status !== "ACTIVE") {
          throw new ConflictException({
            code:
              machine.status === "MAINTENANCE" ? "MACHINE_IN_MAINTENANCE" : "MACHINE_UNAVAILABLE",
            message: "Cette machine ne peut pas démarrer une nouvelle production.",
          });
        }
        if (!assignment) {
          throw new ConflictException({
            code: "UNIT_NOT_ASSIGNED_TO_MACHINE",
            message: "Cette unité n'est pas affectée à la machine sélectionnée.",
          });
        }
        if (unit.status !== "ASSIGNED") {
          throw new ConflictException({
            code:
              unit.status === "IN_PROGRESS"
                ? "UNIT_ALREADY_IN_PRODUCTION"
                : "INVALID_STATE_TRANSITION",
            message: "Cette unité ne peut pas démarrer dans son état actuel.",
          });
        }
        if (unit.piece.status === "ARCHIVED" || unit.piece.status === "COMPLETED") {
          throw new ConflictException({
            code: "PIECE_NOT_IN_PRODUCTION",
            message: "Cette pièce ne peut plus démarrer de production.",
          });
        }
        const offer = await transaction.offer.findUnique({
          where: { id: unit.piece.offerId },
          select: { id: true, reference: true, status: true },
        });
        if (!offer || !["READY", "IN_PRODUCTION"].includes(offer.status)) {
          throw new ConflictException({
            code: "OFFER_NOT_READY_FOR_PRODUCTION",
            message: "L’offre doit disposer d’un plan validé avant de démarrer la production.",
          });
        }
        if (activeOperatorOperation) {
          throw new ConflictException({
            code: "OPERATOR_ALREADY_IN_PRODUCTION",
            message: "Terminez l'opération en cours avant d'en démarrer une autre.",
          });
        }

        const startedAt = new Date();
        const operation = await transaction.productionOperation.create({
          data: {
            pieceId: unit.pieceId,
            pieceUnitId: unit.id,
            machineId: machine.id,
            operatorId: actor.user.id,
            startedAt,
          },
          include: operationInclude,
        });
        await transaction.pieceUnit.update({
          where: { id: unit.id },
          data: {
            status: "IN_PROGRESS",
            productionStatus: "LANCEE",
            currentOperatorId: actor.user.id,
            startedAt,
            version: { increment: 1 },
          },
        });
        const barItem = await transaction.cuttingBarItem.findFirst({
          where: { pieceUnitId: unit.id, active: true },
          include: { cuttingBar: true },
        });
        if (barItem && barItem.cuttingBar.status === "AFFECTEE") {
          const barTransition = await transaction.cuttingBar.updateMany({
            where: { id: barItem.cuttingBarId, status: "AFFECTEE" },
            data: { status: "LANCEE" },
          });
          if (barTransition.count === 1) {
            await transaction.historyEvent.create({
              data: {
                eventType: "BAR_PRODUCTION_STARTED",
                entityType: "CUTTING_BAR",
                entityId: barItem.cuttingBarId,
                actorUserId: actor.user.id,
                actorRole: actor.user.role,
                metadata: {
                  offerId: unit.piece.offerId,
                  pieceUnitId: unit.id,
                  previousStatus: "AFFECTEE",
                  newStatus: "LANCEE",
                  machineId: machine.id,
                },
              },
            });
          }
        }
        const nextPieceStatus =
          unit.piece.status === "ASSIGNED" ? "IN_PROGRESS" : unit.piece.status;
        if (nextPieceStatus !== unit.piece.status) {
          await transaction.piece.update({
            where: { id: unit.pieceId },
            data: { status: nextPieceStatus, version: { increment: 1 } },
          });
        }
        if (offer.status === "READY") {
          await transaction.offer.update({
            where: { id: offer.id },
            data: { status: "IN_PRODUCTION", version: { increment: 1 } },
          });
          await transaction.historyEvent.create({
            data: {
              eventType: "OFFER_PRODUCTION_STARTED",
              entityType: "OFFER",
              entityId: offer.id,
              actorUserId: actor.user.id,
              actorRole: actor.user.role,
              metadata: {
                offerId: offer.id,
                reference: offer.reference,
                operationId: operation.id,
              },
            },
          });
        }
        await transaction.historyEvent.create({
          data: {
            eventType: "PRODUCTION_STARTED",
            entityType: "PRODUCTION_OPERATION",
            entityId: operation.id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: {
              offerId: unit.piece.offerId,
              pieceId: unit.pieceId,
              pieceUnitId: unit.id,
              machineId: machine.id,
              oldUnitStatus: unit.status,
              newUnitStatus: "IN_PROGRESS",
              oldPieceStatus: unit.piece.status,
              newPieceStatus: nextPieceStatus,
            },
          },
        });

        return this.toManagedOperation({
          ...operation,
          piece: { ...operation.piece, status: nextPieceStatus },
          pieceUnit: { ...operation.pieceUnit, status: "IN_PROGRESS" },
        });
      });
      this.realtime?.publish({
        type: "production.started",
        entityType: "PRODUCTION_OPERATION",
        entityId: result.id,
        actorUserId: actor.user.id,
      });
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          code: "OPERATION_ALREADY_ACTIVE",
          message: "Cette unité ou cet opérateur a déjà une opération en cours.",
        });
      }
      throw error;
    }
  }

  async complete(actor: AuthContext, operationId: string): Promise<ManagedProductionOperation> {
    const result = await this.prisma.$transaction(async (transaction) => {
      const operation = await transaction.productionOperation.findUnique({
        where: { id: operationId },
        include: operationInclude,
      });
      if (!operation) {
        throw new NotFoundException({
          code: "PRODUCTION_OPERATION_NOT_FOUND",
          message: "Opération de production introuvable.",
        });
      }
      if (
        operation.operatorId !== actor.user.id &&
        !["ADMIN", "PRODUCTION_MANAGER"].includes(actor.user.role)
      ) {
        throw new ForbiddenException({
          code: "PERMISSION_DENIED",
          message: "Vous ne pouvez pas terminer l'opération d'un autre opérateur.",
        });
      }
      if (operation.status !== "IN_PROGRESS" || operation.pieceUnit.status !== "IN_PROGRESS") {
        throw new ConflictException({
          code: "UNIT_ALREADY_COMPLETED",
          message: "Cette unité a déjà été terminée ou n'est plus en production.",
        });
      }

      const completedAt = new Date();
      const remainingUnits = await transaction.pieceUnit.count({
        where: {
          pieceId: operation.pieceId,
          status: { notIn: ["QUALITY_PENDING", "COMPLETED", "ACCEPTED", "REJECTED", "SCRAPPED"] },
        },
      });
      const nextPieceStatus = remainingUnits === 1 ? "COMPLETED" : operation.piece.status;
      const operationUpdate = await transaction.productionOperation.updateMany({
        where: { id: operation.id, status: "IN_PROGRESS", version: operation.version },
        data: { status: "COMPLETED", completedAt, version: { increment: 1 } },
      });
      if (operationUpdate.count !== 1) {
        throw new ConflictException({
          code: "PRODUCTION_CONCURRENT_UPDATE",
          message: "Cette opération a été modifiée par une autre requête.",
        });
      }
      const unitUpdate = await transaction.pieceUnit.updateMany({
        where: {
          id: operation.pieceUnitId,
          status: "IN_PROGRESS",
          version: operation.pieceUnit.version,
        },
        data: {
          status: "QUALITY_PENDING",
          productionStatus: "FABRIQUEE",
          currentOperatorId: null,
          manufacturedAt: completedAt,
          version: { increment: 1 },
        },
      });
      if (unitUpdate.count !== 1) {
        throw new ConflictException({
          code: "PRODUCTION_CONCURRENT_UPDATE",
          message: "Cette unité a été modifiée par une autre requête.",
        });
      }
      const barItem = await transaction.cuttingBarItem.findFirst({
        where: { pieceUnitId: operation.pieceUnitId, active: true },
        include: { cuttingBar: true },
      });
      if (barItem && barItem.cuttingBar.status === "LANCEE") {
        const unitsRemaining = await transaction.cuttingBarItem.count({
          where: {
            cuttingBarId: barItem.cuttingBarId,
            active: true,
            pieceUnit: {
              status: {
                notIn: ["COMPLETED", "QUALITY_PENDING", "ACCEPTED", "REJECTED", "SCRAPPED"],
              },
            },
          },
        });
        if (unitsRemaining === 0) {
          const barTransition = await transaction.cuttingBar.updateMany({
            where: { id: barItem.cuttingBarId, status: "LANCEE" },
            data: { status: "FABRIQUEE", fabricatedAt: completedAt },
          });
          if (barTransition.count === 1) {
            await transaction.historyEvent.create({
              data: {
                eventType: "BAR_PRODUCTION_COMPLETED",
                entityType: "CUTTING_BAR",
                entityId: barItem.cuttingBarId,
                actorUserId: actor.user.id,
                actorRole: actor.user.role,
                metadata: {
                  offerId: operation.piece.offerId,
                  previousStatus: "LANCEE",
                  newStatus: "FABRIQUEE",
                  completedAt: completedAt.toISOString(),
                },
              },
            });
          }
        }
      }
      if (nextPieceStatus !== operation.piece.status) {
        await transaction.piece.update({
          where: { id: operation.pieceId },
          data: { status: nextPieceStatus, version: { increment: 1 } },
        });
      }
      await transaction.historyEvent.create({
        data: {
          eventType: "PRODUCTION_COMPLETED",
          entityType: "PRODUCTION_OPERATION",
          entityId: operation.id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: {
            offerId: operation.piece.offerId,
            pieceId: operation.pieceId,
            pieceUnitId: operation.pieceUnitId,
            machineId: operation.machineId,
            operatorId: operation.operatorId,
            oldUnitStatus: operation.pieceUnit.status,
            newUnitStatus: "QUALITY_PENDING",
            oldPieceStatus: operation.piece.status,
            newPieceStatus: nextPieceStatus,
          },
        },
      });

      const completed = await transaction.productionOperation.findUnique({
        where: { id: operation.id },
        include: operationInclude,
      });
      if (!completed) {
        throw new ConflictException({
          code: "PRODUCTION_OPERATION_NOT_FOUND",
          message: "L'opération terminée est introuvable.",
        });
      }

      return this.toManagedOperation({
        ...completed,
        piece: { ...completed.piece, status: nextPieceStatus },
        pieceUnit: { ...completed.pieceUnit, status: "QUALITY_PENDING" },
      });
    });
    this.realtime?.publish({
      type: "production.completed",
      entityType: "PRODUCTION_OPERATION",
      entityId: result.id,
      actorUserId: actor.user.id,
    });
    return result;
  }

  async finish(actor: AuthContext, operationId: string): Promise<ManagedProductionOperation> {
    return this.complete(actor, operationId);
  }
}
