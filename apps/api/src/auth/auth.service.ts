import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma, User } from "@prisma/client";
import { changePasswordSchema, createUserSchema, loginSchema, resetUserPasswordSchema, updateUserSchema } from "@nim/validation";
import type { AuthenticatedUser, ManagedUser, UserRole } from "@nim/types";
import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { SESSION_COOKIE_NAME, type AuthContext } from "./auth.types";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 8;
const RATE_LIMIT_WINDOW_MS = 1000 * 60 * 15;
const MAX_LOGIN_ATTEMPTS = 5;

type LoginAttempt = { count: number; startedAt: number };
type SessionWithUser = Prisma.SessionGetPayload<{ include: { user: true } }>;

@Injectable()
export class AuthService {
  private readonly loginAttempts = new Map<string, LoginAttempt>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ConfigService) private readonly config: ConfigService) {}

  toPublicUser(user: Pick<User, "id" | "username" | "displayName" | "role">): AuthenticatedUser {
    return { id: user.id, username: user.username, displayName: user.displayName, role: user.role as UserRole };
  }

  toManagedUser(user: Pick<User, "id" | "username" | "displayName" | "role" | "isActive" | "tabletAccessEnabled" | "connectionKeyHash" | "createdAt" | "lastLoginAt">): ManagedUser {
    return { ...this.toPublicUser(user), isActive: user.isActive, tabletAccessEnabled: user.tabletAccessEnabled, hasConnectionKey: Boolean(user.connectionKeyHash), createdAt: user.createdAt.toISOString(), lastLoginAt: user.lastLoginAt?.toISOString() ?? null };
  }

  readSessionCookie(header: string | undefined): string | null {
    if (!header) return null;
    const value = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (!value) return null;
    try {
      return decodeURIComponent(value.slice(SESSION_COOKIE_NAME.length + 1));
    } catch {
      return null;
    }
  }

  hashSessionToken(token: string): string {
    return createHash("sha256").update(`${this.config.getOrThrow<string>("AUTH_SECRET")}:${token}`).digest("hex");
  }

  createSessionCookie(token: string, expiresAt: Date): string {
    const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    const secure = this.config.get<string>("NODE_ENV") === "production" ? "; Secure" : "";
    return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
  }

  clearSessionCookie(): string {
    const secure = this.config.get<string>("NODE_ENV") === "production" ? "; Secure" : "";
    return `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`;
  }

  async validateSession(token: string): Promise<AuthContext | null> {
    const tokenHash = this.hashSessionToken(token);
    const session = await this.prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!session) return null;
    if (session.expiresAt <= new Date() || !session.user.isActive) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    return { user: this.toPublicUser(session.user), sessionId: session.id, tokenHash };
  }

  async login(input: unknown, metadata: { ipAddress?: string; userAgent?: string }): Promise<{ token: string; expiresAt: Date; user: AuthenticatedUser }> {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Vérifiez les informations saisies.", details: parsed.error.flatten() });

    const username = parsed.data.username.toLowerCase();
    const rateKey = `${metadata.ipAddress ?? "unknown"}:${username}`;
    this.assertLoginAllowed(rateKey);
    const user = await this.prisma.user.findUnique({ where: { username } });
    const valid = user?.isActive === true && (await argon2.verify(user.passwordHash, parsed.data.password).catch(() => false));
    if (!valid || !user) {
      this.registerLoginFailure(rateKey);
      await this.prisma.historyEvent.create({ data: { eventType: "AUTH_LOGIN_FAILED", entityType: "AUTH", entityId: username, metadata: { ipAddress: metadata.ipAddress } } });
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Identifiant ou mot de passe incorrect." });
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const publicUser = this.toPublicUser(user);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.session.create({ data: { tokenHash: this.hashSessionToken(token), userId: user.id, expiresAt, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent } });
      await transaction.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await transaction.historyEvent.create({ data: { eventType: "AUTH_LOGIN", entityType: "USER", entityId: user.id, actorUserId: user.id, actorRole: user.role, metadata: { ipAddress: metadata.ipAddress, userAgent: metadata.userAgent } } });
    });
    this.loginAttempts.delete(rateKey);
    return { token, expiresAt, user: publicUser };
  }

  async logout(auth: AuthContext, metadata: { ipAddress?: string }): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.historyEvent.create({ data: { eventType: "AUTH_LOGOUT", entityType: "USER", entityId: auth.user.id, actorUserId: auth.user.id, actorRole: auth.user.role, metadata: { ipAddress: metadata.ipAddress } } });
      await transaction.session.deleteMany({ where: { id: auth.sessionId } });
    });
  }

  async changePassword(auth: AuthContext, input: unknown): Promise<void> {
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Vérifiez les informations saisies.", details: parsed.error.flatten() });
    const user = await this.prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user || !(await argon2.verify(user.passwordHash, parsed.data.currentPassword).catch(() => false))) throw new UnauthorizedException({ code: "INVALID_PASSWORD", message: "Le mot de passe actuel est incorrect." });
    const passwordHash = await argon2.hash(parsed.data.newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: user.id }, data: { passwordHash } });
      await transaction.session.deleteMany({ where: { userId: user.id, id: { not: auth.sessionId } } });
      await transaction.historyEvent.create({ data: { eventType: "AUTH_PASSWORD_CHANGED", entityType: "USER", entityId: user.id, actorUserId: user.id, actorRole: user.role } });
    });
  }

  async listUsers(role?: UserRole): Promise<ManagedUser[]> {
    const users = await this.prisma.user.findMany({ where: role ? { role } : undefined, orderBy: [{ isActive: "desc" }, { displayName: "asc" }], select: { id: true, username: true, displayName: true, role: true, isActive: true, tabletAccessEnabled: true, connectionKeyHash: true, createdAt: true, lastLoginAt: true } });
    return users.map((user) => this.toManagedUser(user));
  }

  async listUsersPage(options: { role?: UserRole; page?: number; pageSize?: number; search?: string; active?: boolean } = {}) {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || ![10, 20, 50].includes(pageSize)) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "La pagination des utilisateurs est invalide." });
    }
    const search = options.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(options.role ? { role: options.role } : {}),
      ...(options.active === undefined ? {} : { isActive: options.active }),
      ...(search ? { OR: [
        { displayName: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
      ] } : {}),
    };
    const [users, total, activeCount, adminCount, tabletAccessCount] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { displayName: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, username: true, displayName: true, role: true, isActive: true, tabletAccessEnabled: true, connectionKeyHash: true, createdAt: true, lastLoginAt: true },
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: { ...(options.role ? { role: options.role } : {}), isActive: true } }),
      this.prisma.user.count({ where: { role: "ADMIN", isActive: true } }),
      this.prisma.user.count({ where: { role: "OPERATOR", tabletAccessEnabled: true, ...(options.role ? { role: options.role } : {}) } }),
    ]);
    return {
      users: users.map((user) => this.toManagedUser(user)),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      summary: { activeCount, adminCount, tabletAccessCount },
    };
  }

  async createUser(actor: AuthContext, input: unknown): Promise<ManagedUser> {
    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Vérifiez les informations du nouvel utilisateur.", details: parsed.error.flatten() });
    const username = parsed.data.username.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { username }, select: { id: true } })) throw new ConflictException({ code: "USERNAME_TAKEN", message: "Cet identifiant est déjà utilisé." });
    const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({ data: { username, displayName: parsed.data.displayName, role: parsed.data.role, passwordHash }, select: { id: true, username: true, displayName: true, role: true, isActive: true, tabletAccessEnabled: true, connectionKeyHash: true, createdAt: true, lastLoginAt: true } });
      await transaction.historyEvent.create({ data: { eventType: "USER_CREATED", entityType: "USER", entityId: user.id, actorUserId: actor.user.id, actorRole: actor.user.role, metadata: { role: user.role } } });
      return this.toManagedUser(user);
    });
  }

  async updateUser(actor: AuthContext, id: string, input: unknown): Promise<ManagedUser> {
    const parsed = updateUserSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Vérifiez les informations de l’utilisateur.", details: parsed.error.flatten() });
    const target = await this.prisma.user.findUnique({ where: { id } });
    const removingOperatorRole = target?.role === "OPERATOR" && parsed.data.role !== "OPERATOR";
    if (removingOperatorRole && await this.prisma.machineSessionOperator.findFirst({ where: { operatorId: id, active: true }, select: { id: true } })) throw new ConflictException({ code: "OPERATOR_HAS_ACTIVE_MACHINE_SESSION", message: "Terminez d’abord la session machine avant de modifier son rôle." });
    if (!target) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Utilisateur introuvable." });
    if (target.id === actor.user.id && parsed.data.role !== "ADMIN") throw new ConflictException({ code: "CANNOT_REMOVE_OWN_ADMIN", message: "Vous ne pouvez pas retirer votre propre accès administrateur." });
    return this.prisma.$transaction(async (transaction) => {
      if (target.isActive && target.role === "ADMIN" && parsed.data.role !== "ADMIN" && await transaction.user.count({ where: { role: "ADMIN", isActive: true } }) <= 1) throw new ConflictException({ code: "LAST_ADMIN", message: "Le dernier administrateur actif doit être conservé." });
      const user = await transaction.user.update({ where: { id }, data: { displayName: parsed.data.displayName, role: parsed.data.role, ...(removingOperatorRole ? { tabletAccessEnabled: false } : {}) }, select: { id: true, username: true, displayName: true, role: true, isActive: true, tabletAccessEnabled: true, connectionKeyHash: true, createdAt: true, lastLoginAt: true } });
      if (removingOperatorRole) await transaction.tabletAuthSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await transaction.historyEvent.create({ data: { eventType: "USER_UPDATED", entityType: "USER", entityId: id, actorUserId: actor.user.id, actorRole: actor.user.role, metadata: { role: user.role } } });
      return this.toManagedUser(user);
    });
  }

  async setUserActive(actor: AuthContext, id: string, active: boolean): Promise<ManagedUser> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Utilisateur introuvable." });
    if (!active && target.role === "OPERATOR" && await this.prisma.machineSessionOperator.findFirst({ where: { operatorId: id, active: true }, select: { id: true } })) throw new ConflictException({ code: "OPERATOR_HAS_ACTIVE_MACHINE_SESSION", message: "Terminez d’abord la session machine avant de désactiver cet utilisateur." });
    if (target.id === actor.user.id && !active) throw new ConflictException({ code: "CANNOT_DISABLE_SELF", message: "Vous ne pouvez pas désactiver votre propre compte." });
    return this.prisma.$transaction(async (transaction) => {
      if (!active && target.isActive && target.role === "ADMIN" && await transaction.user.count({ where: { role: "ADMIN", isActive: true } }) <= 1) throw new ConflictException({ code: "LAST_ADMIN", message: "Le dernier administrateur actif doit être conservé." });
      const user = await transaction.user.update({ where: { id }, data: { isActive: active, disabledAt: active ? null : new Date(), ...(!active && target.role === "OPERATOR" ? { tabletAccessEnabled: false } : {}) }, select: { id: true, username: true, displayName: true, role: true, isActive: true, tabletAccessEnabled: true, connectionKeyHash: true, createdAt: true, lastLoginAt: true } });
      if (!active) {
        await transaction.session.deleteMany({ where: { userId: id } });
        await transaction.tabletAuthSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await transaction.historyEvent.create({ data: { eventType: active ? "USER_REACTIVATED" : "USER_DISABLED", entityType: "USER", entityId: id, actorUserId: actor.user.id, actorRole: actor.user.role } });
      return this.toManagedUser(user);
    });
  }

  async resetUserPassword(actor: AuthContext, id: string, input: unknown): Promise<void> {
    const parsed = resetUserPasswordSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Vérifiez le nouveau mot de passe.", details: parsed.error.flatten() });
    const target = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!target) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Utilisateur introuvable." });
    const passwordHash = await argon2.hash(parsed.data.newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id }, data: { passwordHash } });
      await transaction.session.deleteMany({ where: { userId: id } });
      await transaction.historyEvent.create({ data: { eventType: "USER_PASSWORD_RESET", entityType: "USER", entityId: id, actorUserId: actor.user.id, actorRole: actor.user.role } });
    });
  }

  private assertLoginAllowed(key: string): void {
    const attempt = this.loginAttempts.get(key);
    if (attempt && Date.now() - attempt.startedAt < RATE_LIMIT_WINDOW_MS && attempt.count >= MAX_LOGIN_ATTEMPTS) throw new HttpException({ code: "LOGIN_RATE_LIMITED", message: "Trop de tentatives. Réessayez dans quelques minutes." }, HttpStatus.TOO_MANY_REQUESTS);
    if (attempt && Date.now() - attempt.startedAt >= RATE_LIMIT_WINDOW_MS) this.loginAttempts.delete(key);
  }

  private registerLoginFailure(key: string): void {
    const attempt = this.loginAttempts.get(key);
    if (!attempt || Date.now() - attempt.startedAt >= RATE_LIMIT_WINDOW_MS) this.loginAttempts.set(key, { count: 1, startedAt: Date.now() });
    else attempt.count += 1;
  }
}

export type { SessionWithUser };
