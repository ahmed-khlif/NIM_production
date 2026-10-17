import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthService } from "../auth/auth.service";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";

const tabletUserSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  isActive: true,
  tabletAccessEnabled: true,
  connectionKeyHash: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

function newConnectionKey(): { connectionKey: string; connectionKeyId: string } {
  const connectionKeyId = randomBytes(6).toString("hex").toUpperCase();
  const secret = randomBytes(16).toString("hex").toUpperCase();
  return { connectionKeyId, connectionKey: `NIM-${connectionKeyId}-${secret}` };
}

@Injectable()
export class OperatorsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async setTabletAccess(actor: AuthContext, id: string, enabled: boolean) {
    const target = await this.prisma.user.findFirst({ where: { id, role: "OPERATOR" } });
    if (!target)
      throw new NotFoundException({
        code: "OPERATOR_NOT_FOUND",
        message: "Utilisateur opérateur introuvable.",
      });
    if (enabled && !target.isActive) {
      throw new ConflictException({
        code: "OPERATOR_INACTIVE",
        message: "Réactivez d’abord le compte utilisateur.",
      });
    }
    if (enabled && !target.connectionKeyHash) {
      throw new ConflictException({
        code: "OPERATOR_KEY_REQUIRED",
        message: "Créez d’abord une clé tablette pour cet opérateur.",
      });
    }
    if (!enabled && target.tabletAccessEnabled) {
      const activeMembership = await this.prisma.machineSessionOperator.findFirst({
        where: { operatorId: id, active: true },
        select: { id: true },
      });
      if (activeMembership) {
        throw new ConflictException({
          code: "OPERATOR_HAS_ACTIVE_MACHINE_SESSION",
          message: "Terminez d’abord la session machine de cet opérateur.",
        });
      }
    }
    return this.prisma.$transaction(
      async (transaction) => {
        const user = await transaction.user.update({
          where: { id },
          data: { tabletAccessEnabled: enabled },
          select: tabletUserSelect,
        });
        if (!enabled) {
          await transaction.tabletAuthSession.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        await transaction.historyEvent.create({
          data: {
            eventType: enabled ? "OPERATOR_TABLET_ACTIVATED" : "OPERATOR_TABLET_DEACTIVATED",
            entityType: "USER",
            entityId: id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
          },
        });
        return { user: this.auth.toManagedUser(user) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async resetConnectionKey(actor: AuthContext, id: string) {
    const target = await this.prisma.user.findFirst({
      where: { id, role: "OPERATOR" },
      select: { id: true, isActive: true },
    });
    if (!target)
      throw new NotFoundException({
        code: "OPERATOR_NOT_FOUND",
        message: "Utilisateur opérateur introuvable.",
      });
    if (!target.isActive) {
      throw new ConflictException({
        code: "OPERATOR_INACTIVE",
        message: "Réactivez d’abord le compte utilisateur.",
      });
    }
    const { connectionKey, connectionKeyId } = newConnectionKey();
    const connectionKeyHash = await argon2.hash(connectionKey, { type: argon2.argon2id });
    const user = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id },
        data: { connectionKeyId, connectionKeyHash, tabletAccessEnabled: true },
        select: tabletUserSelect,
      });
      await transaction.tabletAuthSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.historyEvent.create({
        data: {
          eventType: "OPERATOR_KEY_RESET",
          entityType: "USER",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
        },
      });
      return updated;
    });
    return { user: this.auth.toManagedUser(user), connectionKey };
  }
}
