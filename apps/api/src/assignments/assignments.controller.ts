import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentAuth, Roles } from "../auth/auth.decorators";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { AssignmentsService } from "./assignments.service";

@Controller("assignments")
@UseGuards(AuthGuard)
export class AssignmentsController {
  constructor(
    @Inject(AssignmentsService) private readonly assignmentsService: AssignmentsService,
  ) {}

  @Get()
  async list(
    @Query("offerId") offerId?: string,
  ): Promise<Awaited<ReturnType<AssignmentsService["listAssignments"]>>> {
    return this.assignmentsService.listAssignments(offerId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async assign(
    @CurrentAuth() actor: AuthContext,
    @Body() body: unknown,
  ): Promise<{ assignment: Awaited<ReturnType<AssignmentsService["assign"]>> }> {
    return { assignment: await this.assignmentsService.assign(actor, body) };
  }

  @Post(":id/reassign")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async reassign(
    @CurrentAuth() actor: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ assignment: Awaited<ReturnType<AssignmentsService["reassign"]>> }> {
    return { assignment: await this.assignmentsService.reassign(actor, id, body) };
  }

  @Post(":id/unassign")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async unassign(
    @CurrentAuth() actor: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ assignment: Awaited<ReturnType<AssignmentsService["unassign"]>> }> {
    return { assignment: await this.assignmentsService.unassign(actor, id, body) };
  }
}
