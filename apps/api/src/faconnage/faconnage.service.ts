import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CuttingPlanBarProposal, CuttingPlanStatus } from "@nim/types";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { deliverBusinessNotification } from "../notifications/notification-delivery";
import { CuttingOptimizer } from "./cutting-optimizer";
import { CuttingOptimizerExecution } from "./cutting-optimizer-execution";
import { RawStockLimitError, type FaconnageOptimizationBatchResult, type ProfileOptimizationInput } from "./faconnage.types";
import { CuttingBarsService } from "../cutting-bars/cutting-bars.service";

const requirementSchema = z.object({
  lengthMm: z.number().int().positive().max(1_000_000),
  quantity: z.number().int().positive().max(10_000),
});

const profileSchema = z.object({
  profile: z.string().trim().min(1).max(120),
  requirements: z.array(requirementSchema).min(1).max(64),
  rawLengths: z
    .array(z.object({
      lengthMm: z.number().int().positive().max(1_000_000),
      quantity: z.number().int().min(0).max(10_000).optional(),
    }))
    .min(1)
    .max(24),
});

const requestSchema = z.object({ profiles: z.array(profileSchema).min(1).max(30) });
const validateProposalsSchema = z
  .object({ proposalIds: z.array(z.string().trim().min(1).max(128)).min(1).max(500) })
  .superRefine(({ proposalIds }, context) => {
    if (new Set(proposalIds).size !== proposalIds.length) {
      context.addIssue({
        code: "custom",
        path: ["proposalIds"],
        message: "Une barre proposée ne peut être sélectionnée qu'une seule fois.",
      });
    }
  });

const proposalInclude = {
  items: { select: { pieceUnitId: true } },
  cuttingBar: { select: { id: true, reference: true } },
} satisfies Prisma.CuttingPlanProposalInclude;

type ProposalRecord = Prisma.CuttingPlanProposalGetPayload<{ include: typeof proposalInclude }>;

function toProposal(proposal: ProposalRecord): CuttingPlanBarProposal {
  return {
    id: proposal.id,
    reference: proposal.reference,
    ordinal: proposal.ordinal,
    profile: proposal.profile,
    rawLengthMm: proposal.rawLengthMm,
    usedLengthMm: proposal.usedLengthMm,
    wasteMm: proposal.wasteMm,
    cuts: proposal.cuts as unknown as CuttingPlanBarProposal["cuts"],
    status: proposal.status,
    pieceUnitCount: proposal.items.length,
    cuttingBarId: proposal.cuttingBar?.id ?? null,
    cuttingBarReference: proposal.cuttingBar?.reference ?? null,
  };
}

function normalizeProfile(profile: string): string {
  return profile.trim().replace(/\s+/g, " ").toUpperCase();
}

function profileKey(profile: string): string {
  return profile.trim().replace(/\s+/g, "").toUpperCase();
}

function roundRate(used: number, raw: number): number {
  if (raw <= 0) return 0;
  return Math.round((used / raw) * 10000) / 100;
}

@Injectable()
export class FaconnageService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CuttingOptimizer) private readonly optimizer: CuttingOptimizer,
    @Inject(CuttingBarsService) private readonly cuttingBars: CuttingBarsService,
    @Inject(CuttingOptimizerExecution) private readonly optimizerExecution?: CuttingOptimizerExecution,
  ) {}

  private async findOffer(offerId: string) {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) {
      throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Offre introuvable." });
    }
    return offer;
  }

  private async editableOffer(offerId: string) {
    const offer = await this.findOffer(offerId);
    if (offer.status !== "DRAFT" && offer.status !== "READY") {
      throw new BadRequestException({
        code: "OFFER_FACONNAGE_LOCKED",
        message:
          offer.status === "ARCHIVED"
            ? "Cette offre est archivée et ne peut plus être optimisée."
            : offer.status === "IN_PRODUCTION"
              ? "Le façonnage est verrouillé dès le démarrage de la production."
              : "Cette offre est terminée et ne peut plus recevoir de plan de façonnage.",
      });
    }
    return offer;
  }

  async getPlan(offerId: string, planId: string) {
    await this.findOffer(offerId);
    const plan = await this.prisma.cuttingPlan.findFirst({
      where: { id: planId, offerId },
      include: { proposals: { orderBy: { ordinal: "asc" }, include: proposalInclude } },
    });
    if (!plan) {
      throw new NotFoundException({
        code: "CUTTING_PLAN_NOT_FOUND",
        message: "Plan de coupe introuvable.",
      });
    }
    const stored = plan.result as unknown as Omit<FaconnageOptimizationBatchResult, "plan">;
    return {
      ...stored,
      plan: {
        id: plan.id,
        reference: plan.reference,
        status: plan.status,
        createdAt: plan.createdAt.toISOString(),
      },
      proposals: plan.proposals.map(toProposal),
    } satisfies FaconnageOptimizationBatchResult;
  }

  async listPlans(offerId: string, page = 1, pageSize = 10) {
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || ![10, 20, 50].includes(pageSize)) {
      throw new BadRequestException({
        code: "CUTTING_PLAN_PAGINATION_INVALID",
        message: "La page ou le nombre de plans par page est invalide.",
      });
    }
    await this.findOffer(offerId);
    const where: Prisma.CuttingPlanWhereInput = { offerId, status: { notIn: ["ARCHIVED", "CANCELLED"] } };
    const [plans, total] = await Promise.all([
      this.prisma.cuttingPlan.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { proposals: { select: { status: true } } },
      }),
      this.prisma.cuttingPlan.count({ where }),
    ]);
    return {
      plans: plans.map((plan) => ({
      id: plan.id,
      reference: plan.reference,
      status: plan.status,
      validatedBarCount: plan.proposals.filter((proposal) => proposal.status === "VALIDATED")
        .length,
      remainingBarCount: plan.proposals.filter((proposal) => proposal.status === "PROPOSED").length,
      profileCount: plan.profileCount,
      totalBars: plan.totalBars,
      totalRawLengthMm: plan.totalRawLengthMm,
      totalUsedLengthMm: plan.totalUsedLengthMm,
      totalWasteMm: plan.totalWasteMm,
      utilizationRate: Number(plan.utilizationRate),
      sourceRevision: plan.sourceRevision,
      approvedAt: plan.approvedAt?.toISOString() ?? null,
      createdAt: plan.createdAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async validatePlanBars(actor: AuthContext, offerId: string, planId: string, input: unknown) {
    const parsed = validateProposalsSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "CUTTING_PLAN_SELECTION_INVALID",
        message: "Sélectionnez une ou plusieurs barres proposées valides.",
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "Offer" WHERE "id" = ${offerId} FOR UPDATE`,
        );
        await transaction.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "CuttingPlan" WHERE "id" = ${planId} AND "offerId" = ${offerId} FOR UPDATE`,
        );

        const offer = await transaction.offer.findUnique({ where: { id: offerId } });
        const plan = await transaction.cuttingPlan.findFirst({ where: { id: planId, offerId } });
        if (!offer || !plan) {
          throw new NotFoundException({
            code: !offer ? "OFFER_NOT_FOUND" : "CUTTING_PLAN_NOT_FOUND",
            message: !offer ? "Offre introuvable." : "Plan de coupe introuvable.",
          });
        }
        if (offer.status !== "DRAFT" && offer.status !== "READY") {
          throw new ConflictException({
            code: "OFFER_FACONNAGE_LOCKED",
            message: "Les barres ne peuvent être validées qu'avant le démarrage de la production.",
          });
        }
        if (plan.sourceRevision !== offer.materialRevision) {
          throw new ConflictException({
            code: "CUTTING_PLAN_STALE",
            message:
              "Les pièces de l’offre ont changé. Recalculez le façonnage avant de valider ces barres.",
          });
        }
        if (plan.status !== "DRAFT" && plan.status !== "PARTIALLY_VALIDATED") {
          throw new ConflictException({
            code: "CUTTING_PLAN_NOT_VALIDATABLE",
            message:
              plan.status === "VALIDATED"
                ? "Toutes les barres proposées de ce plan sont déjà validées."
                : "Ce plan n’est plus disponible pour validation.",
          });
        }

        const selected = await transaction.cuttingPlanProposal.findMany({
          where: {
            id: { in: parsed.data.proposalIds },
            cuttingPlanId: planId,
            status: "PROPOSED",
          },
          include: {
            ...proposalInclude,
            items: {
              include: {
                pieceUnit: {
                  include: {
                    piece: {
                      select: { offerId: true, profile: true, lengthMm: true, status: true },
                    },
                    assignments: { where: { active: true }, select: { id: true } },
                    barMemberships: { where: { active: true }, select: { id: true } },
                    productionOperations: {
                      where: { status: "IN_PROGRESS" },
                      select: { id: true },
                    },
                  },
                },
              },
            },
          },
        });
        if (selected.length !== parsed.data.proposalIds.length) {
          throw new ConflictException({
            code: "CUTTING_PLAN_PROPOSAL_ALREADY_VALIDATED",
            message:
              "Au moins une barre a déjà été validée ou n’appartient pas à ce plan. Actualisez la page.",
          });
        }
        const materialProfiles = await transaction.materialProfile.findMany({
          select: { profile: true, aliases: true },
        });
        const catalogueProfileKeys = new Map<string, string>();
        for (const item of materialProfiles) {
          const canonicalKey = profileKey(item.profile);
          for (const name of [item.profile, ...item.aliases]) {
            catalogueProfileKeys.set(profileKey(name), canonicalKey);
          }
        }
        for (const proposal of selected) {
          this.assertProposalUnitsMatch(proposal, offerId, catalogueProfileKeys);
        }

        const claimed = await transaction.cuttingPlanProposal.updateMany({
          where: {
            id: { in: parsed.data.proposalIds },
            cuttingPlanId: planId,
            status: "PROPOSED",
          },
          data: { status: "VALIDATED", validatedAt: new Date() },
        });
        if (claimed.count !== parsed.data.proposalIds.length) {
          throw new ConflictException({
            code: "CUTTING_PLAN_PROPOSAL_ALREADY_VALIDATED",
            message:
              "Une autre personne vient de valider une de ces barres. Actualisez puis réessayez.",
          });
        }

        const barsCreated = await this.cuttingBars.createFromPlanProposals(
          transaction,
          actor,
          offer,
          plan,
          selected,
        );
        const [validatedBarCount, remainingBarCount] = await Promise.all([
          transaction.cuttingPlanProposal.count({
            where: { cuttingPlanId: planId, status: "VALIDATED" },
          }),
          transaction.cuttingPlanProposal.count({
            where: { cuttingPlanId: planId, status: "PROPOSED" },
          }),
        ]);
        const nextStatus: CuttingPlanStatus =
          remainingBarCount === 0 ? "VALIDATED" : "PARTIALLY_VALIDATED";
        const planUpdate = await transaction.cuttingPlan.updateMany({
          where: { id: planId, offerId, status: plan.status },
          data: {
            status: nextStatus,
            approvedById: plan.approvedById ?? actor.user.id,
            approvedAt: plan.approvedAt ?? new Date(),
          },
        });
        if (planUpdate.count !== 1) {
          throw new ConflictException({
            code: "CUTTING_PLAN_VALIDATION_CONFLICT",
            message: "Le plan a changé pendant la validation. Actualisez puis réessayez.",
          });
        }
        await transaction.offer.update({
          where: { id: offerId },
          data: { status: "READY", version: { increment: 1 } },
        });
        await transaction.historyEvent.create({
          data: {
            eventType:
              nextStatus === "VALIDATED"
                ? "CUTTING_PLAN_VALIDATED"
                : "CUTTING_PLAN_PARTIALLY_VALIDATED",
            entityType: "CUTTING_PLAN",
            entityId: planId,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: {
              offerId,
              reference: plan.reference,
              proposalIds: parsed.data.proposalIds,
              validatedBarCount,
              remainingBarCount,
              barsCreated,
            },
          },
        });
        return {
          id: plan.id,
          reference: plan.reference,
          status: nextStatus,
          validatedBarCount,
          remainingBarCount,
          barsCreated,
        };
      });
      this.cuttingBars.publishGeneratedBars(actor, planId);
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          code: "CUTTING_PLAN_VALIDATION_CONFLICT",
          message:
            "Une ou plusieurs unités viennent d’être engagées dans une autre barre. Actualisez le plan.",
        });
      }
      throw error;
    }
  }

  private assertProposalUnitsMatch(
    proposal: Prisma.CuttingPlanProposalGetPayload<{
      include: {
        items: {
          include: {
            pieceUnit: {
              include: {
                piece: { select: { offerId: true; profile: true; lengthMm: true; status: true } };
                assignments: { where: { active: true }; select: { id: true } };
                barMemberships: { where: { active: true }; select: { id: true } };
                productionOperations: { where: { status: "IN_PROGRESS" }; select: { id: true } };
              };
            };
          };
        };
      };
    }>,
    offerId: string,
    catalogueProfileKeys: ReadonlyMap<string, string> = new Map(),
  ): void {
    if (
      proposal.rawLengthMm !== proposal.usedLengthMm + proposal.wasteMm ||
      proposal.items.length === 0
    ) {
      throw new ConflictException({
        code: "CUTTING_PLAN_PROPOSAL_INVALID",
        message: "Le plan contient une barre proposée incohérente. Recalculez le façonnage.",
      });
    }
    const expected = new Map<number, number>();
    const cuts = proposal.cuts as unknown as Array<{ lengthMm: number; quantity: number }>;
    for (const cut of cuts) {
      if (
        !Number.isInteger(cut.lengthMm) ||
        cut.lengthMm <= 0 ||
        !Number.isInteger(cut.quantity) ||
        cut.quantity <= 0
      ) {
        throw new ConflictException({
          code: "CUTTING_PLAN_PROPOSAL_INVALID",
          message: "Le plan contient un motif de coupe invalide.",
        });
      }
      expected.set(cut.lengthMm, (expected.get(cut.lengthMm) ?? 0) + cut.quantity);
    }
    const actual = new Map<number, number>();
    for (const { pieceUnit } of proposal.items) {
      if (
        pieceUnit.status !== "PENDING" ||
        pieceUnit.piece.offerId !== offerId ||
        pieceUnit.piece.status === "ARCHIVED" ||
        (catalogueProfileKeys.get(profileKey(pieceUnit.piece.profile)) ?? profileKey(pieceUnit.piece.profile)) !==
          (catalogueProfileKeys.get(profileKey(proposal.profile)) ?? profileKey(proposal.profile)) ||
        pieceUnit.assignments.length > 0 ||
        pieceUnit.barMemberships.length > 0 ||
        pieceUnit.productionOperations.length > 0
      ) {
        throw new ConflictException({
          code: "CUTTING_PLAN_DEMAND_CHANGED",
          message:
            "Une unité de cette barre n’est plus disponible. Annulez le reliquat ou recalculez le façonnage.",
        });
      }
      actual.set(pieceUnit.piece.lengthMm, (actual.get(pieceUnit.piece.lengthMm) ?? 0) + 1);
    }
    if (
      expected.size !== actual.size ||
      [...expected].some(([length, quantity]) => actual.get(length) !== quantity)
    ) {
      throw new ConflictException({
        code: "CUTTING_PLAN_PROPOSAL_INVALID",
        message: "Les unités enregistrées ne correspondent pas au motif de coupe proposé.",
      });
    }
  }

  async cancelPlan(actor: AuthContext, offerId: string, planId: string) {
    const cancelledAt = new Date();
    const plan = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Offer" WHERE "id" = ${offerId} FOR UPDATE`,
      );
      await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "CuttingPlan" WHERE "id" = ${planId} AND "offerId" = ${offerId} FOR UPDATE`,
      );
      const target = await transaction.cuttingPlan.findFirst({ where: { id: planId, offerId } });
      if (!target) {
        throw new NotFoundException({
          code: "CUTTING_PLAN_NOT_FOUND",
          message: "Plan de coupe introuvable.",
        });
      }
      if (target.status !== "PARTIALLY_VALIDATED") {
        throw new ConflictException({
          code: "CUTTING_PLAN_CANNOT_BE_CANCELLED",
          message:
            target.status === "VALIDATED"
              ? "Toutes les barres de ce plan sont matérialisées. Leur historique est conservé."
              : target.status === "DRAFT"
                ? "Un plan brouillon doit être supprimé définitivement, pas annulé."
                : "Ce plan n’est plus en attente de validation.",
        });
      }
      const pending = await transaction.cuttingPlanProposal.findMany({
        where: { cuttingPlanId: planId, status: "PROPOSED" },
        select: { id: true },
      });
      const pendingIds = pending.map((proposal) => proposal.id);
      if (pendingIds.length > 0) {
        await transaction.cuttingPlanProposalItem.deleteMany({ where: { proposalId: { in: pendingIds } } });
        await transaction.cuttingPlanProposal.deleteMany({ where: { id: { in: pendingIds } } });
      }
      await transaction.cuttingPlan.update({
        where: { id: planId },
        data: { status: "CANCELLED" },
      });
      const event = await transaction.historyEvent.create({
        data: {
          eventType: "CUTTING_PLAN_CANCELLED",
          entityType: "CUTTING_PLAN",
          entityId: planId,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: {
            offerId,
            reference: target.reference,
            cancelledProposalCount: pending.length,
            validatedBarsPreserved: target.status === "PARTIALLY_VALIDATED",
          },
        },
      });
      await deliverBusinessNotification(transaction, event, { offerId });
      return {
        id: target.id,
        status: "CANCELLED" as const,
        cancelledAt: cancelledAt.toISOString(),
      };
    });
    return plan;
  }

  async reviseValidatedPlan(actor: AuthContext, offerId: string, planId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Offer" WHERE "id" = ${offerId} FOR UPDATE`);
      await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "CuttingPlan" WHERE "id" = ${planId} AND "offerId" = ${offerId} FOR UPDATE`);
      const offer = await transaction.offer.findUnique({ where: { id: offerId } });
      const plan = await transaction.cuttingPlan.findFirst({ where: { id: planId, offerId } });
      if (!offer || !plan) throw new NotFoundException({ code: !offer ? "OFFER_NOT_FOUND" : "CUTTING_PLAN_NOT_FOUND", message: !offer ? "Offre introuvable." : "Plan de coupe introuvable." });
      if (offer.status !== "DRAFT" && offer.status !== "READY") throw new ConflictException({ code: "OFFER_FACONNAGE_LOCKED", message: "Un plan ne peut être révisé qu’avant le démarrage de la production." });
      if (plan.status !== "VALIDATED" && plan.status !== "APPROVED") throw new ConflictException({ code: "CUTTING_PLAN_NOT_REVISABLE", message: "Seul un plan entièrement validé peut être révisé ici." });

      const bars = await transaction.cuttingBar.findMany({
        where: { cuttingPlanId: planId, offerId },
        include: {
          assignments: { where: { active: true }, select: { id: true } },
          items: { where: { active: true }, include: { pieceUnit: { select: { id: true, status: true } } } },
        },
      });
      for (const bar of bars) {
        if (bar.status !== "FACONNEE" || bar.assignments.length > 0) {
          throw new ConflictException({ code: "CUTTING_PLAN_BARS_IN_USE", message: `La barre ${bar.reference} est affectée ou a commencé. Retirez-la de la machine avant de réviser le plan.` });
        }
        if (bar.items.some((item) => item.pieceUnit.status !== "FACONNEE")) {
          throw new ConflictException({ code: "CUTTING_PLAN_UNITS_IN_USE", message: `Les pièces de ${bar.reference} ne peuvent plus être libérées en toute sécurité.` });
        }
      }
      const unitIds = bars.flatMap((bar) => bar.items.map((item) => item.pieceUnitId));
      const updatedUnits = unitIds.length ? await transaction.pieceUnit.updateMany({
        where: { id: { in: unitIds }, status: "FACONNEE", assignments: { none: { active: true } }, productionOperations: { none: { status: "IN_PROGRESS" } } },
        data: { status: "PENDING", productionStatus: "PENDING", version: { increment: 1 } },
      }) : { count: 0 };
      if (updatedUnits.count !== unitIds.length) throw new ConflictException({ code: "CUTTING_PLAN_UNITS_IN_USE", message: "Certaines pièces ont été affectées ailleurs. Actualisez puis réessayez." });
      const now = new Date();
      await transaction.cuttingBarItem.updateMany({ where: { cuttingBarId: { in: bars.map((bar) => bar.id) }, active: true }, data: { active: false, releasedAt: now } });
      const cancelledBars = bars.length ? await transaction.cuttingBar.updateMany({ where: { id: { in: bars.map((bar) => bar.id) }, status: "FACONNEE" }, data: { status: "CANCELLED" } }) : { count: 0 };
      if (cancelledBars.count !== bars.length) throw new ConflictException({ code: "CUTTING_PLAN_BARS_IN_USE", message: "Une barre vient d’être affectée. Actualisez puis réessayez." });
      await transaction.cuttingPlanProposal.updateMany({ where: { cuttingPlanId: planId, status: "VALIDATED" }, data: { status: "CANCELLED", cancelledAt: now } });
      await transaction.cuttingPlan.update({ where: { id: planId }, data: { status: "CANCELLED" } });
      await transaction.offer.update({ where: { id: offerId }, data: { ...(offer.status === "READY" ? { status: "DRAFT" } : {}), version: { increment: 1 } } });
      const event = await transaction.historyEvent.create({ data: {
        eventType: "CUTTING_PLAN_REVISED", entityType: "CUTTING_PLAN", entityId: planId,
        actorUserId: actor.user.id, actorRole: actor.user.role,
        metadata: { offerId, reference: plan.reference, cancelledBarCount: bars.length, releasedPieceUnitCount: unitIds.length, previousStatus: plan.status },
      } });
      await deliverBusinessNotification(transaction, event, { offerId });
      return { id: planId, status: "CANCELLED" as const, cancelledBarCount: bars.length, releasedPieceUnitCount: unitIds.length };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async deleteDraftPlan(actor: AuthContext, offerId: string, planId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Offer" WHERE "id" = ${offerId} FOR UPDATE`,
      );
      await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "CuttingPlan" WHERE "id" = ${planId} AND "offerId" = ${offerId} FOR UPDATE`,
      );
      const target = await transaction.cuttingPlan.findFirst({
        where: { id: planId, offerId },
        include: { _count: { select: { bars: true } }, proposals: { select: { id: true } } },
      });
      if (!target) {
        throw new NotFoundException({ code: "CUTTING_PLAN_NOT_FOUND", message: "Plan de coupe introuvable." });
      }
      if (target.status !== "DRAFT" || target._count.bars > 0) {
        throw new ConflictException({
          code: "CUTTING_PLAN_HAS_TRACEABLE_BARS",
          message: "Ce plan possède déjà des barres liées. Supprimez uniquement le reliquat; les données liées à la production sont conservées.",
        });
      }
      const proposalIds = target.proposals.map((proposal) => proposal.id);
      if (proposalIds.length > 0) {
        await transaction.cuttingPlanProposalItem.deleteMany({ where: { proposalId: { in: proposalIds } } });
        await transaction.cuttingPlanProposal.deleteMany({ where: { id: { in: proposalIds } } });
      }
      await transaction.cuttingPlan.delete({ where: { id: planId } });
      const event = await transaction.historyEvent.create({
        data: {
          eventType: "CUTTING_PLAN_DELETED",
          entityType: "CUTTING_PLAN",
          entityId: planId,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { offerId, reference: target.reference, deletedProposalCount: proposalIds.length },
        },
      });
      await deliverBusinessNotification(transaction, event, { offerId });
      return { id: planId, reference: target.reference, deletedAt: new Date().toISOString() };
    }, { maxWait: 10_000, timeout: 30_000 });
  }

  async optimize(
    actor: AuthContext,
    offerId: string,
    input: unknown,
  ): Promise<FaconnageOptimizationBatchResult> {
    const offer = await this.editableOffer(offerId);
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "FACONNAGE_OPTIMIZATION_INVALID",
        message: "Vérifiez les besoins et les longueurs de matière brute.",
        details: parsed.error.flatten(),
      });
    }

    const profiles = parsed.data.profiles.map((profile): ProfileOptimizationInput => {
      const grouped = new Map<number, number>();
      for (const requirement of profile.requirements) {
        grouped.set(
          requirement.lengthMm,
          (grouped.get(requirement.lengthMm) ?? 0) + requirement.quantity,
        );
      }
      const requirements = [...grouped.entries()]
        .map(([lengthMm, quantity]) => ({ lengthMm, quantity }))
        .sort((left, right) => right.lengthMm - left.lengthMm);
      const rawLengthOptions = new Map<number, number | undefined>();
      for (const option of profile.rawLengths) {
        const previous = rawLengthOptions.get(option.lengthMm);
        rawLengthOptions.set(
          option.lengthMm,
          rawLengthOptions.has(option.lengthMm) && previous === undefined
            ? undefined
            : option.quantity === undefined || previous === undefined
              ? option.quantity
              : previous + option.quantity,
        );
      }
      const rawLengths = [...rawLengthOptions.entries()]
        .sort(([left], [right]) => left - right)
        .map(([lengthMm, quantity]) => ({ lengthMm, ...(quantity === undefined ? {} : { quantity }) }));
      const longestPiece = Math.max(...requirements.map((item) => item.lengthMm));
      const longestRaw = Math.max(...rawLengths.map((item) => item.lengthMm));
      if (longestPiece > longestRaw) {
        throw new BadRequestException({
          code: "FACONNAGE_RAW_LENGTH_TOO_SHORT",
          message: `Le profil ${profile.profile} contient une pièce de ${longestPiece} mm, mais aucune longueur brute saisie ne peut la contenir.`,
        });
      }
      return { profile: normalizeProfile(profile.profile), requirements, rawLengths };
    });

    const materialProfiles = await this.prisma.materialProfile.findMany({
      where: { isActive: true },
      select: { profile: true, aliases: true },
    });
    const catalogueKeyByName = new Map<string, string>();
    for (const item of materialProfiles) {
      const canonicalKey = profileKey(item.profile);
      for (const name of [item.profile, ...item.aliases]) {
        catalogueKeyByName.set(profileKey(name), canonicalKey);
      }
    }
    const selectedProfileKeys = new Set(profiles.map((item) => profileKey(item.profile)));
    const acceptedCatalogueProfiles = materialProfiles
      .filter((item) => selectedProfileKeys.has(profileKey(item.profile)))
      .flatMap((item) => [item.profile, ...item.aliases]);
    const profileNames = [...new Set([...profiles.map((item) => item.profile), ...acceptedCatalogueProfiles])];

    // Defense in depth: only profiles/quantities originating from this Offer are allowed.
    const existing = await this.prisma.pieceUnit.findMany({
      where: {
        status: "PENDING",
        assignments: { none: { active: true } },
        barMemberships: { none: { active: true } },
        piece: {
          offerId,
          status: { not: "ARCHIVED" },
          profile: { in: profileNames, mode: "insensitive" },
        },
      },
      select: { id: true, piece: { select: { profile: true, lengthMm: true } } },
      orderBy: [{ pieceId: "asc" }, { sequenceNumber: "asc" }],
    });
    const allowed = new Map<string, number>();
    const unitPools = new Map<string, { ids: string[]; nextIndex: number }>();
    for (const unit of existing) {
      const canonicalProfileKey =
        catalogueKeyByName.get(profileKey(unit.piece.profile)) ?? profileKey(unit.piece.profile);
      const key = `${canonicalProfileKey}\u0000${unit.piece.lengthMm}`;
      allowed.set(key, (allowed.get(key) ?? 0) + 1);
      const pool = unitPools.get(key);
      if (pool) pool.ids.push(unit.id);
      else unitPools.set(key, { ids: [unit.id], nextIndex: 0 });
    }
    for (const profile of profiles) {
      for (const requirement of profile.requirements) {
        const available = allowed.get(`${profileKey(profile.profile)}\u0000${requirement.lengthMm}`) ?? 0;
        if (requirement.quantity > available) {
          throw new BadRequestException({
            code: "FACONNAGE_REQUIREMENT_OUTSIDE_OFFER",
            message: `Le besoin ${profile.profile} / ${requirement.lengthMm} mm ne correspond pas aux pièces de cette offre.`,
          });
        }
      }
    }

    let results;
    try {
      results = this.optimizerExecution
        ? await this.optimizerExecution.optimize(profiles)
        : await Promise.all(profiles.map((profile) => this.optimizer.optimize(profile)));
    } catch (error) {
      if (error instanceof RawStockLimitError) {
        throw new BadRequestException({
          code: "FACONNAGE_RAW_STOCK_INSUFFICIENT",
          message: `La quantité de matière brute disponible ne suffit pas pour le profil ${error.profile}. Augmentez le stock disponible ou ajoutez une longueur brute.`,
        });
      }
      throw error;
    }
    const createdAt = new Date();
    const reference = `${offer.reference}-CP-${createdAt.toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const proposalSpecs = results.flatMap((result) => result.bars.map((bar) => ({ result, bar })));
    const planId = randomUUID();
    const proposals: Array<{
      id: string;
      reference: string;
      ordinal: number;
      profile: string;
      rawLengthMm: number;
      usedLengthMm: number;
      wasteMm: number;
      cuts: Array<{ lengthMm: number; quantity: number }>;
      pieceUnitIds: string[];
    }> = [];
    for (const [index, { result, bar }] of proposalSpecs.entries()) {
      const pieceUnitIds: string[] = [];
      for (const cut of bar.cuts) {
        const key = `${profileKey(result.profile)}\u0000${cut.lengthMm}`;
        const pool = unitPools.get(key);
        const remaining = pool ? pool.ids.length - pool.nextIndex : 0;
        if (!pool || remaining < cut.quantity) {
          throw new ConflictException({
            code: "FACONNAGE_DEMAND_CHANGED",
            message:
              "Les pièces disponibles ont changé pendant le calcul. Actualisez puis relancez le façonnage.",
          });
        }
        pieceUnitIds.push(...pool.ids.slice(pool.nextIndex, pool.nextIndex + cut.quantity));
        pool.nextIndex += cut.quantity;
      }
      proposals.push({
        id: randomUUID(),
        reference: `${reference}-P${String(index + 1).padStart(3, "0")}`,
        ordinal: index + 1,
        profile: normalizeProfile(result.profile),
        rawLengthMm: bar.rawLengthMm,
        usedLengthMm: bar.usedLengthMm,
        wasteMm: bar.wasteMm,
        cuts: bar.cuts,
        pieceUnitIds,
      });
    }
    const totalRawLengthMm = results.reduce((sum, result) => sum + result.totalRawLengthMm, 0);
    const totalUsedLengthMm = results.reduce((sum, result) => sum + result.totalUsedLengthMm, 0);
    const summary = {
      profileCount: results.length,
      totalBars: results.reduce((sum, result) => sum + result.totalBars, 0),
      totalRawLengthMm,
      totalUsedLengthMm,
      totalWasteMm: results.reduce((sum, result) => sum + result.totalWasteMm, 0),
      utilizationRate: roundRate(totalUsedLengthMm, totalRawLengthMm),
    };

    const plan = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "Offer" WHERE "id" = ${offerId} FOR UPDATE`,
        );
        const currentOffer = await transaction.offer.findUnique({ where: { id: offerId } });
        if (!currentOffer || (currentOffer.status !== "DRAFT" && currentOffer.status !== "READY")) {
          throw new ConflictException({
            code: "OFFER_FACONNAGE_LOCKED",
            message: "L’offre n’accepte plus de nouveaux plans de façonnage.",
          });
        }
        if (currentOffer.materialRevision !== offer.materialRevision) {
          throw new ConflictException({
            code: "CUTTING_PLAN_STALE",
            message: "Les pièces de l’offre ont changé pendant le calcul. Relancez le façonnage.",
          });
        }
        const unfinished = await transaction.cuttingPlan.count({
          where: {
            offerId,
            status: "PARTIALLY_VALIDATED",
            proposals: { some: { status: "PROPOSED" } },
          },
        });
        if (unfinished > 0) {
          throw new ConflictException({
            code: "CUTTING_PLAN_REMAINDER_EXISTS",
            message:
              "Terminez ou annulez les barres restantes du plan partiellement validé avant de créer un nouveau plan.",
          });
        }
        const proposedUnitIds = proposals.flatMap((proposal) => proposal.pieceUnitIds);
        const stillAvailable = await transaction.pieceUnit.count({
          where: {
            id: { in: proposedUnitIds },
            status: "PENDING",
            assignments: { none: { active: true } },
            barMemberships: { none: { active: true } },
            piece: { offerId, status: { not: "ARCHIVED" } },
          },
        });
        if (stillAvailable !== proposedUnitIds.length) {
          throw new ConflictException({
            code: "FACONNAGE_DEMAND_CHANGED",
            message:
              "Certaines pièces ont été engagées ailleurs pendant le calcul. Relancez le façonnage.",
          });
        }
        const createdPlan = await transaction.cuttingPlan.create({
          data: {
            id: planId,
            offerId,
            reference,
            profileCount: summary.profileCount,
            totalBars: summary.totalBars,
            totalRawLengthMm: summary.totalRawLengthMm,
            totalUsedLengthMm: summary.totalUsedLengthMm,
            totalWasteMm: summary.totalWasteMm,
            utilizationRate: summary.utilizationRate,
            sourceRevision: offer.materialRevision,
            input: profiles as unknown as Prisma.InputJsonValue,
            result: { profiles: results, summary } as unknown as Prisma.InputJsonValue,
            createdById: actor.user.id,
            proposals: {
              create: proposals.map((proposal) => ({
                id: proposal.id,
                reference: proposal.reference,
                ordinal: proposal.ordinal,
                profile: proposal.profile,
                rawLengthMm: proposal.rawLengthMm,
                usedLengthMm: proposal.usedLengthMm,
                wasteMm: proposal.wasteMm,
                cuts: proposal.cuts as unknown as Prisma.InputJsonValue,
                items: {
                  create: proposal.pieceUnitIds.map((pieceUnitId) => ({
                    id: randomUUID(),
                    pieceUnitId,
                  })),
                },
              })),
            },
          },
        });
        await transaction.historyEvent.create({
          data: {
            eventType: "FACONNAGE_OPTIMIZATION_EXECUTED",
            entityType: "CUTTING_PLAN",
            entityId: createdPlan.id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: {
              offerId,
              reference: createdPlan.reference,
              summary,
              proposalCount: proposals.length,
              profiles: results.map((result) => ({
                profile: result.profile,
                status: result.status,
                totalBars: result.totalBars,
                totalWasteMm: result.totalWasteMm,
                utilizationRate: result.utilizationRate,
                diagnostics: result.diagnostics,
              })),
            },
          },
        });
        return createdPlan;
      },
      {
        // Plan proposals and their piece-unit links are committed atomically with
        // the audit event. Large valid Offers can exceed Prisma's 5s default.
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

    return {
      profiles: results,
      summary,
      plan: {
        id: plan.id,
        reference: plan.reference,
        status: plan.status,
        createdAt: plan.createdAt.toISOString(),
      },
      proposals: proposals.map((proposal) => ({
        id: proposal.id,
        reference: proposal.reference,
        ordinal: proposal.ordinal,
        profile: proposal.profile,
        rawLengthMm: proposal.rawLengthMm,
        usedLengthMm: proposal.usedLengthMm,
        wasteMm: proposal.wasteMm,
        cuts: proposal.cuts,
        status: "PROPOSED",
        pieceUnitCount: proposal.pieceUnitIds.length,
        cuttingBarId: null,
        cuttingBarReference: null,
      })),
    };
  }
}
