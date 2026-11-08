import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ManagedBarAssignment, ManagedCuttingBar, PieceUnitStatus } from "@nim/types";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { parseListSort } from "../list-sorting";
import { deliverBusinessNotification } from "../notifications/notification-delivery";
import { RealtimeService } from "../realtime/realtime.service";

const assignBarsSchema = z
  .object({
    machineId: z.string().trim().min(1).max(128),
    barIds: z.array(z.string().trim().min(1).max(128)).min(1).max(500),
  })
  .superRefine(({ barIds }, context) => {
    if (new Set(barIds).size !== barIds.length) {
      context.addIssue({
        code: "custom",
        path: ["barIds"],
        message: "Une barre ne peut être sélectionnée qu’une seule fois.",
      });
    }
  });

const barInclude = {
  offer: { select: { id: true, reference: true, revision: true } },
  items: {
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
    include: { machine: { select: { id: true, name: true, internalNumber: true } } },
    take: 1,
  },
} satisfies Prisma.CuttingBarInclude;

const barDetailInclude = {
  ...barInclude,
  assignments: {
    include: { machine: { select: { id: true, name: true, internalNumber: true } } },
    orderBy: { assignedAt: "asc" },
  },
} satisfies Prisma.CuttingBarInclude;

type BarRecord = Prisma.CuttingBarGetPayload<{ include: typeof barInclude }>;
type PlanTransaction = Prisma.TransactionClient;
type CuttingPlanProposalInput = {
  id: string;
  reference: string;
  profile: string;
  rawLengthMm: number;
  usedLengthMm: number;
  wasteMm: number;
  cuts: Prisma.JsonValue;
  items: Array<{ pieceUnitId: string }>;
};

function toManagedBar(bar: BarRecord): ManagedCuttingBar {
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
    machine: bar.assignments[0]?.machine ?? null,
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
      status: item.pieceUnit.status as PieceUnitStatus,
      active: item.active,
    })),
    createdAt: bar.createdAt.toISOString(),
  };
}

function toManagedBarAssignment(
  assignment: Prisma.MachineBarAssignmentGetPayload<{
    include: {
      machine: { select: { id: true; name: true } };
      cuttingBar: { include: typeof barInclude };
    };
  }>,
): ManagedBarAssignment {
  return {
    id: assignment.id,
    cuttingBarId: assignment.cuttingBarId,
    machineId: assignment.machineId,
    machineName: assignment.machine.name,
    assignedById: assignment.assignedById,
    assignedAt: assignment.assignedAt.toISOString(),
    unassignedAt: assignment.unassignedAt?.toISOString() ?? null,
    active: assignment.active,
    bar: toManagedBar(assignment.cuttingBar),
  };
}

@Injectable()
export class CuttingBarsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(RealtimeService) private readonly realtime?: RealtimeService,
  ) {}

  /** Emit only after the caller's selected-proposal validation transaction commits. */
  publishGeneratedBars(actor: AuthContext, planId: string): void {
    this.realtime?.publish({
      type: "cutting-bars.generated",
      entityType: "CUTTING_PLAN",
      entityId: planId,
      actorUserId: actor.user.id,
    });
  }

  private async assertOffer(offerId: string, writable = false) {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer)
      throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Offre introuvable." });
    if (writable && offer.status === "ARCHIVED") {
      throw new ConflictException({
        code: "OFFER_ARCHIVED",
        message: "Cette offre est archivée et ne peut plus être modifiée.",
      });
    }
    return offer;
  }

  async listBars(offerId: string, options: { page?: number; pageSize?: number; search?: string; status?: string; profile?: string; sortBy?: string; sortDirection?: string } = {}) {
    await this.assertOffer(offerId);
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || ![10, 20, 50].includes(pageSize)) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "La pagination des barres est invalide." });
    }
    const term = options.search?.trim();
    const where: Prisma.CuttingBarWhereInput = {
      offerId,
      status: options.status ? options.status as Prisma.EnumCuttingBarStatusFilter["equals"] : { not: "CANCELLED" },
      ...(options.profile ? { profile: options.profile } : {}),
      ...(term
        ? {
            OR: [
              { reference: { contains: term, mode: "insensitive" } },
              { profile: { contains: term, mode: "insensitive" } },
              {
                assignments: {
                  some: { machine: { name: { contains: term, mode: "insensitive" } } },
                },
              },
              {
                items: {
                  some: {
                    pieceUnit: { piece: { reference: { contains: term, mode: "insensitive" } } },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const baseWhere = { offerId, status: { not: "CANCELLED" as const } };
    const sort = parseListSort(options.sortBy, options.sortDirection, ["reference", "profile", "rawLengthMm", "wasteMm", "status", "pieces", "createdAt"] as const, { sortBy: "createdAt", sortDirection: "asc" });
    const orderBy: Prisma.CuttingBarOrderByWithRelationInput[] = sort.sortBy === "pieces"
      ? [{ items: { _count: sort.sortDirection } }, { id: "asc" }]
      : [{ [sort.sortBy]: sort.sortDirection }, { id: "asc" }];
    const [bars, total, groupedStatuses, profileGroups] = await Promise.all([
      this.prisma.cuttingBar.findMany({
      where,
      include: barInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      }),
      this.prisma.cuttingBar.count({ where }),
      this.prisma.cuttingBar.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
      this.prisma.cuttingBar.groupBy({ by: ["profile"], where: baseWhere }),
    ]);
    const statusCounts = Object.fromEntries(groupedStatuses.map((group) => [group.status, group._count._all]));
    return {
      bars: bars.map(toManagedBar),
      statusCounts,
      profiles: profileGroups.map((group) => group.profile).sort((a, b) => a.localeCompare(b, "fr", { numeric: true })),
      total,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async getBarSummary(offerId: string) {
    await this.assertOffer(offerId);
    const groups = await this.prisma.cuttingBar.groupBy({
      by: ["status"],
      where: { offerId, status: { not: "CANCELLED" } },
      _count: { _all: true },
    });
    const statusCounts = Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
    return {
      statusCounts,
      total: groups.reduce((sum, group) => sum + group._count._all, 0),
    };
  }

  async getMaterialReport(offerId: string) {
    const offer = await this.assertOffer(offerId);
    const bars = await this.prisma.cuttingBar.findMany({
      where: { offerId, status: { not: "CANCELLED" } },
      select: {
        reference: true,
        profile: true,
        rawLengthMm: true,
        usedLengthMm: true,
        wasteMm: true,
        status: true,
        cuttingPlan: { select: { reference: true } },
        assignments: {
          where: { active: true },
          select: { machine: { select: { id: true, name: true } } },
          take: 1,
        },
        items: {
          where: { active: true },
          select: {
            pieceUnit: {
              select: {
                sequenceNumber: true,
                piece: { select: { reference: true, lengthMm: true, unitWeightKg: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ profile: "asc" }, { rawLengthMm: "asc" }],
    });
    const profileKeys = [...new Set(bars.map((bar) => bar.profile.trim().replace(/\s+/g, "").toLocaleUpperCase()))];
    const catalogueProfiles = profileKeys.length
      ? await this.prisma.materialProfile.findMany({
          where: { profileKey: { in: profileKeys } },
          select: { profileKey: true, kgPerMeter: true },
        })
      : [];
    const kgPerMeterByProfile = new Map(
      catalogueProfiles.map((profile) => [profile.profileKey, Number(profile.kgPerMeter)]),
    );
    const getBarNetWeight = (bar: (typeof bars)[number]): number | null => {
      const profileKey = bar.profile.trim().replace(/\s+/g, "").toLocaleUpperCase();
      const kgPerMeter = kgPerMeterByProfile.get(profileKey);
      let total = 0;
      for (const item of bar.items) {
        const savedUnitWeight = item.pieceUnit.piece.unitWeightKg;
        if (savedUnitWeight != null) total += Number(savedUnitWeight);
        else if (kgPerMeter !== undefined) total += (item.pieceUnit.piece.lengthMm * kgPerMeter) / 1000;
        else return null;
      }
      return total;
    };
    const groups = new Map<string, {
      profile: string;
      rawLengthMm: number;
      quantity: number;
      totalWasteMm: number;
      netWeightKg: number;
      netWeightComplete: boolean;
    }>();
    for (const bar of bars) {
      const key = `${bar.profile}|${bar.rawLengthMm}`;
      const group = groups.get(key) ?? {
        profile: bar.profile,
        rawLengthMm: bar.rawLengthMm,
        quantity: 0,
        totalWasteMm: 0,
        netWeightKg: 0,
        netWeightComplete: true,
      };
      group.quantity += 1;
      group.totalWasteMm += bar.wasteMm;
      const barNetWeightKg = getBarNetWeight(bar);
      if (barNetWeightKg === null) group.netWeightComplete = false;
      else group.netWeightKg += barNetWeightKg;
      groups.set(key, group);
    }
    const materials = [...groups.values()].sort((a, b) =>
      a.profile.localeCompare(b.profile, "fr", { numeric: true }) || a.rawLengthMm - b.rawLengthMm,
    ).map((material) => {
      const profileKey = material.profile.trim().replace(/\s+/g, "").toLocaleUpperCase();
      const kgPerMeter = kgPerMeterByProfile.get(profileKey) ?? null;
      return {
        profile: material.profile,
        rawLengthMm: material.rawLengthMm,
        quantity: material.quantity,
        totalWasteMm: material.totalWasteMm,
        netWeightKg: material.netWeightComplete ? material.netWeightKg : null,
        kgPerMeter,
        grossWeightKg: kgPerMeter === null ? null : (material.rawLengthMm * material.quantity * kgPerMeter) / 1000,
        wasteRate: material.rawLengthMm * material.quantity === 0
          ? 0
          : (material.totalWasteMm / (material.rawLengthMm * material.quantity)) * 100,
      };
    });
    const profilesWithoutWeight = [...new Set(materials.filter((item) => item.kgPerMeter === null).map((item) => item.profile))];
    const profilesWithoutNetWeight = [...new Set(materials.filter((item) => item.netWeightKg === null).map((item) => item.profile))];
    const totalRawLengthMm = bars.reduce((sum, bar) => sum + bar.rawLengthMm, 0);
    const totalWasteMm = bars.reduce((sum, bar) => sum + bar.wasteMm, 0);
    return {
      offer: {
        id: offer.id,
        reference: offer.reference,
        revision: offer.revision,
        name: offer.name,
        clientName: offer.clientName,
        site: offer.site,
      },
      generatedAt: new Date().toISOString(),
      materials,
      bars: bars.map((bar) => ({
        reference: bar.reference,
        profile: bar.profile,
        rawLengthMm: bar.rawLengthMm,
        usedLengthMm: bar.usedLengthMm,
        wasteMm: bar.wasteMm,
        status: bar.status,
        cuttingPlanReference: bar.cuttingPlan.reference,
        machine: bar.assignments?.[0]?.machine ?? null,
        netWeightKg: getBarNetWeight(bar),
        grossWeightKg: (() => {
          const profileKey = bar.profile.trim().replace(/\s+/g, "").toLocaleUpperCase();
          const kgPerMeter = kgPerMeterByProfile.get(profileKey);
          return kgPerMeter === undefined ? null : (bar.rawLengthMm * kgPerMeter) / 1000;
        })(),
        items: bar.items.map((item) => ({
          reference: item.pieceUnit.piece.reference,
          sequenceNumber: item.pieceUnit.sequenceNumber,
          lengthMm: item.pieceUnit.piece.lengthMm,
        })),
      })),
      totals: {
        barCount: bars.length,
        totalRawLengthMm,
        totalWasteMm,
        profileCount: new Set(bars.map((bar) => bar.profile)).size,
        netWeightKg: materials.reduce((sum, material) => sum + (material.netWeightKg ?? 0), 0),
        grossWeightKg: materials.reduce((sum, material) => sum + (material.grossWeightKg ?? 0), 0),
        profilesWithoutWeight,
        profilesWithoutNetWeight,
        wasteRate: totalRawLengthMm === 0 ? 0 : (totalWasteMm / totalRawLengthMm) * 100,
      },
    };
  }

  async getBar(offerId: string, barId: string) {
    await this.assertOffer(offerId);
    const bar = await this.prisma.cuttingBar.findFirst({
      where: { id: barId, offerId },
      include: barDetailInclude,
    });
    if (!bar || bar.status === "CANCELLED")
      throw new NotFoundException({
        code: "CUTTING_BAR_NOT_FOUND",
        message: "Barre introuvable dans cette offre.",
      });
    return {
      ...toManagedBar({
        ...bar,
        assignments: bar.assignments.filter((assignment) => assignment.active),
      }),
      assignmentHistory: bar.assignments.map((assignment) => ({
        id: assignment.id,
        machineId: assignment.machine.id,
        machineName: assignment.machine.name,
        assignedAt: assignment.assignedAt.toISOString(),
        unassignedAt: assignment.unassignedAt?.toISOString() ?? null,
        active: assignment.active,
      })),
    };
  }

  async listAssignments(offerId: string, options: { availablePage?: number; assignmentPage?: number; pageSize?: number; search?: string; machineId?: string } = {}) {
    await this.assertOffer(offerId);
    const pageSize = options.pageSize ?? 20;
    const availablePage = options.availablePage ?? 1;
    const assignmentPage = options.assignmentPage ?? 1;
    const search = options.search?.trim();
    if (![availablePage, assignmentPage].every((page) => Number.isInteger(page) && page >= 1 && page <= 1_000_000) || ![10, 20, 50].includes(pageSize)) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "La pagination des affectations de barres est invalide." });
    }
    if (search && search.length > 80) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "La recherche est trop longue." });
    const availableWhere: Prisma.CuttingBarWhereInput = {
      offerId, status: "FACONNEE",
      ...(search ? { OR: [
        { reference: { contains: search, mode: "insensitive" } },
        { profile: { contains: search, mode: "insensitive" } },
      ] } : {}),
    };
    const assignmentWhere: Prisma.MachineBarAssignmentWhereInput = {
      active: true,
      cuttingBar: { offerId, ...(search ? { OR: [
        { reference: { contains: search, mode: "insensitive" } },
        { profile: { contains: search, mode: "insensitive" } },
      ] } : {}) },
      ...(options.machineId ? { machineId: options.machineId } : {}),
    };
    const [availableBars, assignments, availableTotal, assignmentTotal, machineGroups] = await Promise.all([
      this.prisma.cuttingBar.findMany({
        where: availableWhere,
        include: barInclude,
        orderBy: [{ profile: "asc" }, { reference: "asc" }],
        skip: (availablePage - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.machineBarAssignment.findMany({
        where: assignmentWhere,
        include: {
          machine: { select: { id: true, name: true } },
          cuttingBar: { include: barInclude },
        },
        orderBy: [{ machine: { name: "asc" } }, { assignedAt: "asc" }],
        skip: (assignmentPage - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.cuttingBar.count({ where: availableWhere }),
      this.prisma.machineBarAssignment.count({ where: assignmentWhere }),
      this.prisma.machineBarAssignment.groupBy({ by: ["machineId"], where: { active: true, cuttingBar: { offerId } }, _count: { _all: true } }),
    ]);
    return {
      availableBars: availableBars.map(toManagedBar),
      assignments: assignments.map(toManagedBarAssignment),
      availableCount: availableTotal,
      assignmentCount: assignmentTotal,
      machines: machineGroups.map((group) => ({ machineId: group.machineId, assignmentCount: group._count._all })),
      pagination: {
        available: { page: availablePage, pageSize, total: availableTotal, totalPages: Math.max(1, Math.ceil(availableTotal / pageSize)) },
        assignments: { page: assignmentPage, pageSize, total: assignmentTotal, totalPages: Math.max(1, Math.ceil(assignmentTotal / pageSize)) },
      },
    };
  }

  /** Called inside the selected-proposal validation transaction. */
  async createFromPlanProposals(
    transaction: PlanTransaction,
    actor: AuthContext,
    offer: { id: string; reference: string; revision: string },
    plan: { id: string; reference: string },
    proposals: CuttingPlanProposalInput[],
  ): Promise<number> {
    if (proposals.length === 0) {
      throw new ConflictException({
        code: "CUTTING_PLAN_SELECTION_REQUIRED",
        message: "Sélectionnez au moins une barre proposée à valider.",
      });
    }
    const unitIds = proposals.flatMap((proposal) => proposal.items.map((item) => item.pieceUnitId));
    if (unitIds.length === 0 || new Set(unitIds).size !== unitIds.length) {
      throw new ConflictException({
        code: "CUTTING_PLAN_PROPOSAL_INVALID",
        message: "Les barres proposées contiennent des unités manquantes ou dupliquées.",
      });
    }
    const unitUpdate = await transaction.pieceUnit.updateMany({
      where: {
        id: { in: unitIds },
        status: "PENDING",
        assignments: { none: { active: true } },
        barMemberships: { none: { active: true } },
        piece: { offerId: offer.id, status: { not: "ARCHIVED" } },
      },
      data: { status: "FACONNEE", productionStatus: "FACONNEE", version: { increment: 1 } },
    });
    if (unitUpdate.count !== unitIds.length) {
      throw new ConflictException({
        code: "CUTTING_PLAN_DEMAND_CHANGED",
        message: "Des unités ont été modifiées pendant la validation. Actualisez puis réessayez.",
      });
    }

    const existingBars = await transaction.cuttingBar.count({ where: { offerId: offer.id } });
    const barIds: string[] = [];
    for (const [index, proposal] of proposals.entries()) {
      const bar = await transaction.cuttingBar.create({
        data: {
          offerId: offer.id,
          cuttingPlanId: plan.id,
          proposalId: proposal.id,
          reference: `${offer.revision}-${offer.reference}-B${String(existingBars + index + 1).padStart(3, "0")}`,
          profile: proposal.profile,
          rawLengthMm: proposal.rawLengthMm,
          usedLengthMm: proposal.usedLengthMm,
          wasteMm: proposal.wasteMm,
        },
      });
      barIds.push(bar.id);
      await transaction.cuttingBarItem.createMany({
        data: proposal.items.map((item) => ({
          id: randomUUID(),
          cuttingBarId: bar.id,
          pieceUnitId: item.pieceUnitId,
        })),
      });
      await transaction.historyEvent.create({
        data: {
          eventType: "CUTTING_BAR_CREATED",
          entityType: "CUTTING_BAR",
          entityId: bar.id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: {
            offerId: offer.id,
            cuttingPlanId: plan.id,
            cuttingPlanReference: plan.reference,
            reference: bar.reference,
            profile: bar.profile,
            rawLengthMm: bar.rawLengthMm,
            usedLengthMm: bar.usedLengthMm,
            wasteMm: bar.wasteMm,
            pieceUnitCount: proposal.items.length,
            proposalId: proposal.id,
            proposalReference: proposal.reference,
            cuts: proposal.cuts,
          },
        },
      });
    }
    const generatedEvent = await transaction.historyEvent.create({
      data: {
        eventType: "CUTTING_BARS_GENERATED",
        entityType: "CUTTING_PLAN",
        entityId: plan.id,
        actorUserId: actor.user.id,
        actorRole: actor.user.role,
        metadata: {
          offerId: offer.id,
          barIds,
          barCount: barIds.length,
          pieceUnitCount: unitIds.length,
          proposalIds: proposals.map((proposal) => proposal.id),
        },
      },
    });
    await deliverBusinessNotification(transaction, generatedEvent, { offerId: offer.id });
    return barIds.length;
  }

  async assignBars(actor: AuthContext, offerId: string, input: unknown) {
    const parsed = assignBarsSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        code: "BAR_ASSIGNMENT_INVALID",
        message: "Sélectionnez des barres et une machine valides.",
        details: parsed.error.flatten(),
      });

    try {
      const result = await this.prisma.$transaction(
        async (transaction) => {
          const [offer, machine, bars] = await Promise.all([
            transaction.offer.findUnique({ where: { id: offerId } }),
            transaction.machine.findUnique({ where: { id: parsed.data.machineId } }),
            transaction.cuttingBar.findMany({
              where: { id: { in: parsed.data.barIds }, offerId },
              include: barInclude,
            }),
          ]);
          if (!offer)
            throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Offre introuvable." });
          if (offer.status !== "READY" && offer.status !== "IN_PRODUCTION")
            throw new ConflictException({
              code: "OFFER_NOT_READY_FOR_ASSIGNMENT",
              message: "Validez le plan de façonnage avant d’affecter les barres.",
            });
          if (!machine)
            throw new NotFoundException({
              code: "MACHINE_NOT_FOUND",
              message: "Machine introuvable.",
            });
          if (machine.status !== "ACTIVE")
            throw new ConflictException({
              code: "MACHINE_UNAVAILABLE",
              message:
                "Une machine inactive ou en maintenance ne peut pas recevoir de nouvelles barres.",
            });
          if (bars.length !== parsed.data.barIds.length)
            throw new NotFoundException({
              code: "BAR_NOT_IN_OFFER",
              message: "Une ou plusieurs barres n’appartiennent pas à cette offre.",
            });
          for (const bar of bars) {
            if (bar.status !== "FACONNEE" || bar.assignments.length > 0)
              throw new ConflictException({
                code: "BAR_NOT_ASSIGNABLE",
                message: `La barre ${bar.reference} n’est plus disponible pour affectation.`,
              });
            if (
              !bar.items.length ||
              bar.items.some(
                (item) =>
                  !item.active ||
                  item.pieceUnit.status !== "FACONNEE" ||
                  item.pieceUnit.piece.offerId !== offerId ||
                  item.pieceUnit.piece.profile.trim().toUpperCase() !==
                    bar.profile.trim().toUpperCase() ||
                  item.pieceUnit.piece.lengthMm > bar.rawLengthMm,
              )
            ) {
              throw new ConflictException({
                code: "BAR_PIECES_NOT_ASSIGNABLE",
                message: `Les pièces contenues dans ${bar.reference} ne sont plus affectables.`,
              });
            }
          }

          const assignmentRecords: Array<{ id: string; cuttingBarId: string; unitIds: string[] }> =
            [];
          for (const bar of bars) {
            const barAssignmentId = randomUUID();
            const changed = await transaction.cuttingBar.updateMany({
              where: { id: bar.id, offerId, status: "FACONNEE" },
              data: { status: "AFFECTEE" },
            });
            if (changed.count !== 1)
              throw new ConflictException({
                code: "BAR_ASSIGNMENT_CONFLICT",
                message: `La barre ${bar.reference} vient d’être affectée par un autre utilisateur.`,
              });
            await transaction.machineBarAssignment.create({
              data: {
                id: barAssignmentId,
                cuttingBarId: bar.id,
                machineId: machine.id,
                assignedById: actor.user.id,
              },
            });
            const unitIds = bar.items.map((item) => item.pieceUnitId);
            const unitUpdate = await transaction.pieceUnit.updateMany({
              where: { id: { in: unitIds }, status: "FACONNEE" },
              data: {
                status: "ASSIGNED",
                productionStatus: "AFFECTEE",
                currentMachineId: machine.id,
                version: { increment: 1 },
              },
            });
            if (unitUpdate.count !== unitIds.length)
              throw new ConflictException({
                code: "BAR_ASSIGNMENT_CONFLICT",
                message: `Les pièces de ${bar.reference} ont changé. Actualisez puis réessayez.`,
              });
            await transaction.assignment.createMany({
              data: unitIds.map((pieceUnitId) => ({
                pieceUnitId,
                machineId: machine.id,
                assignedById: actor.user.id,
                barAssignmentId,
              })),
            });
            const pieceIds = [...new Set(bar.items.map((item) => item.pieceUnit.pieceId))];
            await transaction.piece.updateMany({
              where: { id: { in: pieceIds }, status: "PLANNED" },
              data: { status: "ASSIGNED", version: { increment: 1 } },
            });
            await transaction.historyEvent.create({
              data: {
                eventType: "BAR_ASSIGNED_TO_MACHINE",
                entityType: "CUTTING_BAR",
                entityId: bar.id,
                actorUserId: actor.user.id,
                actorRole: actor.user.role,
                metadata: {
                  offerId,
                  machineId: machine.id,
                  machineName: machine.name,
                  previousStatus: "FACONNEE",
                  newStatus: "AFFECTEE",
                  unitIds,
                  reference: bar.reference,
                },
              },
            });
            assignmentRecords.push({ id: barAssignmentId, cuttingBarId: bar.id, unitIds });
          }
          const assignedEvent = await transaction.historyEvent.create({
            data: {
              eventType: "MACHINE_BARS_ASSIGNED",
              entityType: "MACHINE",
              entityId: machine.id,
              actorUserId: actor.user.id,
              actorRole: actor.user.role,
              metadata: {
                offerId,
                machineId: machine.id,
                machineName: machine.name,
                barIds: bars.map((bar) => bar.id),
                barReferences: bars.map((bar) => bar.reference),
              },
            },
          });
          await deliverBusinessNotification(transaction, assignedEvent, { offerId, machineId: machine.id });
          return { offerId, machineId: machine.id, assignmentRecords };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      for (const assignment of result.assignmentRecords)
        this.realtime?.publish({
          type: "bar.assigned",
          entityType: "CUTTING_BAR",
          entityId: assignment.cuttingBarId,
          actorUserId: actor.user.id,
        });
      this.realtime?.publish({
        type: "machine.bars-assigned",
        entityType: "MACHINE",
        entityId: result.machineId,
        actorUserId: actor.user.id,
      });
      return { assignedCount: result.assignmentRecords.length };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2034"].includes(error.code)
      ) {
        throw new ConflictException({
          code: "BAR_ASSIGNMENT_CONFLICT",
          message: "Une barre a été affectée simultanément. Actualisez la liste puis réessayez.",
        });
      }
      throw error;
    }
  }

  async unassignBar(actor: AuthContext, offerId: string, barId: string) {
    const result = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "CuttingBar" WHERE "id" = ${barId} FOR UPDATE`);
        const bar = await transaction.cuttingBar.findFirst({
          where: { id: barId, offerId },
          include: barInclude,
        });
        if (!bar || bar.status === "CANCELLED")
          throw new NotFoundException({
            code: "CUTTING_BAR_NOT_FOUND",
            message: "Barre introuvable dans cette offre.",
          });
        const activeAssignment = await transaction.machineBarAssignment.findFirst({
          where: { cuttingBarId: bar.id, active: true },
        });
        if (!activeAssignment)
          throw new ConflictException({
            code: "BAR_NOT_ASSIGNED",
            message: "Cette barre n’a pas d’affectation active.",
          });
        if (bar.status !== "AFFECTEE")
          throw new ConflictException({
            code: "PRODUCTION_ALREADY_STARTED",
            message: "Impossible de retirer cette barre : la fabrication a déjà été lancée.",
          });
        const activeSchedule = await transaction.scheduleEvent.findFirst({
          where: { cuttingBarId: bar.id, type: "PRODUCTION", status: "PLANNED" },
          select: { id: true },
        });
        if (activeSchedule)
          throw new ConflictException({
            code: "BAR_HAS_ACTIVE_SCHEDULE",
            message: "Annulez d’abord le créneau de production dans Planning avant de retirer cette barre de la machine.",
          });
        const unitIds = bar.items.filter((item) => item.active).map((item) => item.pieceUnitId);
        if (bar.items.some((item) => item.active && item.pieceUnit.status !== "ASSIGNED"))
          throw new ConflictException({
            code: "PRODUCTION_ALREADY_STARTED",
            message:
              "Impossible de retirer cette barre : une pièce n’est plus en attente de production.",
          });
        const closeBarAssignment = await transaction.machineBarAssignment.updateMany({
          where: { id: activeAssignment.id, active: true },
          data: { active: false, unassignedAt: new Date(), unassignedById: actor.user.id },
        });
        if (closeBarAssignment.count !== 1)
          throw new ConflictException({
            code: "BAR_ASSIGNMENT_CONFLICT",
            message: "L’affectation de cette barre vient d’être modifiée.",
          });
        await transaction.assignment.updateMany({
          where: { barAssignmentId: activeAssignment.id, active: true },
          data: { active: false, unassignedAt: new Date(), reason: "Désaffectation de la barre" },
        });
        const unitUpdate = await transaction.pieceUnit.updateMany({
          where: {
            id: { in: unitIds },
            status: "ASSIGNED",
            currentMachineId: activeAssignment.machineId,
          },
          data: {
            status: "FACONNEE",
            productionStatus: "FACONNEE",
            currentMachineId: null,
            version: { increment: 1 },
          },
        });
        if (unitUpdate.count !== unitIds.length)
          throw new ConflictException({
            code: "BAR_ASSIGNMENT_CONFLICT",
            message: "Les pièces de cette barre ont changé. Actualisez puis réessayez.",
          });
        await transaction.cuttingBar.update({
          where: { id: bar.id },
          data: { status: "FACONNEE" },
        });
        const pieceIds = [...new Set(bar.items.map((item) => item.pieceUnit.pieceId))];
        for (const pieceId of pieceIds) {
          const remaining = await transaction.assignment.count({
            where: { active: true, pieceUnit: { pieceId } },
          });
          if (remaining === 0)
            await transaction.piece.updateMany({
              where: { id: pieceId, status: "ASSIGNED" },
              data: { status: "PLANNED", version: { increment: 1 } },
            });
        }
        const event = await transaction.historyEvent.create({
          data: {
            eventType: "BAR_UNASSIGNED_FROM_MACHINE",
            entityType: "CUTTING_BAR",
            entityId: bar.id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: {
              offerId,
              machineId: activeAssignment.machineId,
              previousStatus: "AFFECTEE",
              newStatus: "FACONNEE",
              unitIds,
              reference: bar.reference,
            },
          },
        });
        await deliverBusinessNotification(transaction, event, { offerId, machineId: activeAssignment.machineId });
        return { barId: bar.id, machineId: activeAssignment.machineId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    this.realtime?.publish({
      type: "bar.unassigned",
      entityType: "CUTTING_BAR",
      entityId: result.barId,
      actorUserId: actor.user.id,
    });
    return { bar: await this.getBar(offerId, result.barId) };
  }

  async cancelBar(actor: AuthContext, offerId: string, barId: string) {
    await this.assertOffer(offerId, true);
    const bar = await this.prisma.$transaction(
      async (transaction) => {
        const target = await transaction.cuttingBar.findFirst({
          where: { id: barId, offerId },
          include: barInclude,
        });
        if (!target || target.status === "CANCELLED")
          throw new NotFoundException({
            code: "CUTTING_BAR_NOT_FOUND",
            message: "Barre introuvable dans cette offre.",
          });
        if (target.status !== "FACONNEE" || target.assignments.length > 0)
          throw new ConflictException({
            code:
              target.status === "LANCEE" || target.status === "FABRIQUEE"
                ? "PRODUCTION_ALREADY_STARTED"
                : "BAR_NOT_CANCELLABLE",
            message: "Seule une barre façonnée et non affectée peut être supprimée.",
          });
        const unitIds = target.items.filter((item) => item.active).map((item) => item.pieceUnitId);
        if (target.items.some((item) => item.active && item.pieceUnit.status !== "FACONNEE"))
          throw new ConflictException({
            code: "BAR_PIECES_NOT_CANCELLABLE",
            message: "Les pièces de cette barre ne sont plus disponibles.",
          });
        const units = await transaction.pieceUnit.updateMany({
          where: { id: { in: unitIds }, status: "FACONNEE" },
          data: { status: "PENDING", productionStatus: "PENDING", version: { increment: 1 } },
        });
        if (units.count !== unitIds.length)
          throw new ConflictException({
            code: "BAR_PIECES_NOT_CANCELLABLE",
            message: "Les pièces de cette barre ont changé.",
          });
        await transaction.cuttingBarItem.updateMany({
          where: { cuttingBarId: target.id, active: true },
          data: { active: false, releasedAt: new Date() },
        });
        const updated = await transaction.cuttingBar.update({
          where: { id: target.id },
          data: { status: "CANCELLED" },
          include: barInclude,
        });
        const cancelledEvent = await transaction.historyEvent.create({
          data: {
            eventType: "CUTTING_BAR_CANCELLED",
            entityType: "CUTTING_BAR",
            entityId: target.id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: {
              offerId,
              reference: target.reference,
              pieceUnitIds: unitIds,
              previousStatus: target.status,
              releasedUnitCount: unitIds.length,
            },
          },
        });
        await deliverBusinessNotification(transaction, cancelledEvent, { offerId });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    this.realtime?.publish({
      type: "bar.cancelled",
      entityType: "CUTTING_BAR",
      entityId: bar.id,
      actorUserId: actor.user.id,
    });
    return { bar: toManagedBar(bar) };
  }
}
