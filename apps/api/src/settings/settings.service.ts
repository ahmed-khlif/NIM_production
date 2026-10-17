import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { updateSettingsSchema } from "@nim/validation";
import type { UserSettings } from "@nim/types";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";

const defaults: UserSettings = { density: "comfortable", notificationsEnabled: true, updatedAt: null };

@Injectable()
export class SettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get(actor: AuthContext): Promise<UserSettings> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId: actor.user.id } });
    if (!settings) return defaults;
    return { density: settings.density === "compact" ? "compact" : "comfortable", notificationsEnabled: settings.notificationsEnabled, updatedAt: settings.updatedAt.toISOString() };
  }

  async update(actor: AuthContext, input: unknown): Promise<UserSettings> {
    const parsed = updateSettingsSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Les paramètres sont invalides.", details: parsed.error.flatten() });
    const settings = await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.userSettings.upsert({ where: { userId: actor.user.id }, create: { userId: actor.user.id, ...parsed.data }, update: parsed.data });
      await transaction.historyEvent.create({ data: { eventType: "SETTINGS_UPDATED", entityType: "USER", entityId: actor.user.id, actorUserId: actor.user.id, actorRole: actor.user.role, metadata: parsed.data } });
      return saved;
    });
    return { density: settings.density === "compact" ? "compact" : "comfortable", notificationsEnabled: settings.notificationsEnabled, updatedAt: settings.updatedAt.toISOString() };
  }
}
