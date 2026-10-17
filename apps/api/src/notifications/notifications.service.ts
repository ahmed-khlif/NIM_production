import { Inject, Injectable } from "@nestjs/common";
import type { ManagedNotification } from "@nim/types";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";

@Injectable()
export class NotificationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(actor: AuthContext): Promise<{ notifications: ManagedNotification[]; unreadCount: number }> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId: actor.user.id }, select: { notificationsEnabled: true } });
    if (settings && !settings.notificationsEnabled) return { notifications: [], unreadCount: 0 };
    const events = await this.prisma.historyEvent.findMany({
      where: {
        eventType: { not: "AUTH_LOGIN" },
        createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30) },
        ...(actor.user.role === "ADMIN" || actor.user.role === "PRODUCTION_MANAGER" ? {} : { actorUserId: actor.user.id }),
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    const notifications = events.map((event) => {
      const label = event.eventType.replaceAll("_", " ").toLowerCase().replace(/^./, (value) => value.toUpperCase());
      return { id: event.id, eventType: event.eventType, title: label, message: `${event.entityType} · ${event.entityId}`, createdAt: event.createdAt.toISOString(), read: false };
    });
    return { notifications, unreadCount: notifications.length };
  }
}
