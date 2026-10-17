import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { CurrentAuth, Roles } from "../auth/auth.decorators";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
@UseGuards(AuthGuard, RolesGuard)
@Roles("ADMIN", "PRODUCTION_MANAGER")
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboardService: DashboardService) {}

  @Get("overview")
  overview(@CurrentAuth() actor: AuthContext, @Query() query: Record<string, unknown>) {
    return this.dashboardService.overview(actor, query);
  }
}
