import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  productionMonitorQuerySchema,
  productionNonConformityQuerySchema,
  reportProductionNonConformitySchema,
  startMachineSessionSchema,
  updateMachineSessionTeamSchema,
} from "@nim/validation";
import type {
  MachineSessionMember,
  MachineSessionSummary,
  ManagedCuttingBar,
  OperatorIdentity,
  ProductionMonitorBar,
  ProductionNonConformity,
  ProductionRunSummary,
  TabletMachineOption,
  TabletProductionRun,
} from "@nim/types";
import { randomUUID } from "node:crypto";
import type { OperatorAuthContext } from "../operators/operator-auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { deliverBusinessNotification } from "../notifications/notification-delivery";
import { RealtimeService } from "../realtime/realtime.service";

const machineSelect = {
  id: true,
  name: true,
  internalNumber: true,
  type: true,
  status: true,
} as const;
const operatorSelect = { id: true, displayName: true } as const;
const OPERATOR_ONLINE_WINDOW_MS = 45_000;
const sessionInclude = {
  machine: { select: machineSelect },
  members: { include: { operator: { select: operatorSelect } }, orderBy: { joinedAt: "asc" } },
} as const;
const nonConformityInclude = {
  pieceUnit: { include: { piece: { select: { id: true, offerId: true, reference: true } } } },
  cuttingBar: { select: { id: true, reference: true } },
  offer: { select: { id: true, reference: true } },
  machine: { select: { id: true, name: true } },
  reportedByOperator: { select: operatorSelect },
} as const;
const barInclude = {
  offer: { select: { id: true, reference: true, status: true } },
  items: {
    where: { active: true },
    include: {
      pieceUnit: {
        include: {
          piece: {
            select: {
              id: true,
              offerId: true,
              reference: true,
              profile: true,
              lengthMm: true,
              unitWeightKg: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
  assignments: {
    where: { active: true },
    include: { machine: { select: machineSelect } },
    orderBy: { assignedAt: "desc" },
    take: 1,
  },
  nonConformities: {
    where: { status: "OPEN" },
    include: nonConformityInclude,
    orderBy: { reportedAt: "desc" },
  },
} as const;
const runInclude = {
  cuttingBar: { include: barInclude },
  machine: { select: machineSelect },
  machineSession: { include: sessionInclude },
  startedByOperator: { select: operatorSelect },
  nonConformities: {
    where: { status: "OPEN" },
    include: nonConformityInclude,
    orderBy: { reportedAt: "desc" },
  },
} as const;
type SessionRecord = Prisma.MachineSessionGetPayload<{ include: typeof sessionInclude }>;
type BarRecord = Prisma.CuttingBarGetPayload<{ include: typeof barInclude }>;
type RunRecord = Prisma.ProductionRunGetPayload<{ include: typeof runInclude }>;
type NonConformityRecord = Prisma.NonConformityGetPayload<{ include: typeof nonConformityInclude }>;

function toIdentity(operator: OperatorIdentity): OperatorIdentity {
  return { id: operator.id, displayName: operator.displayName };
}

function toTeam(members: SessionRecord["members"], activeOnly = false): MachineSessionMember[] {
  return members
    .filter((member) => !activeOnly || member.active)
    .map((member) => ({ ...toIdentity(member.operator), role: member.role }));
}

function toSession(session: SessionRecord, activeOnly = false): MachineSessionSummary {
  return {
    id: session.id,
    status: session.status,
    machineId: session.machineId,
    machineName: session.machine.name,
    machineInternalNumber: session.machine.internalNumber,
    leadOperatorId: session.leadOperatorId,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    team: toTeam(session.members, activeOnly),
  };
}

function toNonConformity(row: NonConformityRecord): ProductionNonConformity {
  return {
    id: row.id,
    offerId: row.offerId,
    pieceId: row.pieceId,
    pieceUnitId: row.pieceUnitId,
    cuttingBarId: row.cuttingBarId,
    productionRunId: row.productionRunId,
    machineId: row.machineId,
    pieceReference: row.pieceUnit.piece.reference,
    sequenceNumber: row.pieceUnit.sequenceNumber,
    barReference: row.cuttingBar.reference,
    offerReference: row.offer.reference,
    machineName: row.machine.name,
    reportedBy: toIdentity(row.reportedByOperator),
    reason: row.reason,
    comment: row.comment,
    status: row.status,
    reportedAt: row.reportedAt.toISOString(),
  };
}

function toBar(bar: BarRecord): ManagedCuttingBar {
  const activeAssignment = bar.assignments[0];
  return {
    id: bar.id,
    offerId: bar.offerId,
    offerReference: bar.offer.reference,
    cuttingPlanId: bar.cuttingPlanId,
    reference: bar.reference,
    profile: bar.profile,
    rawLengthMm: bar.rawLengthMm,
    usedLengthMm: bar.usedLengthMm,
    wasteMm: bar.wasteMm,
    status: bar.status,
    qualityStatus: bar.qualityStatus,
    machine: activeAssignment
      ? {
          id: activeAssignment.machine.id,
          name: activeAssignment.machine.name,
          internalNumber: activeAssignment.machine.internalNumber,
        }
      : null,
    items: bar.items.map((item) => ({
      id: item.id,
      pieceUnitId: item.pieceUnitId,
      pieceId: item.pieceUnit.pieceId,
      reference: item.pieceUnit.piece.reference,
      sequenceNumber: item.pieceUnit.sequenceNumber,
      lengthMm: item.pieceUnit.piece.lengthMm,
      weightKg:
        item.pieceUnit.piece.unitWeightKg === null
          ? null
          : Number(item.pieceUnit.piece.unitWeightKg),
      status: item.pieceUnit.status,
      productionStatus: item.pieceUnit.productionStatus,
      qualityStatus: item.pieceUnit.qualityStatus,
      active: item.active,
    })),
    assignmentHistory: bar.assignments.map((assignment) => ({
      id: assignment.id,
      machineId: assignment.machineId,
      machineName: assignment.machine.name,
      assignedAt: assignment.assignedAt.toISOString(),
      unassignedAt: assignment.unassignedAt?.toISOString() ?? null,
      active: assignment.active,
    })),
    createdAt: bar.createdAt.toISOString(),
  };
}

function toRunSummary(run: RunRecord): ProductionRunSummary {
  return {
    id: run.id,
    offerId: run.cuttingBar.offerId,
    offerReference: run.cuttingBar.offer.reference,
    cuttingBarId: run.cuttingBarId,
    barReference: run.cuttingBar.reference,
    profile: run.cuttingBar.profile,
    rawLengthMm: run.cuttingBar.rawLengthMm,
    status: run.status,
    machineId: run.machineId,
    machineName: run.machine.name,
    machineInternalNumber: run.machine.internalNumber,
    machineSessionId: run.machineSessionId,
    startedByOperatorId: run.startedByOperatorId,
    startedBy: toIdentity(run.startedByOperator),
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    cancelledAt: run.cancelledAt?.toISOString() ?? null,
    team: toTeam(run.machineSession.members),
    pieceCount: run.cuttingBar.items.length,
    openNonConformityCount: run.nonConformities.length,
  };
}

function toTabletRun(run: RunRecord): TabletProductionRun {
  return {
    ...toRunSummary(run),
    bar: toBar(run.cuttingBar),
    nonConformities: run.nonConformities.map(toNonConformity),
  };
}

@Injectable()
export class TabletProductionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
  ) {}

  async listActiveMachines(): Promise<{ machines: TabletMachineOption[] }> {
    const machines = await this.prisma.machine.findMany({
      where: { status: "ACTIVE" },
      select: {
        ...machineSelect,
        barAssignments: {
          where: { active: true, cuttingBar: { status: "AFFECTEE" } },
          select: { id: true },
        },
      },
      orderBy: [{ name: "asc" }, { internalNumber: "asc" }],
    });
    return {
      machines: machines.map((machine) => ({
        id: machine.id,
        name: machine.name,
        internalNumber: machine.internalNumber,
        type: machine.type,
        waitingBars: machine.barAssignments.length,
      })),
    };
  }

  async listAvailableOperators(auth: OperatorAuthContext) {
    const operators = await this.prisma.user.findMany({
      where: {
        role: "OPERATOR",
        isActive: true,
        tabletAccessEnabled: true,
        id: { not: auth.operator.id },
        machineSessionMemberships: {
          none: { active: true, machineSession: { status: "ACTIVE" } },
        },
      },
      select: {
        ...operatorSelect,
        machineSessionMemberships: {
          where: { active: true, machineSession: { status: "ACTIVE" } },
          select: { machineSession: { select: { machine: { select: { name: true } } } } },
        },
      },
      orderBy: { displayName: "asc" },
    });
    const onlineCutoff = new Date(Date.now() - OPERATOR_ONLINE_WINDOW_MS);
    const onlineSessions = operators.length
      ? await this.prisma.tabletAuthSession.findMany({
          where: {
            userId: { in: operators.map((operator) => operator.id) },
            revokedAt: null,
            expiresAt: { gt: new Date() },
            lastUsedAt: { not: null },
          },
          select: { userId: true, lastUsedAt: true },
          orderBy: { lastUsedAt: "desc" },
        })
      : [];
    const lastSeenByOperator = new Map<string, Date>();
    for (const session of onlineSessions) {
      if (session.lastUsedAt && !lastSeenByOperator.has(session.userId)) {
        lastSeenByOperator.set(session.userId, session.lastUsedAt);
      }
    }
    return {
      operators: operators
        .map((operator) => {
          const { machineSessionMemberships, ...identity } = operator;
          const activeMachineName =
            machineSessionMemberships?.[0]?.machineSession.machine.name ?? null;
          const lastSeenAt = lastSeenByOperator.get(operator.id) ?? null;
          return {
            ...identity,
            isOnline: Boolean(lastSeenAt && lastSeenAt >= onlineCutoff),
            lastSeenAt: lastSeenAt?.toISOString() ?? null,
            isAvailable: !activeMachineName,
            activeMachineName,
          };
        })
        .sort(
          (a, b) =>
            Number(b.isAvailable) - Number(a.isAvailable) ||
            Number(b.isOnline) - Number(a.isOnline) ||
            a.displayName.localeCompare(b.displayName),
        ),
    };
  }

  async startMachineSession(auth: OperatorAuthContext, input: unknown) {
    const parsed = startMachineSessionSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Choisissez une machine et vérifiez l’équipe sélectionnée.",
        details: parsed.error.flatten(),
      });
    }
    const operatorIds = [auth.operator.id, ...parsed.data.helperOperatorIds];
    try {
      const sessionId = await this.prisma.$transaction(
        async (transaction) => {
          const [machine, operators, existingMembership] = await Promise.all([
            transaction.machine.findUnique({ where: { id: parsed.data.machineId } }),
            transaction.user.findMany({
              where: {
                id: { in: operatorIds },
                role: "OPERATOR",
                isActive: true,
                tabletAccessEnabled: true,
              },
              select: operatorSelect,
            }),
            transaction.machineSessionOperator.findFirst({
              where: {
                operatorId: { in: operatorIds },
                active: true,
                machineSession: { status: "ACTIVE" },
              },
              select: {
                operatorId: true,
                machineSession: { select: { machine: { select: { name: true } } } },
              },
            }),
          ]);
          if (!machine)
            throw new NotFoundException({
              code: "MACHINE_NOT_FOUND",
              message: "Machine introuvable.",
            });
          if (machine.status !== "ACTIVE") {
            throw new ConflictException({
              code: "MACHINE_UNAVAILABLE",
              message: "Cette machine n’est pas disponible.",
            });
          }
          if (operators.length !== operatorIds.length) {
            throw new ConflictException({
              code: "OPERATOR_UNAVAILABLE",
              message:
                "Un compte sélectionné est désactivé, n’a plus le rôle Opérateur ou n’a plus accès à la tablette.",
            });
          }
          if (existingMembership) {
            throw new ConflictException({
              code: "OPERATOR_SESSION_CONFLICT",
              message: `Un membre de l’équipe participe déjà à une session sur ${existingMembership.machineSession.machine.name}. Actualisez la liste et retirez-le de l’équipe.`,
            });
          }
          const session = await transaction.machineSession.create({
            data: { machineId: machine.id, leadOperatorId: auth.operator.id },
          });
          await transaction.machineSessionOperator.createMany({
            data: operatorIds.map((operatorId) => ({
              id: randomUUID(),
              machineSessionId: session.id,
              operatorId,
              role: operatorId === auth.operator.id ? "LEAD" : "HELPER",
            })),
          });
          await transaction.user.update({
            where: { id: auth.operator.id },
            data: { lastLoginAt: new Date() },
          });
          const sessionStartedEvent = await transaction.historyEvent.create({
            data: {
              eventType: "MACHINE_SESSION_STARTED",
              entityType: "MACHINE_SESSION",
              entityId: session.id,
              actorUserId: auth.operator.id,
              actorRole: "OPERATOR",
              metadata: { machineId: machine.id, userIds: operatorIds },
            },
          });
          await deliverBusinessNotification(transaction, sessionStartedEvent, {
            machineId: machine.id,
            targetUserIds: parsed.data.helperOperatorIds,
            href: "/production/tablet",
            skipRoleRecipients: true,
          });
          return session.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      this.realtime.publish({
        type: "machine-session.started",
        entityType: "MACHINE_SESSION",
        entityId: sessionId,
        actorUserId: auth.operator.id,
      });
      return this.getCurrentSession(auth);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034")
      ) {
        throw new ConflictException({
          code: "MACHINE_SESSION_CONFLICT",
          message: "La machine ou un opérateur vient d’être pris par une autre session.",
        });
      }
      throw error;
    }
  }

  async getCurrentSession(
    auth: OperatorAuthContext,
    options: { page?: number; pageSize?: number; search?: string; offerId?: string } = {},
  ) {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const search = options.search?.trim();
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1_000_000 ||
      ![10, 20, 50].includes(pageSize)
    ) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La pagination de la file opérateur est invalide.",
      });
    }
    if (search && search.length > 80)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La recherche est trop longue.",
      });
    if (
      options.offerId !== undefined &&
      (options.offerId.length < 1 || options.offerId.length > 80)
    ) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "L’affaire sélectionnée est invalide.",
      });
    }
    const membership = await this.prisma.machineSessionOperator.findFirst({
      where: { operatorId: auth.operator.id, active: true, machineSession: { status: "ACTIVE" } },
      include: { machineSession: { include: sessionInclude } },
      orderBy: { joinedAt: "desc" },
    });
    if (!membership)
      return {
        session: null,
        operatorsWithUnfinishedProduction: [],
        offers: [],
        bars: [],
        activeRun: null,
        pagination: { page, pageSize, total: 0, totalPages: 1 },
      };

    const session = membership.machineSession;
    const availableOfferBars = await this.prisma.cuttingBar.groupBy({
      by: ["offerId"],
      where: {
        status: "AFFECTEE",
        assignments: { some: { machineId: session.machineId, active: true } },
      },
      _count: { _all: true },
    });
    const offersById = availableOfferBars.length
      ? await this.prisma.offer.findMany({
          where: { id: { in: availableOfferBars.map((row) => row.offerId) } },
          select: { id: true, reference: true, name: true },
        })
      : [];
    const offers = offersById
      .map((offer) => ({
        ...offer,
        barCount: availableOfferBars.find((row) => row.offerId === offer.id)?._count._all ?? 0,
      }))
      .sort((left, right) => left.reference.localeCompare(right.reference, "fr"));
    if (options.offerId && !offers.some((offer) => offer.id === options.offerId)) {
      throw new BadRequestException({
        code: "OFFER_NOT_ASSIGNED_TO_MACHINE",
        message:
          "Cette affaire n’a plus de barre en attente sur cette machine. Actualisez la file.",
      });
    }
    const queueWhere: Prisma.MachineBarAssignmentWhereInput = {
      machineId: session.machineId,
      active: true,
      cuttingBar: {
        status: "AFFECTEE",
        ...(options.offerId ? { offerId: options.offerId } : {}),
        ...(search
          ? {
              OR: [
                { reference: { contains: search, mode: "insensitive" } },
                { profile: { contains: search, mode: "insensitive" } },
                { offer: { reference: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
    };
    const [assignments, total, run] = await Promise.all([
      options.offerId
        ? this.prisma.machineBarAssignment.findMany({
            where: queueWhere,
            include: { cuttingBar: { include: barInclude } },
            orderBy: [
              { cuttingBar: { profile: "asc" } },
              { cuttingBar: { reference: "asc" } },
              { assignedAt: "asc" },
            ],
            skip: (page - 1) * pageSize,
            take: pageSize,
          })
        : Promise.resolve([]),
      options.offerId
        ? this.prisma.machineBarAssignment.count({ where: queueWhere })
        : Promise.resolve(0),
      this.prisma.productionRun.findFirst({
        where: { machineSessionId: session.id, status: "RUNNING" },
        include: runInclude,
      }),
    ]);
    return {
      session: toSession(session, true),
      operatorsWithUnfinishedProduction: run ? [run.startedByOperatorId] : [],
      offers,
      bars: assignments.map((assignment) => toBar(assignment.cuttingBar)),
      activeRun: run ? toTabletRun(run) : null,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async updateMachineSessionTeam(auth: OperatorAuthContext, sessionId: string, input: unknown) {
    const parsed = updateMachineSessionTeamSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Vérifiez la liste des assistants sélectionnés.",
        details: parsed.error.flatten(),
      });
    }

    const requestedHelperIds = parsed.data.helperOperatorIds;
    const addedIds: string[] = [];
    const removedIds: string[] = [];
    const updated = await this.prisma.$transaction(async (transaction) => {
      const membership = await transaction.machineSessionOperator.findFirst({
        where: {
          machineSessionId: sessionId,
          operatorId: auth.operator.id,
          active: true,
          role: "LEAD",
          machineSession: { status: "ACTIVE" },
        },
        include: { machineSession: { include: sessionInclude } },
      });
      if (!membership || membership.machineSession.leadOperatorId !== auth.operator.id) {
        throw new ForbiddenException({
          code: "MACHINE_SESSION_LEAD_REQUIRED",
          message: "Seul le responsable de la session peut modifier son équipe.",
        });
      }

      // Serialize team changes against bar launches for this machine session.
      const sessionLock = await transaction.machineSession.updateMany({
        where: { id: sessionId, status: "ACTIVE" },
        data: { status: "ACTIVE" },
      });
      if (sessionLock.count !== 1) {
        throw new ConflictException({
          code: "MACHINE_SESSION_ALREADY_ENDED",
          message: "Cette session machine est terminée.",
        });
      }

      const activeHelperIds = membership.machineSession.members
        .filter((member) => member.active && member.role === "HELPER")
        .map((member) => member.operatorId);
      const requestedIds = new Set(requestedHelperIds);
      const activeIds = new Set(activeHelperIds);
      addedIds.push(...requestedHelperIds.filter((id) => !activeIds.has(id)));
      removedIds.push(...activeHelperIds.filter((id) => !requestedIds.has(id)));

      if (requestedIds.has(auth.operator.id)) {
        throw new BadRequestException({
          code: "SESSION_LEAD_CANNOT_BE_ASSISTANT",
          message: "Le responsable de session ne peut pas être ajouté comme assistant.",
        });
      }

      if (removedIds.length) {
        const unfinishedRun = await transaction.productionRun.findFirst({
          where: {
            machineSessionId: sessionId,
            status: "RUNNING",
            startedByOperatorId: { in: removedIds },
          },
          select: { startedByOperatorId: true },
        });
        if (unfinishedRun) {
          throw new ConflictException({
            code: "OPERATOR_HAS_UNFINISHED_PRODUCTION",
            message:
              "Cet assistant a lancé une barre encore en cours. Terminez ou annulez cette fabrication avant de le retirer.",
          });
        }
        await transaction.machineSessionOperator.updateMany({
          where: {
            machineSessionId: sessionId,
            operatorId: { in: removedIds },
            role: "HELPER",
            active: true,
          },
          data: { active: false, leftAt: new Date() },
        });
      }

      if (addedIds.length) {
        const [operators, conflictingMembership] = await Promise.all([
          transaction.user.findMany({
            where: {
              id: { in: addedIds },
              role: "OPERATOR",
              isActive: true,
              tabletAccessEnabled: true,
            },
            select: operatorSelect,
          }),
          transaction.machineSessionOperator.findFirst({
            where: {
              operatorId: { in: addedIds },
              active: true,
              machineSession: { status: "ACTIVE" },
            },
            select: { operatorId: true },
          }),
        ]);
        if (operators.length !== addedIds.length) {
          throw new ConflictException({
            code: "OPERATOR_UNAVAILABLE",
            message: "Un assistant choisi est désactivé ou n’a plus accès à la tablette.",
          });
        }
        if (conflictingMembership) {
          throw new ConflictException({
            code: "OPERATOR_SESSION_CONFLICT",
            message: "Un assistant choisi participe déjà à une autre session machine.",
          });
        }

        const existingMemberships = await transaction.machineSessionOperator.findMany({
          where: { machineSessionId: sessionId, operatorId: { in: addedIds } },
          select: { id: true, operatorId: true, active: true },
        });
        const existingByOperatorId = new Map(
          existingMemberships.map((item) => [item.operatorId, item]),
        );
        for (const operatorId of addedIds) {
          const existing = existingByOperatorId.get(operatorId);
          if (existing) {
            await transaction.machineSessionOperator.update({
              where: { id: existing.id },
              data: { active: true, joinedAt: new Date(), leftAt: null },
            });
          } else {
            await transaction.machineSessionOperator.create({
              data: {
                machineSessionId: sessionId,
                operatorId,
                role: "HELPER",
              },
            });
          }
        }
      }

      if (addedIds.length || removedIds.length) {
        const event = await transaction.historyEvent.create({
          data: {
            eventType: "MACHINE_SESSION_TEAM_UPDATED",
            entityType: "MACHINE_SESSION",
            entityId: sessionId,
            actorUserId: auth.operator.id,
            actorRole: "OPERATOR",
            metadata: {
              machineId: membership.machineSession.machineId,
              addedUserIds: addedIds,
              removedUserIds: removedIds,
            },
          },
        });
        await deliverBusinessNotification(transaction, event, {
          machineId: membership.machineSession.machineId,
          targetUserIds: addedIds,
          href: "/production/tablet",
          skipRoleRecipients: true,
        });
      }

      return { machineId: membership.machineSession.machineId };
    });

    if (addedIds.length || removedIds.length) {
      this.realtime.publish({
        type: "machine-session.team-updated",
        entityType: "MACHINE_SESSION",
        entityId: sessionId,
        actorUserId: auth.operator.id,
      });
    }
    return {
      success: true as const,
      addedCount: addedIds.length,
      removedCount: removedIds.length,
      machineId: updated.machineId,
    };
  }

  async endMachineSession(auth: OperatorAuthContext, sessionId: string) {
    await this.prisma.$transaction(async (transaction) => {
      const membership = await transaction.machineSessionOperator.findFirst({
        where: {
          machineSessionId: sessionId,
          operatorId: auth.operator.id,
          active: true,
          machineSession: { status: "ACTIVE" },
        },
        include: { machineSession: true },
      });
      if (!membership)
        throw new NotFoundException({
          code: "MACHINE_SESSION_NOT_FOUND",
          message: "Session machine introuvable.",
        });
      if (membership.machineSession.leadOperatorId !== auth.operator.id) {
        throw new ForbiddenException({
          code: "MACHINE_SESSION_LEAD_REQUIRED",
          message: "Seul l’opérateur principal peut terminer cette session machine.",
        });
      }
      const running = await transaction.productionRun.findFirst({
        where: { machineSessionId: sessionId, status: "RUNNING" },
        select: { id: true },
      });
      if (running) {
        throw new ConflictException({
          code: "SESSION_HAS_RUNNING_PRODUCTION",
          message: "Impossible de terminer la session. Une fabrication est encore en cours.",
        });
      }
      const endedAt = new Date();
      const changed = await transaction.machineSession.updateMany({
        where: { id: sessionId, status: "ACTIVE" },
        data: { status: "ENDED", endedAt },
      });
      if (changed.count !== 1)
        throw new ConflictException({
          code: "MACHINE_SESSION_ALREADY_ENDED",
          message: "Cette session est déjà terminée.",
        });
      await transaction.machineSessionOperator.updateMany({
        where: { machineSessionId: sessionId, active: true },
        data: { active: false, leftAt: endedAt },
      });
      await transaction.historyEvent.create({
        data: {
          eventType: "MACHINE_SESSION_ENDED",
          entityType: "MACHINE_SESSION",
          entityId: sessionId,
          actorUserId: auth.operator.id,
          actorRole: "OPERATOR",
          metadata: {
            machineId: membership.machineSession.machineId,
            endedAt: endedAt.toISOString(),
          },
        },
      });
    });
    this.realtime.publish({
      type: "machine-session.ended",
      entityType: "MACHINE_SESSION",
      entityId: sessionId,
      actorUserId: auth.operator.id,
    });
    return { success: true as const };
  }

  async getAssignedBar(auth: OperatorAuthContext, barId: string) {
    const current = await this.getCurrentSession(auth);
    if (!current.session)
      throw new ConflictException({
        code: "ACTIVE_MACHINE_SESSION_REQUIRED",
        message: "Démarrez une session machine avant de consulter une barre.",
      });
    const bar = await this.prisma.cuttingBar.findFirst({
      where: {
        id: barId,
        status: "AFFECTEE",
        assignments: { some: { machineId: current.session.machineId, active: true } },
      },
      include: barInclude,
    });
    if (!bar)
      throw new NotFoundException({
        code: "ASSIGNED_BAR_NOT_FOUND",
        message: "Cette barre n’est pas dans la file de votre machine.",
      });
    return { bar: toBar(bar), session: current.session };
  }

  async startBar(auth: OperatorAuthContext, barId: string) {
    try {
      const runId = await this.prisma.$transaction(async (transaction) => {
        const membership = await transaction.machineSessionOperator.findFirst({
          where: {
            operatorId: auth.operator.id,
            active: true,
            machineSession: { status: "ACTIVE" },
          },
          include: { machineSession: { include: { machine: true } } },
        });
        if (!membership)
          throw new ConflictException({
            code: "ACTIVE_MACHINE_SESSION_REQUIRED",
            message: "Démarrez une session machine avant de lancer la fabrication.",
          });
        const { machineSession } = membership;
        const sessionLock = await transaction.machineSession.updateMany({
          where: { id: machineSession.id, status: "ACTIVE" },
          data: { status: "ACTIVE" },
        });
        if (sessionLock.count !== 1) {
          throw new ConflictException({
            code: "ACTIVE_MACHINE_SESSION_REQUIRED",
            message: "La session machine est terminée. Reconnectez-vous pour continuer.",
          });
        }
        if (machineSession.machine.status !== "ACTIVE") {
          throw new ConflictException({
            code: "MACHINE_UNAVAILABLE",
            message: "La machine n’est plus disponible.",
          });
        }
        const runningOnMachine = await transaction.productionRun.findFirst({
          where: { machineId: machineSession.machineId, status: "RUNNING" },
          select: { id: true, cuttingBar: { select: { reference: true } } },
        });
        if (runningOnMachine) {
          throw new ConflictException({
            code: "MACHINE_HAS_RUNNING_PRODUCTION",
            message: `La barre ${runningOnMachine.cuttingBar.reference} est encore en fabrication. Terminez-la avant d’en lancer une autre sur cette machine.`,
          });
        }
        const bar = await transaction.cuttingBar.findUnique({
          where: { id: barId },
          include: barInclude,
        });
        if (!bar || bar.status === "CANCELLED")
          throw new NotFoundException({ code: "BAR_NOT_FOUND", message: "Barre introuvable." });
        if (bar.status !== "AFFECTEE")
          throw new ConflictException({
            code: "BAR_NOT_READY",
            message: "Cette barre n’est pas en attente de fabrication.",
          });
        if (!bar.items.length)
          throw new ConflictException({
            code: "BAR_HAS_NO_PIECES",
            message: "Cette barre ne contient aucune pièce active.",
          });
        if (
          !bar.assignments.some((assignment) => assignment.machineId === machineSession.machineId)
        ) {
          throw new ConflictException({
            code: "BAR_ASSIGNED_TO_ANOTHER_MACHINE",
            message: "Cette barre n’est pas affectée à votre machine.",
          });
        }
        if (!["READY", "IN_PRODUCTION"].includes(bar.offer.status)) {
          throw new ConflictException({
            code: "OFFER_NOT_READY_FOR_PRODUCTION",
            message: "L’offre n’est pas prête pour la production.",
          });
        }
        if (
          bar.items.some(
            (item) =>
              item.pieceUnit.status !== "ASSIGNED" ||
              item.pieceUnit.productionStatus !== "AFFECTEE",
          )
        ) {
          throw new ConflictException({
            code: "BAR_PIECES_NOT_READY",
            message: "Toutes les pièces de cette barre doivent être affectées et prêtes.",
          });
        }
        const unitIds = bar.items.map((item) => item.pieceUnitId);
        const assignment = bar.assignments.find(
          (item) => item.machineId === machineSession.machineId,
        );
        if (!assignment)
          throw new ConflictException({
            code: "BAR_ASSIGNMENT_NOT_FOUND",
            message: "L’affectation machine de cette barre est introuvable.",
          });
        const unitAssignments = await transaction.assignment.count({
          where: {
            pieceUnitId: { in: unitIds },
            machineId: machineSession.machineId,
            active: true,
            barAssignmentId: assignment.id,
          },
        });
        if (unitAssignments !== unitIds.length)
          throw new ConflictException({
            code: "BAR_ASSIGNMENT_INCOMPLETE",
            message: "Les affectations des pièces de cette barre ne sont plus cohérentes.",
          });

        const barLock = await transaction.cuttingBar.updateMany({
          where: { id: bar.id, status: "AFFECTEE" },
          data: { status: "LANCEE" },
        });
        if (barLock.count !== 1)
          throw new ConflictException({
            code: "BAR_ALREADY_STARTED",
            message: "Cette barre vient d’être lancée par une autre session.",
          });
        const startedAt = new Date();
        const unitsChanged = await transaction.pieceUnit.updateMany({
          where: { id: { in: unitIds }, status: "ASSIGNED", productionStatus: "AFFECTEE" },
          data: {
            status: "IN_PROGRESS",
            productionStatus: "LANCEE",
            currentProductionOperatorId: auth.operator.id,
            startedAt,
            version: { increment: 1 },
          },
        });
        if (unitsChanged.count !== unitIds.length)
          throw new ConflictException({
            code: "BAR_PIECES_CONCURRENT_UPDATE",
            message: "Une pièce de cette barre a changé d’état. Actualisez la file.",
          });
        const run = await transaction.productionRun.create({
          data: {
            cuttingBarId: bar.id,
            machineId: machineSession.machineId,
            machineSessionId: machineSession.id,
            startedByOperatorId: auth.operator.id,
            startedAt,
          },
        });
        const pieceIds = [...new Set(bar.items.map((item) => item.pieceUnit.pieceId))];
        await transaction.piece.updateMany({
          where: { id: { in: pieceIds }, status: { in: ["PLANNED", "ASSIGNED"] } },
          data: { status: "IN_PROGRESS", version: { increment: 1 } },
        });
        if (bar.offer.status === "READY") {
          const offerChanged = await transaction.offer.updateMany({
            where: { id: bar.offerId, status: "READY" },
            data: { status: "IN_PRODUCTION", version: { increment: 1 } },
          });
          if (offerChanged.count === 1) {
            await transaction.historyEvent.create({
              data: {
                eventType: "OFFER_PRODUCTION_STARTED",
                entityType: "OFFER",
                entityId: bar.offerId,
                actorUserId: auth.operator.id,
                actorRole: "OPERATOR",
                metadata: { barId: bar.id, productionRunId: run.id },
              },
            });
          }
        }
        const startEvents = await transaction.historyEvent.createManyAndReturn({
          data: [
            {
              eventType: "BAR_PRODUCTION_STARTED",
              entityType: "CUTTING_BAR",
              entityId: bar.id,
              actorUserId: auth.operator.id,
              actorRole: "OPERATOR",
              metadata: {
                offerId: bar.offerId,
                machineId: machineSession.machineId,
                machineSessionId: machineSession.id,
                productionRunId: run.id,
                previousStatus: "AFFECTEE",
                newStatus: "LANCEE",
              },
            },
            {
              eventType: "PRODUCTION_STARTED",
              entityType: "PRODUCTION_RUN",
              entityId: run.id,
              actorUserId: auth.operator.id,
              actorRole: "OPERATOR",
              metadata: {
                offerId: bar.offerId,
                barId: bar.id,
                machineId: machineSession.machineId,
                machineSessionId: machineSession.id,
                pieceUnitIds: unitIds,
                previousStatus: "AFFECTEE",
                newStatus: "LANCEE",
              },
            },
            ...bar.items.map((item) => ({
              eventType: "PIECE_PRODUCTION_STARTED",
              entityType: "PIECE_UNIT",
              entityId: item.pieceUnitId,
              actorUserId: auth.operator.id,
              actorRole: "OPERATOR" as const,
              metadata: {
                offerId: bar.offerId,
                barId: bar.id,
                productionRunId: run.id,
                previousStatus: "AFFECTEE",
                newStatus: "LANCEE",
              },
            })),
          ],
        });
        const barStartEvent = startEvents.find(
          (event) => event.eventType === "BAR_PRODUCTION_STARTED",
        );
        if (barStartEvent)
          await deliverBusinessNotification(transaction, barStartEvent, {
            offerId: bar.offerId,
            machineId: machineSession.machineId,
          });
        await transaction.user.update({
          where: { id: auth.operator.id },
          data: { lastLoginAt: startedAt },
        });
        return run.id;
      });
      this.realtime.publish({
        type: "production.started",
        entityType: "PRODUCTION_RUN",
        entityId: runId,
        actorUserId: auth.operator.id,
      });
      return this.getRun(auth, runId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          code: "PRODUCTION_ALREADY_RUNNING",
          message: "Une fabrication est déjà en cours sur cette barre ou cette machine.",
        });
      }
      throw error;
    }
  }

  async getRun(auth: OperatorAuthContext, runId: string) {
    const run = await this.prisma.productionRun.findUnique({
      where: { id: runId },
      include: runInclude,
    });
    if (!run)
      throw new NotFoundException({
        code: "PRODUCTION_RUN_NOT_FOUND",
        message: "Fabrication introuvable.",
      });
    const membership = await this.prisma.machineSessionOperator.findFirst({
      where: { machineSessionId: run.machineSessionId, operatorId: auth.operator.id, active: true },
      select: { id: true },
    });
    if (!membership)
      throw new NotFoundException({
        code: "PRODUCTION_RUN_NOT_FOUND",
        message: "Fabrication introuvable.",
      });
    return { run: toTabletRun(run) };
  }

  async finishRun(auth: OperatorAuthContext, runId: string) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const run = await transaction.productionRun.findUnique({
        where: { id: runId },
        include: runInclude,
      });
      if (!run)
        throw new NotFoundException({
          code: "PRODUCTION_RUN_NOT_FOUND",
          message: "Fabrication introuvable.",
        });
      const membership = await transaction.machineSessionOperator.findFirst({
        where: {
          machineSessionId: run.machineSessionId,
          operatorId: auth.operator.id,
          active: true,
          machineSession: { status: "ACTIVE" },
        },
        select: { id: true },
      });
      if (!membership)
        throw new NotFoundException({
          code: "PRODUCTION_RUN_NOT_FOUND",
          message: "Fabrication introuvable.",
        });
      if (run.startedByOperatorId !== auth.operator.id) {
        throw new ForbiddenException({
          code: "PRODUCTION_RUN_STARTER_REQUIRED",
          message: "Seul l’opérateur qui a lancé cette fabrication peut la terminer.",
        });
      }
      if (run.status !== "RUNNING" || run.cuttingBar.status !== "LANCEE") {
        throw new ConflictException({
          code: "PRODUCTION_RUN_NOT_RUNNING",
          message: "Cette fabrication n’est plus en cours.",
        });
      }
      const unitIds = run.cuttingBar.items.map((item) => item.pieceUnitId);
      if (
        unitIds.length === 0 ||
        run.cuttingBar.items.some(
          (item) =>
            item.pieceUnit.status !== "IN_PROGRESS" || item.pieceUnit.productionStatus !== "LANCEE",
        )
      ) {
        throw new ConflictException({
          code: "BAR_PIECES_NOT_IN_PROGRESS",
          message: "Les pièces de cette barre ne sont pas toutes en fabrication.",
        });
      }
      const finishedAt = new Date();
      const changedRun = await transaction.productionRun.updateMany({
        where: { id: run.id, status: "RUNNING" },
        data: { status: "COMPLETED", finishedAt },
      });
      if (changedRun.count !== 1)
        throw new ConflictException({
          code: "PRODUCTION_RUN_CONCURRENT_UPDATE",
          message: "Cette fabrication vient d’être terminée.",
        });
      const changedUnits = await transaction.pieceUnit.updateMany({
        where: { id: { in: unitIds }, status: "IN_PROGRESS", productionStatus: "LANCEE" },
        data: {
          status: "QUALITY_PENDING",
          productionStatus: "FABRIQUEE",
          currentProductionOperatorId: null,
          manufacturedAt: finishedAt,
          version: { increment: 1 },
        },
      });
      if (changedUnits.count !== unitIds.length)
        throw new ConflictException({
          code: "BAR_PIECES_CONCURRENT_UPDATE",
          message: "Une pièce de cette barre a changé d’état.",
        });
      const changedBar = await transaction.cuttingBar.updateMany({
        where: { id: run.cuttingBarId, status: "LANCEE" },
        data: { status: "FABRIQUEE", fabricatedAt: finishedAt },
      });
      if (changedBar.count !== 1)
        throw new ConflictException({
          code: "BAR_CONCURRENT_UPDATE",
          message: "L’état de la barre a changé.",
        });
      const pieceIds = [...new Set(run.cuttingBar.items.map((item) => item.pieceUnit.pieceId))];
      for (const pieceId of pieceIds) {
        const pending = await transaction.pieceUnit.count({
          where: {
            pieceId,
            status: { notIn: ["QUALITY_PENDING", "ACCEPTED", "REJECTED", "SCRAPPED"] },
          },
        });
        if (pending === 0) {
          await transaction.piece.updateMany({
            where: { id: pieceId, status: { not: "COMPLETED" } },
            data: { status: "COMPLETED", version: { increment: 1 } },
          });
        }
      }
      const completionEvents = await transaction.historyEvent.createManyAndReturn({
        data: [
          {
            eventType: "BAR_PRODUCTION_COMPLETED",
            entityType: "CUTTING_BAR",
            entityId: run.cuttingBarId,
            actorUserId: auth.operator.id,
            actorRole: "OPERATOR",
            metadata: {
              offerId: run.cuttingBar.offerId,
              productionRunId: run.id,
              machineId: run.machineId,
              previousStatus: "LANCEE",
              newStatus: "FABRIQUEE",
              finishedAt: finishedAt.toISOString(),
            },
          },
          {
            eventType: "PRODUCTION_COMPLETED",
            entityType: "PRODUCTION_RUN",
            entityId: run.id,
            actorUserId: auth.operator.id,
            actorRole: "OPERATOR",
            metadata: {
              offerId: run.cuttingBar.offerId,
              barId: run.cuttingBarId,
              machineId: run.machineId,
              machineSessionId: run.machineSessionId,
              pieceUnitIds: unitIds,
              finishedAt: finishedAt.toISOString(),
              openNonConformityCount: run.nonConformities.length,
            },
          },
          ...run.cuttingBar.items.map((item) => ({
            eventType: "PIECE_PRODUCTION_COMPLETED",
            entityType: "PIECE_UNIT",
            entityId: item.pieceUnitId,
            actorUserId: auth.operator.id,
            actorRole: "OPERATOR" as const,
            metadata: {
              offerId: run.cuttingBar.offerId,
              barId: run.cuttingBarId,
              productionRunId: run.id,
              previousStatus: "LANCEE",
              newStatus: "FABRIQUEE",
            },
          })),
        ],
      });
      const barCompletedEvent = completionEvents.find(
        (event) => event.eventType === "BAR_PRODUCTION_COMPLETED",
      );
      if (barCompletedEvent)
        await deliverBusinessNotification(transaction, barCompletedEvent, {
          offerId: run.cuttingBar.offerId,
          machineId: run.machineId,
        });
      await transaction.user.update({
        where: { id: auth.operator.id },
        data: { lastLoginAt: finishedAt },
      });
      return { offerId: run.cuttingBar.offerId, barId: run.cuttingBarId, finishedAt };
    });
    this.realtime.publish({
      type: "production.completed",
      entityType: "PRODUCTION_RUN",
      entityId: runId,
      actorUserId: auth.operator.id,
    });
    this.realtime.publish({
      type: "bar.production.finished",
      entityType: "CUTTING_BAR",
      entityId: result.barId,
      actorUserId: auth.operator.id,
    });
    return this.getRun(auth, runId);
  }

  async cancelRun(auth: OperatorAuthContext, runId: string) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const run = await transaction.productionRun.findUnique({
        where: { id: runId },
        include: runInclude,
      });
      if (!run)
        throw new NotFoundException({
          code: "PRODUCTION_RUN_NOT_FOUND",
          message: "Fabrication introuvable.",
        });
      const membership = await transaction.machineSessionOperator.findFirst({
        where: {
          machineSessionId: run.machineSessionId,
          operatorId: auth.operator.id,
          active: true,
          machineSession: { status: "ACTIVE" },
        },
        select: { id: true },
      });
      if (!membership)
        throw new NotFoundException({
          code: "PRODUCTION_RUN_NOT_FOUND",
          message: "Fabrication introuvable.",
        });
      if (run.startedByOperatorId !== auth.operator.id) {
        throw new ForbiddenException({
          code: "PRODUCTION_RUN_STARTER_REQUIRED",
          message: "Seul l’opérateur qui a lancé cette fabrication peut l’annuler.",
        });
      }
      if (run.status !== "RUNNING" || run.cuttingBar.status !== "LANCEE") {
        throw new ConflictException({
          code: "PRODUCTION_RUN_NOT_RUNNING",
          message: "Seule une fabrication en cours peut être annulée.",
        });
      }
      if (
        run.nonConformities.length > 0 ||
        run.cuttingBar.items.some((item) => item.pieceUnit.qualityStatus === "NON_CONFORME")
      ) {
        throw new ConflictException({
          code: "PRODUCTION_RUN_HAS_QUALITY_ISSUES",
          message: "Traitez d’abord les non-conformités ouvertes avant d’annuler le lancement.",
        });
      }
      const unitIds = run.cuttingBar.items.map((item) => item.pieceUnitId);
      if (
        !unitIds.length ||
        run.cuttingBar.items.some(
          (item) =>
            item.pieceUnit.status !== "IN_PROGRESS" || item.pieceUnit.productionStatus !== "LANCEE",
        )
      ) {
        throw new ConflictException({
          code: "BAR_PIECES_NOT_IN_PROGRESS",
          message: "Les pièces de cette barre ne sont plus toutes en fabrication.",
        });
      }
      const cancelledAt = new Date();
      const changedRun = await transaction.productionRun.updateMany({
        where: { id: run.id, status: "RUNNING" },
        data: { status: "CANCELLED", cancelledAt },
      });
      if (changedRun.count !== 1)
        throw new ConflictException({
          code: "PRODUCTION_RUN_CONCURRENT_UPDATE",
          message: "Cette fabrication vient de changer d’état.",
        });
      const changedUnits = await transaction.pieceUnit.updateMany({
        where: { id: { in: unitIds }, status: "IN_PROGRESS", productionStatus: "LANCEE" },
        data: {
          status: "ASSIGNED",
          productionStatus: "AFFECTEE",
          currentProductionOperatorId: null,
          startedAt: null,
          version: { increment: 1 },
        },
      });
      if (changedUnits.count !== unitIds.length)
        throw new ConflictException({
          code: "BAR_PIECES_CONCURRENT_UPDATE",
          message: "Une pièce de cette barre vient de changer d’état.",
        });
      const changedBar = await transaction.cuttingBar.updateMany({
        where: { id: run.cuttingBarId, status: "LANCEE" },
        data: { status: "AFFECTEE" },
      });
      if (changedBar.count !== 1)
        throw new ConflictException({
          code: "BAR_CONCURRENT_UPDATE",
          message: "La barre vient de changer d’état.",
        });
      const pieceIds = [...new Set(run.cuttingBar.items.map((item) => item.pieceUnit.pieceId))];
      for (const pieceId of pieceIds) {
        const otherInProgress = await transaction.pieceUnit.count({
          where: { pieceId, id: { notIn: unitIds }, status: "IN_PROGRESS" },
        });
        if (otherInProgress === 0)
          await transaction.piece.updateMany({
            where: { id: pieceId, status: "IN_PROGRESS" },
            data: { status: "ASSIGNED", version: { increment: 1 } },
          });
      }
      const runCancelledEvent = await transaction.historyEvent.create({
        data: {
          eventType: "PRODUCTION_RUN_CANCELLED",
          entityType: "PRODUCTION_RUN",
          entityId: run.id,
          actorUserId: auth.operator.id,
          actorRole: "OPERATOR",
          metadata: {
            offerId: run.cuttingBar.offerId,
            barId: run.cuttingBarId,
            machineId: run.machineId,
            pieceUnitIds: unitIds,
            previousStatus: "RUNNING",
            newStatus: "CANCELLED",
            cancelledAt: cancelledAt.toISOString(),
          },
        },
      });
      await deliverBusinessNotification(transaction, runCancelledEvent, {
        offerId: run.cuttingBar.offerId,
        machineId: run.machineId,
      });
      await transaction.historyEvent.createMany({
        data: [
          {
            eventType: "BAR_PRODUCTION_LAUNCH_CANCELLED",
            entityType: "CUTTING_BAR",
            entityId: run.cuttingBarId,
            actorUserId: auth.operator.id,
            actorRole: "OPERATOR",
            metadata: {
              offerId: run.cuttingBar.offerId,
              productionRunId: run.id,
              machineId: run.machineId,
              previousStatus: "LANCEE",
              newStatus: "AFFECTEE",
              cancelledAt: cancelledAt.toISOString(),
            },
          },
          ...run.cuttingBar.items.map((item) => ({
            eventType: "PIECE_PRODUCTION_LAUNCH_CANCELLED",
            entityType: "PIECE_UNIT",
            entityId: item.pieceUnitId,
            actorUserId: auth.operator.id,
            actorRole: "OPERATOR" as const,
            metadata: {
              offerId: run.cuttingBar.offerId,
              barId: run.cuttingBarId,
              productionRunId: run.id,
              previousStatus: "LANCEE",
              newStatus: "AFFECTEE",
            },
          })),
        ],
      });
      await transaction.user.update({
        where: { id: auth.operator.id },
        data: { lastLoginAt: cancelledAt },
      });
      return { barId: run.cuttingBarId };
    });
    this.realtime.publish({
      type: "production.cancelled",
      entityType: "PRODUCTION_RUN",
      entityId: runId,
      actorUserId: auth.operator.id,
    });
    this.realtime.publish({
      type: "bar.production.launchCancelled",
      entityType: "CUTTING_BAR",
      entityId: result.barId,
      actorUserId: auth.operator.id,
    });
    return this.getRun(auth, runId);
  }

  async reportNonConformity(auth: OperatorAuthContext, runId: string, input: unknown) {
    const parsed = reportProductionNonConformitySchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Choisissez la pièce et le motif de non-conformité.",
        details: parsed.error.flatten(),
      });
    }
    let nonConformityId: string;
    try {
      nonConformityId = await this.prisma.$transaction(async (transaction) => {
        const run = await transaction.productionRun.findUnique({
          where: { id: runId },
          include: runInclude,
        });
        if (!run)
          throw new NotFoundException({
            code: "PRODUCTION_RUN_NOT_FOUND",
            message: "Fabrication introuvable.",
          });
        const membership = await transaction.machineSessionOperator.findFirst({
          where: {
            machineSessionId: run.machineSessionId,
            operatorId: auth.operator.id,
            active: true,
            machineSession: { status: "ACTIVE" },
          },
          select: { id: true },
        });
        if (!membership)
          throw new NotFoundException({
            code: "PRODUCTION_RUN_NOT_FOUND",
            message: "Fabrication introuvable.",
          });
        if (run.status !== "RUNNING" || run.cuttingBar.status !== "LANCEE") {
          throw new ConflictException({
            code: "PRODUCTION_RUN_NOT_RUNNING",
            message:
              "Une non-conformité ne peut être déclarée que pendant une fabrication en cours.",
          });
        }
        const item = run.cuttingBar.items.find(
          (candidate) => candidate.pieceUnitId === parsed.data.pieceUnitId,
        );
        if (!item || item.pieceUnit.piece.offerId !== run.cuttingBar.offerId) {
          throw new NotFoundException({
            code: "PIECE_NOT_IN_PRODUCTION_BAR",
            message: "Cette pièce ne fait pas partie de la barre en cours.",
          });
        }
        if (
          item.pieceUnit.productionStatus !== "LANCEE" ||
          item.pieceUnit.status !== "IN_PROGRESS"
        ) {
          throw new ConflictException({
            code: "PIECE_NOT_IN_PRODUCTION",
            message: "Cette pièce n’est pas en cours de fabrication.",
          });
        }
        if (run.nonConformities.some((issue) => issue.pieceUnitId === item.pieceUnitId)) {
          throw new ConflictException({
            code: "OPEN_NON_CONFORMITY_EXISTS",
            message: "Une non-conformité ouverte existe déjà pour cette pièce.",
          });
        }
        const existingOpenIssue = await transaction.nonConformity.findFirst({
          where: { pieceUnitId: item.pieceUnitId, status: "OPEN" },
          select: { id: true },
        });
        if (existingOpenIssue) {
          throw new ConflictException({
            code: "OPEN_NON_CONFORMITY_EXISTS",
            message: "Une non-conformité ouverte existe déjà pour cette pièce.",
          });
        }
        const row = await transaction.nonConformity.create({
          data: {
            offerId: run.cuttingBar.offerId,
            pieceId: item.pieceUnit.pieceId,
            pieceUnitId: item.pieceUnitId,
            cuttingBarId: run.cuttingBarId,
            machineId: run.machineId,
            productionRunId: run.id,
            reportedByOperatorId: auth.operator.id,
            reason: parsed.data.reason,
            comment: parsed.data.comment || null,
          },
        });
        const unitChanged = await transaction.pieceUnit.updateMany({
          where: { id: item.pieceUnitId, productionStatus: "LANCEE", status: "IN_PROGRESS" },
          data: { qualityStatus: "NON_CONFORME", version: { increment: 1 } },
        });
        if (unitChanged.count !== 1)
          throw new ConflictException({
            code: "PIECE_PRODUCTION_CONCURRENT_UPDATE",
            message: "La pièce vient de changer d’état.",
          });
        await transaction.cuttingBar.updateMany({
          where: { id: run.cuttingBarId, status: "LANCEE" },
          data: { qualityStatus: "NON_CONFORME" },
        });
        const event = await transaction.historyEvent.create({
          data: {
            eventType: "NON_CONFORMITY_REPORTED",
            entityType: "NON_CONFORMITY",
            entityId: row.id,
            actorUserId: auth.operator.id,
            actorRole: "OPERATOR",
            metadata: {
              offerId: run.cuttingBar.offerId,
              pieceId: item.pieceUnit.pieceId,
              pieceUnitId: item.pieceUnitId,
              barId: run.cuttingBarId,
              machineId: run.machineId,
              machineSessionId: run.machineSessionId,
              productionRunId: run.id,
              reason: row.reason,
              previousQualityStatus: item.pieceUnit.qualityStatus,
              newQualityStatus: "NON_CONFORME",
            },
          },
        });
        await deliverBusinessNotification(transaction, event, {
          offerId: run.cuttingBar.offerId,
          machineId: run.machineId,
        });
        await transaction.user.update({
          where: { id: auth.operator.id },
          data: { lastLoginAt: new Date() },
        });
        return row.id;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          code: "OPEN_NON_CONFORMITY_EXISTS",
          message: "Une non-conformité ouverte existe déjà pour cette pièce.",
        });
      }
      throw error;
    }
    this.realtime.publish({
      type: "quality.nonConformityReported",
      entityType: "NON_CONFORMITY",
      entityId: nonConformityId,
      actorUserId: auth.operator.id,
    });
    const row = await this.prisma.nonConformity.findUnique({
      where: { id: nonConformityId },
      include: nonConformityInclude,
    });
    if (!row)
      throw new NotFoundException({
        code: "NON_CONFORMITY_NOT_FOUND",
        message: "La non-conformité créée est introuvable.",
      });
    return { nonConformity: toNonConformity(row) };
  }

  async getProductionMonitor(input: unknown, actorRole?: "ADMIN" | "PRODUCTION_MANAGER") {
    const parsed = productionMonitorQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Les filtres de production sont invalides.",
        details: parsed.error.flatten(),
      });
    }
    if (parsed.data.offerId) {
      const offer = await this.prisma.offer.findUnique({
        where: { id: parsed.data.offerId },
        select: { id: true, status: true },
      });
      if (!offer)
        throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Offre introuvable." });
      if (actorRole === "PRODUCTION_MANAGER" && offer.status !== "IN_PRODUCTION") {
        throw new ForbiddenException({
          code: "OFFER_NOT_IN_PRODUCTION",
          message: "Le suivi manager est disponible uniquement pour les Affaires en production.",
        });
      }
    }
    const search = parsed.data.search?.trim();
    const where: Prisma.CuttingBarWhereInput = {
      status: { not: "CANCELLED" },
      ...(parsed.data.offerId ? { offerId: parsed.data.offerId } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.machineId
        ? { assignments: { some: { machineId: parsed.data.machineId, active: true } } }
        : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: "insensitive" } },
              { profile: { contains: search, mode: "insensitive" } },
              { offer: { reference: { contains: search, mode: "insensitive" } } },
              {
                assignments: {
                  some: {
                    active: true,
                    machine: { name: { contains: search, mode: "insensitive" } },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const summaryWhere: Prisma.CuttingBarWhereInput = {
      status: { not: "CANCELLED" },
      ...(parsed.data.offerId ? { offerId: parsed.data.offerId } : {}),
      ...(parsed.data.machineId
        ? { assignments: { some: { machineId: parsed.data.machineId, active: true } } }
        : {}),
    };
    const sortBy = parsed.data.sortBy ?? "status";
    const sortDirection = parsed.data.sortDirection ?? "asc";
    const orderBy: Prisma.CuttingBarOrderByWithRelationInput[] =
      sortBy === "offer"
        ? [{ offer: { reference: sortDirection } }, { id: "asc" }]
        : [{ [sortBy]: sortDirection }, { id: "asc" }];
    const [bars, total, statusGroups, nonConformityCount] = await Promise.all([
      this.prisma.cuttingBar.findMany({
        where,
        include: {
          ...barInclude,
          productionRuns: {
            orderBy: { startedAt: "desc" },
            take: 1,
            include: {
              machine: { select: machineSelect },
              machineSession: { include: sessionInclude },
              startedByOperator: { select: operatorSelect },
              nonConformities: {
                where: { status: "OPEN" },
                include: nonConformityInclude,
                orderBy: { reportedAt: "desc" },
              },
              cuttingBar: { include: barInclude },
            },
          },
        },
        orderBy,
        skip: (parsed.data.page - 1) * parsed.data.pageSize,
        take: parsed.data.pageSize,
      }),
      this.prisma.cuttingBar.count({ where }),
      this.prisma.cuttingBar.groupBy({
        by: ["status"],
        where: summaryWhere,
        _count: { _all: true },
      }),
      this.prisma.nonConformity.count({
        where: {
          status: "OPEN",
          ...(parsed.data.offerId ? { offerId: parsed.data.offerId } : {}),
          ...(parsed.data.machineId ? { machineId: parsed.data.machineId } : {}),
        },
      }),
    ]);
    const machineIds = [
      ...new Set(bars.flatMap((bar) => bar.assignments.map((assignment) => assignment.machineId))),
    ];
    const activeSessions = machineIds.length
      ? await this.prisma.machineSession.findMany({
          where: { machineId: { in: machineIds }, status: "ACTIVE" },
          include: sessionInclude,
        })
      : [];
    const sessionsByMachine = new Map(
      activeSessions.map((session) => [session.machineId, session]),
    );
    const monitorBars: ProductionMonitorBar[] = bars.map((bar) => {
      const lastRun = bar.productionRuns[0];
      const activeAssignment = bar.assignments[0];
      const session =
        lastRun?.machineSession ??
        (activeAssignment ? sessionsByMachine.get(activeAssignment.machineId) : undefined);
      return {
        bar: toBar(bar),
        machineSession: session ? toSession(session, session.status === "ACTIVE") : null,
        run: lastRun ? toRunSummary(lastRun) : null,
        openNonConformities: bar.nonConformities.map(toNonConformity),
      };
    });
    return {
      bars: monitorBars,
      pagination: {
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / parsed.data.pageSize)),
      },
      counts: {
        shaped: statusGroups.find(({ status }) => status === "FACONNEE")?._count._all ?? 0,
        assigned: statusGroups.find(({ status }) => status === "AFFECTEE")?._count._all ?? 0,
        inProgress: statusGroups.find(({ status }) => status === "LANCEE")?._count._all ?? 0,
        fabricated: statusGroups.find(({ status }) => status === "FABRIQUEE")?._count._all ?? 0,
        openNonConformities: nonConformityCount,
      },
    };
  }

  async listOpenNonConformities(input: unknown) {
    const parsed = productionNonConformityQuerySchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Les filtres sont invalides.",
        details: parsed.error.flatten(),
      });
    if (
      parsed.data.offerId &&
      !(await this.prisma.offer.findUnique({
        where: { id: parsed.data.offerId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Offre introuvable." });
    }
    const search = parsed.data.search?.trim();
    const sortBy = parsed.data.sortBy ?? "reportedAt";
    const sortDirection = parsed.data.sortDirection ?? "desc";
    const where: Prisma.NonConformityWhereInput = {
      status: "OPEN",
      ...(parsed.data.offerId ? { offerId: parsed.data.offerId } : {}),
      ...(parsed.data.machineId ? { machineId: parsed.data.machineId } : {}),
      ...(search
        ? {
            OR: [
              { piece: { reference: { contains: search, mode: "insensitive" } } },
              { cuttingBar: { reference: { contains: search, mode: "insensitive" } } },
              { machine: { name: { contains: search, mode: "insensitive" } } },
              { offer: { reference: { contains: search, mode: "insensitive" } } },
              { reportedByOperator: { displayName: { contains: search, mode: "insensitive" } } },
              { comment: { contains: search, mode: "insensitive" } },
              {
                reason: {
                  equals: search.toUpperCase() as Prisma.EnumNonConformityReasonFilter["equals"],
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.nonConformity.findMany({
        where,
        include: nonConformityInclude,
        orderBy:
          sortBy === "reference"
            ? [{ piece: { reference: sortDirection } }, { id: "asc" }]
            : sortBy === "reason"
              ? [{ reason: sortDirection }, { id: "asc" }]
              : sortBy === "machine"
                ? [{ machine: { name: sortDirection } }, { id: "asc" }]
                : sortBy === "reportedBy"
                  ? [{ reportedByOperator: { displayName: sortDirection } }, { id: "asc" }]
                  : [{ reportedAt: sortDirection }, { id: "asc" }],
        skip: (parsed.data.page - 1) * parsed.data.pageSize,
        take: parsed.data.pageSize,
      }),
      this.prisma.nonConformity.count({ where }),
    ]);
    return {
      nonConformities: rows.map(toNonConformity),
      pagination: {
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / parsed.data.pageSize)),
      },
    };
  }
}
