import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { operatorLoginSchema } from "@nim/validation";
import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { OPERATOR_SESSION_COOKIE_NAME } from "./operator-auth.types";
import type { OperatorAuthContext, OperatorIdentity } from "./operator-auth.types";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 8;
const RATE_LIMIT_WINDOW_MS = 1000 * 60 * 15;
const MAX_LOGIN_ATTEMPTS = 8;

type LoginAttempt = { count: number; startedAt: number };

@Injectable()
export class OperatorAuthService {
  private readonly loginAttempts = new Map<string, LoginAttempt>();
  private readonly dummyKeyHash = argon2.hash(randomBytes(32).toString("hex"), {
    type: argon2.argon2id,
  });

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  private tokenHash(token: string): string {
    return createHash("sha256")
      .update(`${this.config.getOrThrow<string>("AUTH_SECRET")}:${token}`)
      .digest("hex");
  }

  readSessionCookie(header: string | undefined): string | null {
    const value = header
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${OPERATOR_SESSION_COOKIE_NAME}=`));
    if (!value) return null;
    try {
      return decodeURIComponent(value.slice(OPERATOR_SESSION_COOKIE_NAME.length + 1));
    } catch {
      return null;
    }
  }

  createSessionCookie(token: string, expiresAt: Date): string {
    const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    const secure = this.config.get<string>("NODE_ENV") === "production" ? "; Secure" : "";
    return `${OPERATOR_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
  }

  clearSessionCookie(): string {
    const secure = this.config.get<string>("NODE_ENV") === "production" ? "; Secure" : "";
    return `${OPERATOR_SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`;
  }

  async validateSession(token: string): Promise<OperatorAuthContext | null> {
    const tokenHash = this.tokenHash(token);
    const session = await this.prisma.tabletAuthSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.isActive ||
      session.user.role !== "OPERATOR" ||
      !session.user.tabletAccessEnabled
    ) {
      return null;
    }
    return {
      operator: {
        id: session.user.id,
        displayName: session.user.displayName,
      },
      sessionId: session.id,
      tokenHash,
    };
  }

  async login(
    input: unknown,
    metadata: { ipAddress?: string; userAgent?: string },
  ): Promise<{ token: string; expiresAt: Date; operator: OperatorIdentity }> {
    const parsed = operatorLoginSchema.safeParse(input);
    const suppliedKey = parsed.success ? parsed.data.connectionKey : "";
    const keyId = suppliedKey.match(/^NIM-([0-9A-F]{12})-/i)?.[1]?.toUpperCase();
    const rateKey = metadata.ipAddress ?? "unknown";
    this.assertLoginAllowed(rateKey);

    const user = keyId
      ? await this.prisma.user.findUnique({ where: { connectionKeyId: keyId } })
      : null;
    const hash = user?.connectionKeyHash ?? (await this.dummyKeyHash);
    const keyMatches = await argon2
      .verify(hash, suppliedKey || "invalid-connection-key")
      .catch(() => false);
    if (
      !parsed.success ||
      !user?.isActive ||
      user.role !== "OPERATOR" ||
      !user.tabletAccessEnabled ||
      !keyMatches
    ) {
      this.registerLoginFailure(rateKey);
      await this.prisma.historyEvent.create({
        data: {
          eventType: "OPERATOR_LOGIN_FAILED",
          entityType: "OPERATOR_AUTH",
          entityId: "invalid",
          metadata: { ipAddress: metadata.ipAddress },
        },
      });
      throw new UnauthorizedException({
        code: "INVALID_OPERATOR_KEY",
        message: "Clé de connexion invalide.",
      });
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const identity: OperatorIdentity = {
      id: user.id,
      displayName: user.displayName,
    };
    await this.prisma.$transaction(async (transaction) => {
      await transaction.tabletAuthSession.create({
        data: { tokenHash: this.tokenHash(token), userId: user.id, expiresAt },
      });
      await transaction.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      await transaction.historyEvent.create({
        data: {
          eventType: "OPERATOR_LOGIN",
          entityType: "USER",
          entityId: user.id,
          actorUserId: user.id,
          actorRole: "OPERATOR",
          metadata: { ipAddress: metadata.ipAddress, userAgent: metadata.userAgent },
        },
      });
    });
    this.loginAttempts.delete(rateKey);
    return { token, expiresAt, operator: identity };
  }

  async logout(auth: OperatorAuthContext, ipAddress?: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.tabletAuthSession.updateMany({
        where: { id: auth.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.historyEvent.create({
        data: {
          eventType: "OPERATOR_LOGOUT",
          entityType: "USER",
          entityId: auth.operator.id,
          actorUserId: auth.operator.id,
          actorRole: "OPERATOR",
          metadata: { ipAddress },
        },
      });
    });
  }

  private assertLoginAllowed(key: string): void {
    const attempt = this.loginAttempts.get(key);
    if (
      attempt &&
      Date.now() - attempt.startedAt < RATE_LIMIT_WINDOW_MS &&
      attempt.count >= MAX_LOGIN_ATTEMPTS
    ) {
      throw new HttpException(
        {
          code: "LOGIN_RATE_LIMITED",
          message: "Trop de tentatives. Réessayez dans quelques minutes.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (attempt && Date.now() - attempt.startedAt >= RATE_LIMIT_WINDOW_MS)
      this.loginAttempts.delete(key);
  }

  private registerLoginFailure(key: string): void {
    const attempt = this.loginAttempts.get(key);
    if (!attempt || Date.now() - attempt.startedAt >= RATE_LIMIT_WINDOW_MS) {
      this.loginAttempts.set(key, { count: 1, startedAt: Date.now() });
    } else {
      attempt.count += 1;
    }
  }
}
