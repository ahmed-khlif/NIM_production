import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { deliverBusinessNotification } from "../notifications/notification-delivery";
import { parseListSort } from "../list-sorting";

const offerReference = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[A-Za-z0-9._/-]+$/, "La référence contient des caractères non autorisés.");

const createOfferSchema = z.object({
  reference: offerReference,
  revision: z.string().trim().min(1).max(20).default("A"),
  name: z.string().trim().min(2).max(160),
  clientId: z.string().trim().min(1).max(128).optional().nullable(),
  clientName: z.string().trim().max(160).optional().nullable(),
  site: z.string().trim().max(160).optional().nullable(),
  description: z.string().trim().max(1200).optional().nullable(),
});

const updateOfferSchema = z.object({
  revision: z.string().trim().min(1).max(20).optional(),
  name: z.string().trim().min(2).max(160).optional(),
  clientId: z.string().trim().min(1).max(128).optional().nullable(),
  clientName: z.string().trim().max(160).optional().nullable(),
  site: z.string().trim().max(160).optional().nullable(),
  description: z.string().trim().max(1200).optional().nullable(),
  status: z.enum(["DRAFT", "READY", "IN_PRODUCTION", "COMPLETED"]).optional(),
});

const overrideOfferStatusSchema = z.object({
  status: z.enum(["DRAFT", "READY", "IN_PRODUCTION", "COMPLETED"]),
});

type OfferStatusValue = "DRAFT" | "READY" | "IN_PRODUCTION" | "COMPLETED" | "ARCHIVED";

type OfferListOptions = {
  search?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
  status?: string;
  clientName?: string;
  site?: string;
  sortBy?: string;
  sortDirection?: string;
};

type OfferPieceMetric = {
  offerId: string;
  profile: string;
  pieceRows: number;
  totalUnits: number;
};

type OfferPlanMetric = {
  id: string;
  offerId: string;
  reference: string;
  status: string;
  totalBars: number;
  totalWasteMm: number;
  utilizationRate: Prisma.Decimal;
  createdAt: Date;
};

const offerDetailPlanSelect = {
  id: true,
  reference: true,
  status: true,
  totalBars: true,
  totalWasteMm: true,
  utilizationRate: true,
  createdAt: true,
  proposals: { where: { status: "VALIDATED" }, select: { id: true } },
} satisfies Prisma.CuttingPlanSelect;

function cleanNullable(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const normalized = value?.trim() ?? "";
  return normalized.length ? normalized : null;
}

function percentage(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 10000) / 100;
}

function normalizeReference(reference: string): string {
  return reference.trim().toUpperCase();
}

function normalizeRevision(revision: string): string {
  return revision.trim().toUpperCase();
}

function normalizeClientName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("fr-FR").replace(/\s+/g, " ");
}

@Injectable()
export class OffersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async findRecord(id: string) {
    const offer = await this.prisma.offer.findUnique({ where: { id } });
    if (!offer) {
      throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Offre introuvable." });
    }
    return offer;
  }

  private async resolveClient(
    input: { clientId?: string | null; clientName?: string | null },
    allowedArchivedClientId?: string,
  ) {
    if (input.clientId !== undefined) {
      if (input.clientId === null) return null;
      const client = await this.prisma.client.findFirst({
        where: {
          id: input.clientId,
          ...(input.clientId === allowedArchivedClientId ? {} : { archivedAt: null }),
        },
        select: { id: true, name: true },
      });
      if (!client)
        throw new BadRequestException({
          code: "CLIENT_NOT_AVAILABLE",
          message: "Sélectionnez un client actif dans le répertoire.",
        });
      return client;
    }
    const legacyName = cleanNullable(input.clientName);
    if (!legacyName) return null;
    const client = await this.prisma.client.findUnique({
      where: { nameKey: normalizeClientName(legacyName) },
      select: { id: true, name: true, archivedAt: true },
    });
    if (!client || client.archivedAt) {
      throw new BadRequestException({
        code: "CLIENT_SELECTION_REQUIRED",
        message: "Choisissez un client enregistré ou créez sa fiche avant d’enregistrer l’affaire.",
      });
    }
    return { id: client.id, name: client.name };
  }

  async assertActive(id: string): Promise<void> {
    const offer = await this.findRecord(id);
    if (offer.status === "ARCHIVED") {
      throw new BadRequestException({
        code: "OFFER_ARCHIVED",
        message: "Cette offre est archivée et ne peut plus être modifiée.",
      });
    }
  }

  private async metricsFor(offerIds: string[]): Promise<{
    pieces: OfferPieceMetric[];
    plans: OfferPlanMetric[];
    manufacturedByOffer: Map<string, number>;
    validatedByPlan: Map<string, number>;
  }> {
    if (offerIds.length === 0) {
      return { pieces: [], plans: [], manufacturedByOffer: new Map(), validatedByPlan: new Map() };
    }
    const [pieceGroups, manufacturedGroups, plans] = await Promise.all([
      this.prisma.piece.groupBy({
        by: ["offerId", "profile"],
        where: { offerId: { in: offerIds }, status: { not: "ARCHIVED" } },
        _count: { _all: true },
        _sum: { quantity: true },
      }),
      this.prisma.$queryRaw<Array<{ offerId: string; count: number }>>(Prisma.sql`
        SELECT p."offerId" AS "offerId", COUNT(pu."id")::int AS "count"
        FROM "Piece" p
        INNER JOIN "PieceUnit" pu ON pu."pieceId" = p."id"
        WHERE p."offerId" IN (${Prisma.join(offerIds)})
          AND p."status" <> 'ARCHIVED'
          AND pu."manufacturedAt" IS NOT NULL
        GROUP BY p."offerId"
      `),
      this.prisma.$queryRaw<OfferPlanMetric[]>(Prisma.sql`
        WITH ranked AS (
          SELECT "id", "offerId", "reference", "status", "totalBars", "totalWasteMm",
                 "utilizationRate", "createdAt",
                 ROW_NUMBER() OVER (
                   PARTITION BY "offerId"
                   ORDER BY CASE "status"
                     WHEN 'VALIDATED' THEN 0
                     WHEN 'PARTIALLY_VALIDATED' THEN 1
                     WHEN 'APPROVED' THEN 2
                     ELSE 3
                   END, "createdAt" DESC, "id" ASC
                 ) AS rank
          FROM "CuttingPlan"
          WHERE "offerId" IN (${Prisma.join(offerIds)}) AND "status" <> 'ARCHIVED'
        )
        SELECT "id", "offerId", "reference", "status", "totalBars", "totalWasteMm",
               "utilizationRate", "createdAt"
        FROM ranked WHERE rank = 1
      `),
    ]);
    const pieces = pieceGroups.map((group) => ({
      offerId: group.offerId,
      profile: group.profile,
      pieceRows: group._count._all,
      totalUnits: group._sum.quantity ?? 0,
    }));
    const partialPlanIds = plans
      .filter((plan) => plan.status === "PARTIALLY_VALIDATED")
      .map((plan) => plan.id);
    const proposalGroups = partialPlanIds.length
      ? await this.prisma.cuttingPlanProposal.groupBy({
          by: ["cuttingPlanId"],
          where: { cuttingPlanId: { in: partialPlanIds }, status: "VALIDATED" },
          _count: { _all: true },
        })
      : [];
    return {
      pieces,
      plans,
      manufacturedByOffer: new Map(manufacturedGroups.map((group) => [group.offerId, group.count])),
      validatedByPlan: new Map(
        proposalGroups.map((group) => [group.cuttingPlanId, group._count._all]),
      ),
    };
  }

  private buildMetrics(
    offerId: string,
    pieces: OfferPieceMetric[],
    plans: OfferPlanMetric[],
    manufacturedByOffer: Map<string, number>,
    validatedByPlan: Map<string, number>,
  ) {
    const scopedPieces = pieces.filter((piece) => piece.offerId === offerId);
    const pieceRows = scopedPieces.reduce((sum, piece) => sum + piece.pieceRows, 0);
    const totalUnits = scopedPieces.reduce((sum, piece) => sum + piece.totalUnits, 0);
    const manufacturedUnits = manufacturedByOffer.get(offerId) ?? 0;
    const profiles = new Set(scopedPieces.map((piece) => piece.profile.trim().toUpperCase()));
    const latestPlan = plans.find((plan) => plan.offerId === offerId) ?? null;
    return {
      pieceRows,
      totalUnits,
      manufacturedUnits,
      profileCount: profiles.size,
      progressRate: percentage(manufacturedUnits, totalUnits),
      plannedBars: latestPlan
        ? latestPlan.status === "PARTIALLY_VALIDATED"
          ? (validatedByPlan.get(latestPlan.id) ?? 0)
          : latestPlan.totalBars
        : 0,
      latestPlan: latestPlan
        ? {
            id: latestPlan.id,
            reference: latestPlan.reference,
            status: latestPlan.status,
            totalBars: latestPlan.totalBars,
            totalWasteMm: latestPlan.totalWasteMm,
            utilizationRate: Number(latestPlan.utilizationRate),
            createdAt: latestPlan.createdAt.toISOString(),
          }
        : null,
    };
  }

  async list(options: OfferListOptions = {}) {
    const search = options.search?.trim();
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1_000_000 ||
      !Number.isInteger(pageSize) ||
      ![10, 20, 50].includes(pageSize)
    ) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La pagination des offres est invalide.",
      });
    }
    const offerStatuses = ["DRAFT", "READY", "IN_PRODUCTION", "COMPLETED", "ARCHIVED"];
    if (options.status && !offerStatuses.includes(options.status)) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Le filtre de statut d’offre est invalide.",
      });
    }
    if (search && search.length > 80) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La recherche est trop longue.",
      });
    }
    const where: Prisma.OfferWhereInput = {
      ...(options.includeArchived ? {} : { status: { not: "ARCHIVED" } }),
      ...(options.status
        ? { status: options.status as Prisma.EnumOfferStatusFilter["equals"] }
        : {}),
      ...(options.clientName ? { clientName: options.clientName } : {}),
      ...(options.site ? { site: options.site } : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
              { clientName: { contains: search, mode: "insensitive" } },
              { site: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const sort = parseListSort(options.sortBy, options.sortDirection, ["reference", "name", "clientName", "site", "status", "createdAt", "updatedAt"] as const, { sortBy: "status", sortDirection: "asc" });
    const orderBy: Prisma.OfferOrderByWithRelationInput[] = [
      { [sort.sortBy]: sort.sortDirection },
      { id: "asc" },
    ];
    const [offers, total, clientGroups, siteGroups] = await Promise.all([
      this.prisma.offer.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.offer.count({ where }),
      this.prisma.offer.groupBy({
        by: ["clientName"],
        where: options.includeArchived ? {} : { status: { not: "ARCHIVED" } },
      }),
      this.prisma.offer.groupBy({
        by: ["site"],
        where: options.includeArchived ? {} : { status: { not: "ARCHIVED" } },
      }),
    ]);
    const { pieces, plans, manufacturedByOffer, validatedByPlan } = await this.metricsFor(
      offers.map((offer) => offer.id),
    );
    return {
      offers: offers.map((offer) => ({
        id: offer.id,
        reference: offer.reference,
        revision: offer.revision,
        name: offer.name,
        clientName: offer.clientName,
        clientId: offer.clientId,
        site: offer.site,
        description: offer.description,
        status: offer.status as OfferStatusValue,
        archivedAt: offer.archivedAt?.toISOString() ?? null,
        createdAt: offer.createdAt.toISOString(),
        updatedAt: offer.updatedAt.toISOString(),
        ...this.buildMetrics(offer.id, pieces, plans, manufacturedByOffer, validatedByPlan),
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      sorting: sort,
      facets: {
        clients: clientGroups
          .map((group) => group.clientName)
          .filter((value): value is string => Boolean(value))
          .sort((a, b) => a.localeCompare(b, "fr")),
        sites: siteGroups
          .map((group) => group.site)
          .filter((value): value is string => Boolean(value))
          .sort((a, b) => a.localeCompare(b, "fr")),
      },
    };
  }

  async get(id: string) {
    const offer = await this.findRecord(id);
    const [pieceGroups, manufacturedUnits, preferredPlans, latestPlan, recentPlans] =
      await Promise.all([
        this.prisma.piece.groupBy({
          by: ["profile"],
          where: { offerId: id, status: { not: "ARCHIVED" } },
          _count: { _all: true },
          _sum: { quantity: true },
        }),
        this.prisma.pieceUnit.count({
          where: {
            manufacturedAt: { not: null },
            piece: { offerId: id, status: { not: "ARCHIVED" } },
          },
        }),
        Promise.all(
          (["VALIDATED", "PARTIALLY_VALIDATED", "APPROVED"] as const).map((status) =>
            this.prisma.cuttingPlan.findFirst({
              where: { offerId: id, status },
              select: offerDetailPlanSelect,
              orderBy: { createdAt: "desc" },
            }),
          ),
        ),
        this.prisma.cuttingPlan.findFirst({
          where: { offerId: id, status: { not: "ARCHIVED" } },
          select: offerDetailPlanSelect,
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.cuttingPlan.findMany({
          where: { offerId: id, status: { not: "ARCHIVED" } },
          select: offerDetailPlanSelect,
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
      ]);
    const selectedPlan = preferredPlans[0] ?? preferredPlans[1] ?? preferredPlans[2] ?? latestPlan;
    const offerMetrics = {
      pieceRows: pieceGroups.reduce((sum, group) => sum + group._count._all, 0),
      totalUnits: pieceGroups.reduce((sum, group) => sum + (group._sum.quantity ?? 0), 0),
      manufacturedUnits,
      profileCount: new Set(pieceGroups.map((group) => group.profile.trim().toUpperCase())).size,
      progressRate: percentage(
        manufacturedUnits,
        pieceGroups.reduce((sum, group) => sum + (group._sum.quantity ?? 0), 0),
      ),
      plannedBars: selectedPlan
        ? selectedPlan.status === "PARTIALLY_VALIDATED"
          ? selectedPlan.proposals.length
          : selectedPlan.totalBars
        : 0,
      latestPlan: selectedPlan
        ? {
            id: selectedPlan.id,
            reference: selectedPlan.reference,
            status: selectedPlan.status,
            totalBars: selectedPlan.totalBars,
            totalWasteMm: selectedPlan.totalWasteMm,
            utilizationRate: Number(selectedPlan.utilizationRate),
            createdAt: selectedPlan.createdAt.toISOString(),
          }
        : null,
    };
    const cuttingPlans = recentPlans.map((plan) => ({
      id: plan.id,
      reference: plan.reference,
      status: plan.status,
      totalBars: plan.totalBars,
      totalWasteMm: plan.totalWasteMm,
      utilizationRate: Number(plan.utilizationRate),
      createdAt: plan.createdAt.toISOString(),
    }));
    return {
      id: offer.id,
      reference: offer.reference,
      revision: offer.revision,
      name: offer.name,
      clientName: offer.clientName,
      clientId: offer.clientId,
      site: offer.site,
      description: offer.description,
      status: offer.status as OfferStatusValue,
      archivedAt: offer.archivedAt?.toISOString() ?? null,
      createdAt: offer.createdAt.toISOString(),
      updatedAt: offer.updatedAt.toISOString(),
      ...offerMetrics,
      cuttingPlans,
    };
  }

  async getProductionSummary(
    id: string,
    options: { page?: number; pageSize?: number; search?: string; status?: string; sortBy?: string; sortDirection?: string } = {},
  ) {
    const offer = await this.findRecord(id);
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      ![10, 20, 50].includes(pageSize)
    ) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La pagination de l’avancement est invalide.",
      });
    }
    const search = options.search?.trim();
    const pieceStatuses = ["PLANNED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "DELAYED"];
    if (search && search.length > 80)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La recherche est trop longue.",
      });
    if (options.status && !pieceStatuses.includes(options.status))
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Le filtre de statut de pièce est invalide.",
      });
    const sort = parseListSort(options.sortBy, options.sortDirection, ["reference", "profile", "quantity"] as const, { sortBy: "profile", sortDirection: "asc" });
    const allPiecesWhere: Prisma.PieceWhereInput = { offerId: id, status: { not: "ARCHIVED" } };
    const filteredPiecesWhere: Prisma.PieceWhereInput = {
      ...allPiecesWhere,
      ...(options.status
        ? { status: options.status as Prisma.EnumPieceStatusFilter["equals"] }
        : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: "insensitive" } },
              { profile: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [
      pieces,
      pieceRows,
      filteredPieceRows,
      unitGroups,
      totalUnitsAggregate,
      activeAssignments,
      activeOperations,
      pendingQuality,
    ] = await Promise.all([
      this.prisma.piece.findMany({
        where: filteredPiecesWhere,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          reference: true,
          profile: true,
          quantity: true,
          status: true,
        },
        orderBy: options.sortBy
          ? [{ [sort.sortBy]: sort.sortDirection }, { id: "asc" }]
          : [{ profile: "asc" }, { reference: "asc" }, { id: "asc" }],
      }),
      this.prisma.piece.count({ where: allPiecesWhere }),
      search || options.status
        ? this.prisma.piece.count({ where: filteredPiecesWhere })
        : this.prisma.piece.count({ where: allPiecesWhere }),
      this.prisma.pieceUnit.groupBy({
        by: ["status"],
        where: { piece: { offerId: id, status: { not: "ARCHIVED" } } },
        _count: { _all: true },
      }),
      this.prisma.piece.aggregate({ where: allPiecesWhere, _sum: { quantity: true } }),
      this.prisma.assignment.count({
        where: { active: true, pieceUnit: { piece: { offerId: id } } },
      }),
      this.prisma.productionOperation.count({
        where: { status: "IN_PROGRESS", piece: { offerId: id } },
      }),
      this.prisma.pieceUnit.count({
        where: { status: "QUALITY_PENDING", piece: { offerId: id, status: { not: "ARCHIVED" } } },
      }),
    ]);

    const perPieceGroups = pieces.length
      ? await this.prisma.pieceUnit.groupBy({
          by: ["pieceId", "status"],
          where: { pieceId: { in: pieces.map((piece) => piece.id) } },
          _count: { _all: true },
        })
      : [];

    const statusCounts = Object.fromEntries(
      unitGroups.map((group) => [group.status, group._count._all]),
    ) as Record<string, number>;
    const totalUnits = totalUnitsAggregate._sum.quantity ?? 0;
    const manufacturedUnits = [
      "COMPLETED",
      "QUALITY_PENDING",
      "ACCEPTED",
      "REJECTED",
      "SCRAPPED",
    ].reduce((sum, status) => sum + (statusCounts[status] ?? 0), 0);
    const acceptedUnits = statusCounts.ACCEPTED ?? 0;
    const scrappedUnits = statusCounts.SCRAPPED ?? 0;
    const resolvedUnits = acceptedUnits + scrappedUnits;

    return {
      offer: {
        id: offer.id,
        reference: offer.reference,
        status: offer.status as OfferStatusValue,
      },
      totals: {
        pieceRows,
        totalUnits,
        manufacturedUnits,
        resolvedUnits,
        acceptedUnits,
        scrappedUnits,
        pendingQuality,
        activeAssignments,
        activeOperations,
        productionRate: percentage(manufacturedUnits, totalUnits),
        completionRate: percentage(resolvedUnits, totalUnits),
      },
      statusCounts,
      pagination: {
        page,
        pageSize,
        total: filteredPieceRows,
        totalPages: Math.max(1, Math.ceil(filteredPieceRows / pageSize)),
      },
      pieces: pieces.map((piece) => {
        const groups = perPieceGroups.filter((group) => group.pieceId === piece.id);
        const completedUnits = groups
          .filter((group) =>
            ["COMPLETED", "QUALITY_PENDING", "ACCEPTED", "REJECTED", "SCRAPPED"].includes(
              group.status,
            ),
          )
          .reduce((sum, group) => sum + group._count._all, 0);
        const resolved = groups
          .filter((group) => ["ACCEPTED", "SCRAPPED"].includes(group.status))
          .reduce((sum, group) => sum + group._count._all, 0);
        return {
          id: piece.id,
          reference: piece.reference,
          profile: piece.profile,
          quantity: piece.quantity,
          status: piece.status,
          completedUnits,
          resolvedUnits: resolved,
          progressRate: percentage(completedUnits, piece.quantity),
        };
      }),
    };
  }

  async create(actor: AuthContext, input: unknown) {
    const parsed = createOfferSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "OFFER_VALIDATION_ERROR",
        message: "Vérifiez les informations de l’offre.",
        details: parsed.error.flatten(),
      });
    }
    const reference = normalizeReference(parsed.data.reference);
    const existing = await this.prisma.offer.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: "OFFER_REFERENCE_TAKEN",
        message: "Cette référence d’offre existe déjà.",
      });
    }
    const client = await this.resolveClient(parsed.data);
    const created = await this.prisma.$transaction(async (transaction) => {
      const offer = await transaction.offer.create({
        data: {
          reference,
          revision: normalizeRevision(parsed.data.revision),
          name: parsed.data.name.trim(),
          clientId: client?.id ?? null,
          clientName: client?.name ?? null,
          site: cleanNullable(parsed.data.site) ?? null,
          description: cleanNullable(parsed.data.description) ?? null,
          createdById: actor.user.id,
        },
      });
      const event = await transaction.historyEvent.create({
        data: {
          eventType: "OFFER_CREATED",
          entityType: "OFFER",
          entityId: offer.id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { reference: offer.reference, revision: offer.revision, name: offer.name },
        },
      });
      await deliverBusinessNotification(transaction, event, { offerId: offer.id });
      return offer;
    });
    return this.get(created.id);
  }

  private async validateStatusTransition(
    id: string,
    currentStatus: OfferStatusValue,
    nextStatus: Exclude<OfferStatusValue, "ARCHIVED">,
  ) {
    if (currentStatus === nextStatus) return;

    const allowed: Record<
      Exclude<OfferStatusValue, "ARCHIVED">,
      Array<Exclude<OfferStatusValue, "ARCHIVED">>
    > = {
      DRAFT: ["READY"],
      READY: ["DRAFT", "IN_PRODUCTION"],
      IN_PRODUCTION: ["COMPLETED"],
      COMPLETED: [],
    };
    if (currentStatus === "ARCHIVED") {
      throw new BadRequestException({
        code: "OFFER_STATUS_TRANSITION_INVALID",
        message: `Transition de statut non autorisée : ${currentStatus} → ${nextStatus}.`,
      });
    }
    if (!allowed[currentStatus].includes(nextStatus)) {
      throw new BadRequestException({
        code: "OFFER_STATUS_TRANSITION_INVALID",
        message: `Transition de statut non autorisée : ${currentStatus} → ${nextStatus}.`,
      });
    }

    const pieceCount = await this.prisma.piece.count({
      where: { offerId: id, status: { not: "ARCHIVED" } },
    });
    if (pieceCount === 0) {
      throw new BadRequestException({
        code: "OFFER_HAS_NO_PIECES",
        message: "Ajoutez au moins une pièce avant de faire évoluer le statut de l’offre.",
      });
    }

    if (nextStatus === "READY" || nextStatus === "IN_PRODUCTION") {
      const approvedPlan = await this.prisma.cuttingPlan.count({
        where: { offerId: id, status: { in: ["APPROVED", "PARTIALLY_VALIDATED", "VALIDATED"] } },
      });
      if (approvedPlan === 0) {
        throw new BadRequestException({
          code: "OFFER_HAS_NO_APPROVED_PLAN",
          message: "Validez d’abord un plan de mise en barres avant de poursuivre l’offre.",
        });
      }
    }

    if (nextStatus === "DRAFT") {
      const activePieces = await this.prisma.piece.count({
        where: { offerId: id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
      });
      if (activePieces > 0) {
        throw new BadRequestException({
          code: "OFFER_HAS_ACTIVE_PRODUCTION",
          message: "Impossible de revenir en brouillon pendant une fabrication en cours.",
        });
      }
      const activeBars = await this.prisma.cuttingBar.count({
        where: { offerId: id, status: { not: "CANCELLED" } },
      });
      if (activeBars > 0) {
        throw new BadRequestException({
          code: "OFFER_HAS_ACTIVE_CUTTING_BARS",
          message:
            "Retirez d’abord les affectations, puis annulez les barres façonnées avant de repasser cette offre en brouillon.",
        });
      }
    }

    if (nextStatus === "COMPLETED") {
      const [unresolvedUnits, activeOperations] = await Promise.all([
        this.prisma.pieceUnit.count({
          where: {
            piece: { offerId: id, status: { not: "ARCHIVED" } },
            status: { notIn: ["ACCEPTED", "SCRAPPED"] },
          },
        }),
        this.prisma.productionOperation.count({
          where: { piece: { offerId: id }, status: "IN_PROGRESS" },
        }),
      ]);
      if (activeOperations > 0 || unresolvedUnits > 0) {
        throw new BadRequestException({
          code: "OFFER_PRODUCTION_NOT_FINISHED",
          message:
            "Toutes les unités doivent être fabriquées et leur contrôle qualité résolu avant de terminer l’offre.",
        });
      }
    }
  }

  async update(actor: AuthContext, id: string, input: unknown) {
    const target = await this.findRecord(id);
    if (target.status === "ARCHIVED") {
      throw new BadRequestException({
        code: "OFFER_ARCHIVED",
        message: "Restaurez l’offre avant de la modifier.",
      });
    }
    const parsed = updateOfferSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "OFFER_VALIDATION_ERROR",
        message: "Vérifiez les informations de l’offre.",
        details: parsed.error.flatten(),
      });
    }
    if (parsed.data.status)
      await this.validateStatusTransition(
        id,
        target.status as OfferStatusValue,
        parsed.data.status,
      );
    const clientInputProvided =
      parsed.data.clientId !== undefined || parsed.data.clientName !== undefined;
    const client = clientInputProvided
      ? await this.resolveClient(parsed.data, target.clientId ?? undefined)
      : undefined;
    await this.prisma.$transaction(async (transaction) => {
      if (parsed.data.status === "DRAFT" && target.status === "READY") {
        await transaction.cuttingPlan.updateMany({
          where: { offerId: id, status: { in: ["APPROVED", "PARTIALLY_VALIDATED", "VALIDATED"] } },
          data: { status: "ARCHIVED" },
        });
      }
      const offer = await transaction.offer.update({
        where: { id },
        data: {
          ...(parsed.data.revision ? { revision: normalizeRevision(parsed.data.revision) } : {}),
          ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
          ...(clientInputProvided
            ? { clientId: client?.id ?? null, clientName: client?.name ?? null }
            : {}),
          ...(parsed.data.site !== undefined
            ? { site: cleanNullable(parsed.data.site) ?? null }
            : {}),
          ...(parsed.data.description !== undefined
            ? { description: cleanNullable(parsed.data.description) ?? null }
            : {}),
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
          version: { increment: 1 },
        },
      });
      const event = await transaction.historyEvent.create({
        data: {
          eventType: "OFFER_UPDATED",
          entityType: "OFFER",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: {
            reference: offer.reference,
            previousVersion: target.version,
            version: offer.version,
          },
        },
      });
      await deliverBusinessNotification(transaction, event, { offerId: id });
    });
    return this.get(id);
  }

  async overrideStatus(actor: AuthContext, id: string, input: unknown) {
    if (actor.user.role !== "ADMIN") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Seul un administrateur peut forcer le statut d’une affaire.",
      });
    }
    const parsed = overrideOfferStatusSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "OFFER_STATUS_VALIDATION_ERROR",
        message: "Sélectionnez un statut d’affaire valide.",
        details: parsed.error.flatten(),
      });
    }

    await this.prisma.$transaction(async (transaction) => {
      const target = await transaction.offer.findUnique({ where: { id } });
      if (!target) {
        throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Affaire introuvable." });
      }
      if (target.status === "ARCHIVED") {
        throw new BadRequestException({
          code: "OFFER_ARCHIVED",
          message: "Restaurez l’affaire avant de modifier son statut.",
        });
      }
      if (target.status === parsed.data.status) return;

      const updated = await transaction.offer.updateMany({
        where: { id, version: target.version, status: target.status },
        data: { status: parsed.data.status, version: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new ConflictException({
          code: "OFFER_CHANGED_CONCURRENTLY",
          message: "L’affaire a été modifiée entre-temps. Actualisez la page puis réessayez.",
        });
      }
      const event = await transaction.historyEvent.create({
        data: {
          eventType: "OFFER_STATUS_OVERRIDDEN",
          entityType: "OFFER",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: {
            reference: target.reference,
            previousStatus: target.status,
            status: parsed.data.status,
            override: true,
            productionDataPreserved: true,
            previousVersion: target.version,
            version: target.version + 1,
          },
        },
      });
      await deliverBusinessNotification(transaction, event, { offerId: id });
    });
    return this.get(id);
  }

  async archive(actor: AuthContext, id: string) {
    const target = await this.findRecord(id);
    if (target.status === "ARCHIVED") return this.get(id);
    if (target.status === "IN_PRODUCTION") {
      throw new BadRequestException({
        code: "OFFER_PRODUCTION_ACTIVE",
        message: "Terminez le cycle de production et de qualité avant d’archiver cette offre.",
      });
    }
    const activePieces = await this.prisma.piece.count({
      where: { offerId: id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
    });
    if (activePieces > 0) {
      throw new BadRequestException({
        code: "OFFER_HAS_ACTIVE_PRODUCTION",
        message: "Une offre avec des pièces affectées ou en fabrication ne peut pas être archivée.",
      });
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.offer.update({
        where: { id },
        data: { status: "ARCHIVED", archivedAt: new Date(), version: { increment: 1 } },
      });
      const event = await transaction.historyEvent.create({
        data: {
          eventType: "OFFER_ARCHIVED",
          entityType: "OFFER",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { reference: target.reference },
        },
      });
      await deliverBusinessNotification(transaction, event, { offerId: id });
    });
    return this.get(id);
  }

  async restore(actor: AuthContext, id: string) {
    const target = await this.findRecord(id);
    if (target.status !== "ARCHIVED") return this.get(id);
    await this.prisma.$transaction(async (transaction) => {
      // A restored offer always returns to editable draft state. Previously validated plans
      // remain in history; users must create a fresh plan before continuing this Offer.
      await transaction.cuttingPlan.updateMany({
        where: { offerId: id, status: { in: ["APPROVED", "PARTIALLY_VALIDATED", "VALIDATED"] } },
        data: { status: "ARCHIVED" },
      });
      await transaction.offer.update({
        where: { id },
        data: { status: "DRAFT", archivedAt: null, version: { increment: 1 } },
      });
      const event = await transaction.historyEvent.create({
        data: {
          eventType: "OFFER_RESTORED",
          entityType: "OFFER",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { reference: target.reference },
        },
      });
      await deliverBusinessNotification(transaction, event, { offerId: id });
    });
    return this.get(id);
  }

  async remove(actor: AuthContext, id: string): Promise<{ success: true }> {
    const target = await this.findRecord(id);
    if (target.status !== "DRAFT") {
      throw new BadRequestException({
        code: "OFFER_DELETE_ONLY_DRAFT",
        message: "Seule une offre brouillon vide peut être supprimée définitivement.",
      });
    }
    const [pieces, plans] = await Promise.all([
      this.prisma.piece.count({ where: { offerId: id } }),
      this.prisma.cuttingPlan.count({ where: { offerId: id } }),
    ]);
    if (pieces + plans > 0) {
      throw new BadRequestException({
        code: "OFFER_DELETE_NOT_EMPTY",
        message:
          "Cette offre contient déjà des données. Archivez-la pour conserver la traçabilité.",
      });
    }
    await this.prisma.$transaction(async (transaction) => {
      const event = await transaction.historyEvent.create({
        data: {
          eventType: "OFFER_DELETED",
          entityType: "OFFER",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { reference: target.reference, name: target.name },
        },
      });
      await deliverBusinessNotification(transaction, event, { offerId: id, href: "/offers" });
      await transaction.offer.delete({ where: { id } });
    });
    return { success: true };
  }

}
