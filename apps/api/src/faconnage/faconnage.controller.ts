import { Body, Controller, Delete, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentAuth, Roles } from "../auth/auth.decorators";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { FaconnageService } from "./faconnage.service";

@Controller("offers/:offerId/faconnage")
@UseGuards(AuthGuard, RolesGuard)
@Roles("ADMIN", "PRODUCTION_MANAGER")
export class FaconnageController {
  constructor(@Inject(FaconnageService) private readonly faconnageService: FaconnageService) {}

  @Get("plans")
  async plans(
    @Param("offerId") offerId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.faconnageService.listPlans(offerId, page === undefined ? 1 : Number(page), pageSize === undefined ? 10 : Number(pageSize));
  }

  @Get("plans/:planId")
  async plan(
    @Param("offerId") offerId: string,
    @Param("planId") planId: string,
  ) {
    return { optimization: await this.faconnageService.getPlan(offerId, planId) };
  }

  @Post("optimize")
  async optimize(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Body() body: unknown,
  ): Promise<{ optimization: Awaited<ReturnType<FaconnageService["optimize"]>> }> {
    return { optimization: await this.faconnageService.optimize(actor, offerId, body) };
  }

  @Post("plans/:planId/validate")
  async validate(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Param("planId") planId: string,
    @Body() body: unknown,
  ) {
    return { plan: await this.faconnageService.validatePlanBars(actor, offerId, planId, body) };
  }

  @Post("plans/:planId/cancel")
  async cancel(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Param("planId") planId: string,
  ) {
    return { plan: await this.faconnageService.cancelPlan(actor, offerId, planId) };
  }

  @Delete("plans/:planId")
  async delete(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Param("planId") planId: string,
  ) {
    return { plan: await this.faconnageService.deleteDraftPlan(actor, offerId, planId) };
  }
}
