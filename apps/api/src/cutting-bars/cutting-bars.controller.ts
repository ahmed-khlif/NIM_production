import { Body, Controller, Delete, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentAuth, Roles } from "../auth/auth.decorators";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { CuttingBarsService } from "./cutting-bars.service";

@Controller("offers/:offerId")
@UseGuards(AuthGuard)
export class CuttingBarsController {
  constructor(@Inject(CuttingBarsService) private readonly bars: CuttingBarsService) {}

  @Get("bars")
  async list(
    @Param("offerId") offerId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("profile") profile?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortDirection") sortDirection?: string,
  ) {
    return this.bars.listBars(offerId, {
      page: page === undefined ? 1 : Number(page),
      pageSize: pageSize === undefined ? 20 : Number(pageSize),
      search,
      status,
      profile,
      sortBy,
      sortDirection,
    });
  }

  @Get("bar-summary")
  async summary(@Param("offerId") offerId: string) {
    return this.bars.getBarSummary(offerId);
  }

  @Get("material-report")
  async materialReport(@Param("offerId") offerId: string) {
    return this.bars.getMaterialReport(offerId);
  }

  @Get("bars/:barId")
  async detail(@Param("offerId") offerId: string, @Param("barId") barId: string) {
    return { bar: await this.bars.getBar(offerId, barId) };
  }

  @Get("bar-assignments")
  async assignments(
    @Param("offerId") offerId: string,
    @Query("availablePage") availablePage?: string,
    @Query("assignmentPage") assignmentPage?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("machineId") machineId?: string,
  ) {
    return this.bars.listAssignments(offerId, {
      availablePage: availablePage === undefined ? 1 : Number(availablePage),
      assignmentPage: assignmentPage === undefined ? 1 : Number(assignmentPage),
      pageSize: pageSize === undefined ? 20 : Number(pageSize),
      search,
      machineId,
    });
  }

  @Post("bar-assignments")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async assign(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Body() body: unknown,
  ) {
    return this.bars.assignBars(actor, offerId, body);
  }

  @Post("bars/:barId/unassign")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async unassign(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Param("barId") barId: string,
  ) {
    return this.bars.unassignBar(actor, offerId, barId);
  }

  @Delete("bars/:barId")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async cancel(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Param("barId") barId: string,
  ) {
    return this.bars.cancelBar(actor, offerId, barId);
  }
}
