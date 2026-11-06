import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { UserRole } from "@nim/types";
import { Roles, CurrentAuth } from "../auth/auth.decorators";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { AuthService } from "../auth/auth.service";

@Controller("users")
@UseGuards(AuthGuard, RolesGuard)
@Roles("ADMIN")
export class UsersController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Get()
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async list(
    @CurrentAuth() actor: AuthContext,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("role") role?: string,
    @Query("active") active?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortDirection") sortDirection?: string,
  ) {
    if ([page, pageSize, search, role, active, sortBy, sortDirection].every((value) => value === undefined)) {
      const users = await this.authService.listUsers(actor.user.role === "PRODUCTION_MANAGER" ? "OPERATOR" : undefined);
      return { users };
    }
    const roles: UserRole[] = ["ADMIN", "PRODUCTION_MANAGER", "OPERATOR", "QUALITY_CONTROLLER"];
    if (role && !roles.includes(role as UserRole)) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Le filtre de rôle est invalide." });
    }
    if (active !== undefined && active !== "true" && active !== "false") {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Le filtre d’activité est invalide." });
    }
    const allowedRole = actor.user.role === "PRODUCTION_MANAGER" ? "OPERATOR" : role as UserRole | undefined;
    return this.authService.listUsersPage({
      page: page === undefined ? 1 : Number(page),
      pageSize: pageSize === undefined ? 20 : Number(pageSize),
      search,
      role: allowedRole,
      active: active === undefined ? undefined : active === "true",
      sortBy,
      sortDirection,
    });
  }

  @Post()
  async create(@CurrentAuth() actor: AuthContext, @Body() body: unknown): Promise<{ user: Awaited<ReturnType<AuthService["createUser"]>> }> {
    return { user: await this.authService.createUser(actor, body) };
  }

  @Patch(":id")
  async update(@CurrentAuth() actor: AuthContext, @Param("id") id: string, @Body() body: unknown): Promise<{ user: Awaited<ReturnType<AuthService["updateUser"]>> }> {
    return { user: await this.authService.updateUser(actor, id, body) };
  }

  @Post(":id/disable")
  async disable(@CurrentAuth() actor: AuthContext, @Param("id") id: string): Promise<{ user: Awaited<ReturnType<AuthService["setUserActive"]>> }> {
    return { user: await this.authService.setUserActive(actor, id, false) };
  }

  @Post(":id/reactivate")
  async reactivate(@CurrentAuth() actor: AuthContext, @Param("id") id: string): Promise<{ user: Awaited<ReturnType<AuthService["setUserActive"]>> }> {
    return { user: await this.authService.setUserActive(actor, id, true) };
  }

  @Post(":id/reset-password")
  async resetPassword(@CurrentAuth() actor: AuthContext, @Param("id") id: string, @Body() body: unknown): Promise<{ success: true }> {
    await this.authService.resetUserPassword(actor, id, body);
    return { success: true };
  }
}
