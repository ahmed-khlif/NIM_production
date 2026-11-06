import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PieceUnitStatus } from "@prisma/client";
import {
  createAssignmentSchema,
  reassignAssignmentSchema,
  unassignAssignmentSchema,
} from "@nim/validation";
import type {
  AssignablePieceUnit,
  ManagedAssignment,
  MachineStatus as ManagedMachineStatus,
  PiecePriority,
  PieceStatus,
  PieceUnitStatus as ManagedPieceUnitStatus,
} from "@nim/types";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { parseListSort } from "../list-sorting";
import { deliverBusinessNotification } from "../notifications/notification-delivery";
import { RealtimeService } from "../realtime/realtime.service";

const assignmentInclude = {
  pieceUnit: { include: { piece: true } },
  machine: true,
  barAssignment: { select: { cuttingBarId: true } },
} as const;

type AssignmentWithRelations = Prisma.AssignmentGetPayload<{ include: typeof assignmentInclude }>;

@Injectable()
export class AssignmentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(RealtimeService) private readonly realtime?: RealtimeService,
  ) {}

  private toManagedAssignment(assignment: AssignmentWithRelations): ManagedAssignment {
    return {
      id: assignment.id,
      offerId: assignment.pieceUnit.piece.offerId,
      barId: assignment.barAssignment?.cuttingBarId ?? null,
      pieceUnitId: assignment.pieceUnitId,
      pieceId: assignment.pieceUnit.pieceId,
      reference: assignment.pieceUnit.piece.reference,
      sequenceNumber: assignment.pieceUnit.sequenceNumber,
      profile: assignment.pieceUnit.piece.profile,
      unitStatus: assignment.pieceUnit.status as ManagedPieceUnitStatus,
      pieceStatus: assignment.pieceUnit.piece.status as PieceStatus,
      priority: assignment.pieceUnit.piece.priority as PiecePriority,
      machineId: assignment.machineId,
      machineName: assignment.machine.name,
      machineStatus: assignment.machine.status as ManagedMachineStatus,
      assignedById: assignment.assignedById,
      assignedAt: assignment.assignedAt.toISOString(),
      queuePosition: assignment.queuePosition,
      active: assignment.active,
      reason: assignment.reason,
    };
  }

  private toAssignableUnit(unit: {
    id: string;
    pieceId: string;
    sequenceNumber: number;
    status: PieceUnitStatus;
    piece: { reference: string; profile: string; priority: PiecePriority };
  }): AssignablePieceUnit {
    return {
      id: unit.id,
      pieceId: unit.pieceId,
      reference: unit.piece.reference,
      sequenceNumber: unit.sequenceNumber,
      profile: unit.piece.profile,
      status: unit.status as ManagedPieceUnitStatus,
      priority: unit.piece.priority as PiecePriority,
    };
  }

  async listAssignments(offerId?: string, options: { page?: number; pageSize?: number; search?: string; machineId?: string; sortBy?: string; sortDirection?: string } = {}) {
    const normalizedOfferId = offerId?.trim() || undefined;
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const search = options.search?.trim();
    if (!Number.isInteger(page) || page < 1 || page > 1_000_000 || ![10, 20, 50].includes(pageSize)) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "La pagination des affectations est invalide." });
    }
    if (search && search.length > 80) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "La recherche est trop longue." });
    if (normalizedOfferId) {
      const offer = await this.prisma.offer.findUnique({
        where: { id: normalizedOfferId },
        select: { id: true },
      });
      if (!offer) {
        throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Offre introuvable." });
      }
    }
    const where: Prisma.AssignmentWhereInput = {
      active: true,
      ...(options.machineId ? { machineId: options.machineId } : {}),
      ...(normalizedOfferId ? { pieceUnit: { piece: { offerId: normalizedOfferId } } } : {}),
      ...(search ? { OR: [
        { pieceUnit: { piece: { reference: { contains: search, mode: "insensitive" } } } },
        { pieceUnit: { piece: { profile: { contains: search, mode: "insensitive" } } } },
        { machine: { name: { contains: search, mode: "insensitive" } } },
        { machine: { internalNumber: { contains: search, mode: "insensitive" } } },
      ] } : {}),
    };
    const sort = parseListSort(options.sortBy, options.sortDirection, ["reference", "profile", "machine", "priority", "status", "assignedAt"] as const, { sortBy: "assignedAt", sortDirection: "desc" });
    const sortValue = sort.sortDirection;
    const orderBy: Prisma.AssignmentOrderByWithRelationInput[] = sort.sortBy === "reference"
      ? [{ pieceUnit: { piece: { reference: sortValue } } }, { id: "asc" }]
      : sort.sortBy === "profile"
        ? [{ pieceUnit: { piece: { profile: sortValue } } }, { id: "asc" }]
        : sort.sortBy === "machine"
          ? [{ machine: { name: sortValue } }, { id: "asc" }]
          : sort.sortBy === "priority"
            ? [{ pieceUnit: { piece: { priority: sortValue } } }, { id: "asc" }]
            : sort.sortBy === "status"
              ? [{ pieceUnit: { status: sortValue } }, { id: "asc" }]
              : [{ assignedAt: sortValue }, { id: "asc" }];
    const [assignments, total, availableUnitCount, machineGroups] = await Promise.all([
      this.prisma.assignment.findMany({
        where,
        include: assignmentInclude,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.assignment.count({ where }),
      this.prisma.pieceUnit.count({ where: {
          status: "PENDING",
          assignments: { none: { active: true } },
          piece: {
            status: { notIn: ["ARCHIVED", "COMPLETED"] },
            offer: { status: { in: ["READY", "IN_PRODUCTION"] } },
            ...(normalizedOfferId ? { offerId: normalizedOfferId } : {}),
          },
        } }),
      this.prisma.assignment.groupBy({ by: ["machineId"], where: { active: true, ...(normalizedOfferId ? { pieceUnit: { piece: { offerId: normalizedOfferId } } } : {}) }, _count: { _all: true } }),
    ]);
    return {
      assignments: assignments.map((assignment) => this.toManagedAssignment(assignment)),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      availableUnitCount,
      activeMachineCount: machineGroups.length,
    };
  }

  async listAvailableUnits(offerId?: string, options: { page?: number; pageSize?: number; search?: string } = {}) {
    const normalizedOfferId = offerId?.trim() || undefined;
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const search = options.search?.trim();
    if (!Number.isInteger(page) || page < 1 || page > 1_000_000 || ![10, 20, 50].includes(pageSize)) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "La pagination des unités disponibles est invalide." });
    }
    if (search && search.length > 80) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "La recherche est trop longue." });
    if (normalizedOfferId && !(await this.prisma.offer.findUnique({ where: { id: normalizedOfferId }, select: { id: true } }))) {
      throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Offre introuvable." });
    }
    const where: Prisma.PieceUnitWhereInput = {
      status: "PENDING",
      assignments: { none: { active: true } },
      piece: {
        status: { notIn: ["ARCHIVED", "COMPLETED"] },
        offer: { status: { in: ["READY", "IN_PRODUCTION"] } },
        ...(normalizedOfferId ? { offerId: normalizedOfferId } : {}),
        ...(search ? { OR: [
          { reference: { contains: search, mode: "insensitive" } },
          { profile: { contains: search, mode: "insensitive" } },
        ] } : {}),
      },
    };
    const [units, total] = await Promise.all([
      this.prisma.pieceUnit.findMany({ where, include: { piece: { select: { reference: true, profile: true, priority: true } } }, orderBy: [{ pieceId: "asc" }, { sequenceNumber: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.pieceUnit.count({ where }),
    ]);
    return { availableUnits: units.map((unit) => this.toAssignableUnit(unit)), pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async assign(actor: AuthContext, input: unknown): Promise<ManagedAssignment> {
    const parsed = createAssignmentSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Vérifiez les informations de l’affectation.",
        details: parsed.error.flatten(),
      });

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const [unit, machine, activeAssignment] = await Promise.all([
          transaction.pieceUnit.findUnique({
            where: { id: parsed.data.pieceUnitId },
            include: { piece: true },
          }),
          transaction.machine.findUnique({ where: { id: parsed.data.machineId } }),
          transaction.assignment.findFirst({
            where: { pieceUnitId: parsed.data.pieceUnitId, active: true },
            select: { id: true },
          }),
        ]);
        if (!unit)
          throw new NotFoundException({
            code: "PIECE_UNIT_NOT_FOUND",
            message: "Unité de pièce introuvable.",
          });
        if (!machine)
          throw new NotFoundException({
            code: "MACHINE_NOT_FOUND",
            message: "Machine introuvable.",
          });
        if (activeAssignment || unit.status === "ASSIGNED")
          throw new ConflictException({
            code: "UNIT_ALREADY_ASSIGNED",
            message: "Cette unité est déjà affectée.",
          });
        if (unit.status !== "PENDING")
          throw new ConflictException({
            code: "UNIT_NOT_ASSIGNABLE",
            message: "Cette unité ne peut plus être affectée dans son état actuel.",
          });
        if (machine.status !== "ACTIVE")
          throw new ConflictException({
            code: "MACHINE_UNAVAILABLE",
            message:
              "Une machine inactive ou en maintenance ne peut pas recevoir de nouvelle affectation.",
          });
        if (unit.piece.status === "ARCHIVED" || unit.piece.status === "COMPLETED")
          throw new ConflictException({
            code: "PIECE_NOT_ASSIGNABLE",
            message: "Cette pièce ne peut plus recevoir d’affectation.",
          });

        const offer = await transaction.offer.findUnique({
          where: { id: unit.piece.offerId },
          select: { status: true },
        });
        if (!offer || !["READY", "IN_PRODUCTION"].includes(offer.status)) {
          throw new ConflictException({
            code: "OFFER_NOT_READY_FOR_ASSIGNMENT",
            message:
              "Validez d’abord le plan de mise en barres de l’offre avant d’affecter ses pièces.",
          });
        }
        const offerHasBarTracking = await transaction.cuttingBar.count({
          where: { offerId: unit.piece.offerId },
        });
        if (offerHasBarTracking > 0) {
          throw new ConflictException({
            code: "BAR_ASSIGNMENT_REQUIRED",
            message:
              "Cette offre utilise l’affectation par barres. Affectez les unités depuis l’espace Barres pour préserver leur cohérence.",
          });
        }

        const assignment = await transaction.assignment.create({
          data: {
            pieceUnitId: unit.id,
            machineId: machine.id,
            assignedById: actor.user.id,
            queuePosition: parsed.data.queuePosition,
            reason: parsed.data.reason || null,
          },
          include: assignmentInclude,
        });
        await transaction.pieceUnit.update({
          where: { id: unit.id },
          data: {
            status: "ASSIGNED",
            productionStatus: "AFFECTEE",
            currentMachineId: machine.id,
            version: { increment: 1 },
          },
        });
        if (unit.piece.status === "PLANNED")
          await transaction.piece.update({
            where: { id: unit.pieceId },
            data: { status: "ASSIGNED", version: { increment: 1 } },
          });
        const event = await transaction.historyEvent.create({
          data: {
            eventType: "ASSIGNMENT_CREATED",
            entityType: "ASSIGNMENT",
            entityId: assignment.id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: {
              offerId: unit.piece.offerId,
              pieceUnitId: unit.id,
              pieceId: unit.pieceId,
              reference: unit.piece.reference,
              machineId: machine.id,
              queuePosition: assignment.queuePosition,
            },
          },
        });
        await deliverBusinessNotification(transaction, event, { offerId: unit.piece.offerId, machineId: machine.id });
        return this.toManagedAssignment({
          ...assignment,
          pieceUnit: {
            ...assignment.pieceUnit,
            status: "ASSIGNED" as typeof assignment.pieceUnit.status,
            piece: {
              ...assignment.pieceUnit.piece,
              status:
                unit.piece.status === "PLANNED"
                  ? ("ASSIGNED" as typeof assignment.pieceUnit.piece.status)
                  : unit.piece.status,
            },
          },
        });
      });
      this.realtime?.publish({
        type: "piece.assigned",
        entityType: "ASSIGNMENT",
        entityId: result.id,
        actorUserId: actor.user.id,
      });
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException({
          code: "UNIT_ALREADY_ASSIGNED",
          message: "Cette unité est déjà affectée.",
        });
      throw error;
    }
  }

  async reassign(actor: AuthContext, id: string, input: unknown): Promise<ManagedAssignment> {
    const parsed = reassignAssignmentSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Vérifiez les informations de réaffectation.",
        details: parsed.error.flatten(),
      });

    const result = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.assignment.findUnique({
        where: { id },
        include: assignmentInclude,
      });
      if (!existing)
        throw new NotFoundException({
          code: "ASSIGNMENT_NOT_FOUND",
          message: "Affectation introuvable.",
        });
      if (!existing.active)
        throw new ConflictException({
          code: "ASSIGNMENT_INACTIVE",
          message: "Cette affectation n’est plus active.",
        });
      if (existing.barAssignmentId)
        throw new ConflictException({
          code: "BAR_ASSIGNMENT_REQUIRED",
          message:
            "Cette unité appartient à une barre affectée. Gérez l’affectation depuis l’espace Barres afin de garder toute la barre sur la même machine.",
        });
      if (existing.pieceUnit.status !== "ASSIGNED")
        throw new ConflictException({
          code: "UNIT_NOT_REASSIGNABLE",
          message: "Une unité en fabrication ne peut pas être réaffectée.",
        });
      if (existing.machineId === parsed.data.machineId)
        throw new ConflictException({
          code: "SAME_MACHINE",
          message: "La nouvelle machine doit être différente.",
        });

      const offer = await transaction.offer.findUnique({
        where: { id: existing.pieceUnit.piece.offerId },
        select: { status: true },
      });
      if (!offer || !["READY", "IN_PRODUCTION"].includes(offer.status)) {
        throw new ConflictException({
          code: "OFFER_NOT_READY_FOR_ASSIGNMENT",
          message: "Cette offre n’est pas dans un état permettant la réaffectation.",
        });
      }

      const machine = await transaction.machine.findUnique({
        where: { id: parsed.data.machineId },
      });
      if (!machine)
        throw new NotFoundException({ code: "MACHINE_NOT_FOUND", message: "Machine introuvable." });
      if (machine.status !== "ACTIVE")
        throw new ConflictException({
          code: "MACHINE_UNAVAILABLE",
          message:
            "Une machine inactive ou en maintenance ne peut pas recevoir de nouvelle affectation.",
        });

      await transaction.assignment.update({
        where: { id },
        data: {
          active: false,
          unassignedAt: new Date(),
          reason: parsed.data.reason,
          version: { increment: 1 },
        },
      });
      const replacement = await transaction.assignment.create({
        data: {
          pieceUnitId: existing.pieceUnitId,
          machineId: machine.id,
          assignedById: actor.user.id,
          queuePosition: parsed.data.queuePosition ?? existing.queuePosition,
          reason: parsed.data.reason,
        },
        include: assignmentInclude,
      });
      await transaction.pieceUnit.update({
        where: { id: existing.pieceUnitId },
        data: { currentMachineId: machine.id, version: { increment: 1 } },
      });
      const event = await transaction.historyEvent.create({
        data: {
          eventType: "ASSIGNMENT_REASSIGNED",
          entityType: "ASSIGNMENT",
          entityId: replacement.id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: {
            offerId: existing.pieceUnit.piece.offerId,
            previousAssignmentId: id,
            pieceUnitId: existing.pieceUnitId,
            pieceId: existing.pieceUnit.pieceId,
            reference: existing.pieceUnit.piece.reference,
            oldMachineId: existing.machineId,
            newMachineId: machine.id,
            reason: parsed.data.reason,
          },
        },
      });
      await deliverBusinessNotification(transaction, event, { offerId: existing.pieceUnit.piece.offerId, machineId: machine.id });
      return this.toManagedAssignment(replacement);
    });
    this.realtime?.publish({
      type: "piece.reassigned",
      entityType: "ASSIGNMENT",
      entityId: result.id,
      actorUserId: actor.user.id,
    });
    return result;
  }

  async unassign(actor: AuthContext, id: string, input: unknown): Promise<ManagedAssignment> {
    const parsed = unassignAssignmentSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Un indiquez un motif de désaffectation.",
        details: parsed.error.flatten(),
      });

    const result = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.assignment.findUnique({
        where: { id },
        include: assignmentInclude,
      });
      if (!existing)
        throw new NotFoundException({
          code: "ASSIGNMENT_NOT_FOUND",
          message: "Affectation introuvable.",
        });
      if (!existing.active)
        throw new ConflictException({
          code: "ASSIGNMENT_INACTIVE",
          message: "Cette affectation n’est plus active.",
        });
      if (existing.barAssignmentId)
        throw new ConflictException({
          code: "BAR_ASSIGNMENT_REQUIRED",
          message:
            "Cette unité appartient à une barre affectée. Gérez l’affectation depuis l’espace Barres afin de conserver son historique.",
        });
      if (existing.pieceUnit.status !== "ASSIGNED")
        throw new ConflictException({
          code: "UNIT_NOT_UNASSIGNABLE",
          message: "Une unité en fabrication ne peut pas être désaffectée.",
        });

      const closed = await transaction.assignment.update({
        where: { id },
        data: {
          active: false,
          unassignedAt: new Date(),
          reason: parsed.data.reason,
          version: { increment: 1 },
        },
        include: assignmentInclude,
      });
      await transaction.pieceUnit.update({
        where: { id: existing.pieceUnitId },
        data: {
          status: "PENDING",
          productionStatus:
            existing.pieceUnit.productionStatus === "FACONNEE" ? "FACONNEE" : "PENDING",
          currentMachineId: null,
          version: { increment: 1 },
        },
      });
      const remaining = await transaction.assignment.count({
        where: { active: true, pieceUnit: { pieceId: existing.pieceUnit.pieceId } },
      });
      if (remaining === 0 && existing.pieceUnit.piece.status === "ASSIGNED")
        await transaction.piece.update({
          where: { id: existing.pieceUnit.pieceId },
          data: { status: "PLANNED", version: { increment: 1 } },
        });
      const event = await transaction.historyEvent.create({
        data: {
          eventType: "ASSIGNMENT_UNASSIGNED",
          entityType: "ASSIGNMENT",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: {
            offerId: existing.pieceUnit.piece.offerId,
            pieceUnitId: existing.pieceUnitId,
            pieceId: existing.pieceUnit.pieceId,
            reference: existing.pieceUnit.piece.reference,
            machineId: existing.machineId,
            reason: parsed.data.reason,
          },
        },
      });
      await deliverBusinessNotification(transaction, event, { offerId: existing.pieceUnit.piece.offerId, machineId: existing.machineId });
      return this.toManagedAssignment({
        ...closed,
        pieceUnit: {
          ...closed.pieceUnit,
          status: "PENDING" as typeof closed.pieceUnit.status,
          piece: {
            ...closed.pieceUnit.piece,
            status:
              remaining === 0 && existing.pieceUnit.piece.status === "ASSIGNED"
                ? ("PLANNED" as typeof closed.pieceUnit.piece.status)
                : existing.pieceUnit.piece.status,
          },
        },
      });
    });
    this.realtime?.publish({
      type: "piece.unassigned",
      entityType: "ASSIGNMENT",
      entityId: result.id,
      actorUserId: actor.user.id,
    });
    return result;
  }
}
