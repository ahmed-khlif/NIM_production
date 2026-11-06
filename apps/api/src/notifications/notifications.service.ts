import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { ManagedNotification, ManagedNotificationsPage } from "@nim/types";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";

@Injectable()
export class NotificationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(
    actor: AuthContext,
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      eventType?: string;
      unreadOnly?: boolean;
      includeEventTypes?: boolean;
    } = {},
  ): Promise<ManagedNotificationsPage> {
    return this.listForRecipient(actor.user.id, options);
  }

  async listForRecipient(
    recipientUserId: string,
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      eventType?: string;
      unreadOnly?: boolean;
      includeEventTypes?: boolean;
    } = {},
  ): Promise<ManagedNotificationsPage> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const search = options.search?.trim();
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1_000_000 ||
      ![5, 10, 20, 50].includes(pageSize)
    ) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La pagination des notifications est invalide.",
      });
    }
    if (search && search.length > 80)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La recherche est trop longue.",
      });
    if (options.eventType && options.eventType.length > 80)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Le type de notification est invalide.",
      });
    const where: Prisma.NotificationWhereInput = {
      recipientUserId,
      ...(options.unreadOnly ? { readAt: null } : {}),
      ...(options.eventType ? { eventType: options.eventType } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { message: { contains: search, mode: "insensitive" } },
              { eventType: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total, unreadCount, groupedTypes] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { recipientUserId, readAt: null } }),
      options.includeEventTypes
        ? this.prisma.notification.groupBy({ by: ["eventType"], where: { recipientUserId } })
        : Promise.resolve([]),
    ]);
    const notifications: ManagedNotification[] = rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      title: row.title,
      message: row.message,
      actorName: row.actorName,
      href: row.href,
      offerId: row.offerId,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
    return {
      notifications,
      unreadCount,
      eventTypes: groupedTypes.map((item) => item.eventType).sort(),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async markRead(actor: AuthContext, id: string): Promise<{ id: string; readAt: string }> {
    return this.markReadForRecipient(actor.user.id, id);
  }

  async markReadForRecipient(
    recipientUserId: string,
    id: string,
  ): Promise<{ id: string; readAt: string }> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, recipientUserId },
      select: { id: true, readAt: true },
    });
    if (!notification)
      throw new NotFoundException({
        code: "NOTIFICATION_NOT_FOUND",
        message: "Cette notification est introuvable.",
      });
    const readAt = notification.readAt ?? new Date();
    if (!notification.readAt)
      await this.prisma.notification.update({ where: { id: notification.id }, data: { readAt } });
    return { id, readAt: readAt.toISOString() };
  }

  async markAllRead(actor: AuthContext): Promise<{ updatedCount: number; readAt: string }> {
    const readAt = new Date();
    const result = await this.prisma.notification.updateMany({
      where: { recipientUserId: actor.user.id, readAt: null },
      data: { readAt },
    });
    return { updatedCount: result.count, readAt: readAt.toISOString() };
  }
}
