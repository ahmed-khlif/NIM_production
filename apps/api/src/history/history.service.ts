import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { historyQuerySchema } from "@nim/validation";
import type { HistoryPage, ManagedHistoryEvent } from "@nim/types";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";

type HistoryScope = { metadataKey: "pieceId" | "machineId" | "offerId"; id: string } | { actorUserId: string };

function metadataObject(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

@Injectable()
export class HistoryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private toManagedEvent(
    event: Prisma.HistoryEventGetPayload<{
      include: {
        actor: { select: { displayName: true } };
      };
    }>,
  ): ManagedHistoryEvent {
    return {
      id: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actorUserId: event.actorUserId,
      actorName: event.actor?.displayName ?? null,
      actorRole: event.actorRole,
      metadata: metadataObject(event.metadata),
      createdAt: event.createdAt.toISOString(),
    };
  }

  private buildWhere(
    parsed: ReturnType<typeof historyQuerySchema.parse>,
    scope?: HistoryScope,
  ): Prisma.HistoryEventWhereInput {
    const conditions: Prisma.HistoryEventWhereInput[] = [];
    if (parsed.eventType) conditions.push({ eventType: parsed.eventType });
    if (parsed.entityType) conditions.push({ entityType: parsed.entityType });
    if (parsed.actorUserId) conditions.push({ actorUserId: parsed.actorUserId });
    if (parsed.entityId) conditions.push({ entityId: parsed.entityId });
    if (parsed.search) {
      conditions.push({
        OR: [
          { eventType: { contains: parsed.search, mode: "insensitive" } },
          { entityType: { contains: parsed.search, mode: "insensitive" } },
          { entityId: { contains: parsed.search, mode: "insensitive" } },
          { metadata: { path: ["reference"], string_contains: parsed.search, mode: "insensitive" } },
          { metadata: { path: ["offerReference"], string_contains: parsed.search, mode: "insensitive" } },
          { metadata: { path: ["internalNumber"], string_contains: parsed.search, mode: "insensitive" } },
        ],
      });
    }
    if (scope && "actorUserId" in scope) {
      conditions.push({ actorUserId: scope.actorUserId });
    }
    if (scope && "metadataKey" in scope) {
      conditions.push({
        OR: [{ entityId: scope.id }, { metadata: { path: [scope.metadataKey], equals: scope.id } }],
      });
    }
    return conditions.length ? { AND: conditions } : {};
  }

  async list(_actor: AuthContext, input: unknown, scope?: HistoryScope): Promise<HistoryPage> {
    const parsed = historyQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Les filtres d’historique sont invalides.",
        details: parsed.error.flatten(),
      });
    }
    const where = this.buildWhere(parsed.data, scope);
    const skip = (parsed.data.page - 1) * parsed.data.pageSize;
    const sortBy = parsed.data.sortBy ?? "createdAt";
    const sortDirection = parsed.data.sortDirection ?? "desc";
    const orderBy: Prisma.HistoryEventOrderByWithRelationInput[] = sortBy === "actorName"
      ? [{ actor: { displayName: sortDirection } }, { id: "desc" }]
      : [{ [sortBy]: sortDirection }, { id: "desc" }];
    const [total, events] = await Promise.all([
      this.prisma.historyEvent.count({ where }),
      this.prisma.historyEvent.findMany({
        where,
        include: {
          actor: { select: { displayName: true } },
        },
        orderBy,
        skip,
        take: parsed.data.pageSize,
      }),
    ]);
    return {
      events: events.map((event) => this.toManagedEvent(event)),
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / parsed.data.pageSize)),
    };
  }
}
