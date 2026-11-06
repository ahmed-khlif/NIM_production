import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { OperatorAuthGuard } from "../operators/operator-auth.guard";
import { CurrentOperatorAuth } from "../operators/operator-auth.decorators";
import type { OperatorAuthContext } from "../operators/operator-auth.types";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import { CurrentAuth, Roles } from "../auth/auth.decorators";
import type { AuthContext } from "../auth/auth.types";
import { TabletProductionService } from "./tablet-production.service";
import { NotificationsService } from "../notifications/notifications.service";

@Controller("production")
@UseGuards(OperatorAuthGuard)
export class TabletProductionController {
  constructor(
    @Inject(TabletProductionService) private readonly production: TabletProductionService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  @Get("notifications")
  listOperatorNotifications(@CurrentOperatorAuth() auth: OperatorAuthContext) {
    return this.notifications.listForRecipient(auth.operator.id, { page: 1, pageSize: 10 });
  }

  @Post("notifications/:id/read")
  markOperatorNotificationRead(
    @CurrentOperatorAuth() auth: OperatorAuthContext,
    @Param("id") id: string,
  ) {
    return this.notifications.markReadForRecipient(auth.operator.id, id);
  }

  @Post("presence/heartbeat")
  heartbeat(@CurrentOperatorAuth() auth: OperatorAuthContext) {
    return {
      success: true as const,
      operatorId: auth.operator.id,
      serverTime: new Date().toISOString(),
    };
  }

  @Get("machines")
  listMachines() {
    return this.production.listActiveMachines();
  }

  @Get("operators/available")
  listAvailableOperators(@CurrentOperatorAuth() auth: OperatorAuthContext) {
    return this.production.listAvailableOperators(auth);
  }

  @Post("sessions")
  startSession(@CurrentOperatorAuth() auth: OperatorAuthContext, @Body() body: unknown) {
    return this.production.startMachineSession(auth, body);
  }

  @Get("sessions/current")
  currentSession(
    @CurrentOperatorAuth() auth: OperatorAuthContext,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("offerId") offerId?: string,
  ) {
    return this.production.getCurrentSession(auth, {
      page: page === undefined ? 1 : Number(page),
      pageSize: pageSize === undefined ? 20 : Number(pageSize),
      search,
      offerId,
    });
  }

  @Post("sessions/:sessionId/end")
  endSession(
    @CurrentOperatorAuth() auth: OperatorAuthContext,
    @Param("sessionId") sessionId: string,
  ) {
    return this.production.endMachineSession(auth, sessionId);
  }

  @Patch("sessions/:sessionId/team")
  updateSessionTeam(
    @CurrentOperatorAuth() auth: OperatorAuthContext,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.production.updateMachineSessionTeam(auth, sessionId, body);
  }

  @Get("bars/:barId")
  getBar(@CurrentOperatorAuth() auth: OperatorAuthContext, @Param("barId") barId: string) {
    return this.production.getAssignedBar(auth, barId);
  }

  @Post("bars/:barId/start")
  startBar(@CurrentOperatorAuth() auth: OperatorAuthContext, @Param("barId") barId: string) {
    return this.production.startBar(auth, barId);
  }

  @Get("runs/:runId")
  getRun(@CurrentOperatorAuth() auth: OperatorAuthContext, @Param("runId") runId: string) {
    return this.production.getRun(auth, runId);
  }

  @Post("runs/:runId/finish")
  finishRun(@CurrentOperatorAuth() auth: OperatorAuthContext, @Param("runId") runId: string) {
    return this.production.finishRun(auth, runId);
  }

  @Post("runs/:runId/cancel")
  cancelRun(@CurrentOperatorAuth() auth: OperatorAuthContext, @Param("runId") runId: string) {
    return this.production.cancelRun(auth, runId);
  }

  @Post("runs/:runId/non-conformities")
  reportNonConformity(
    @CurrentOperatorAuth() auth: OperatorAuthContext,
    @Param("runId") runId: string,
    @Body() body: unknown,
  ) {
    return this.production.reportNonConformity(auth, runId, body);
  }
}

@Controller("production")
@UseGuards(AuthGuard, RolesGuard)
@Roles("ADMIN", "PRODUCTION_MANAGER")
export class ProductionMonitorController {
  constructor(
    @Inject(TabletProductionService) private readonly production: TabletProductionService,
  ) {}

  @Get("monitor")
  getMonitor(
    @CurrentAuth() auth: AuthContext,
    @Query()
    query: {
      offerId?: string;
      machineId?: string;
      status?: string;
      page?: string;
      pageSize?: string;
      search?: string;
      sortBy?: string;
      sortDirection?: string;
    },
  ) {
    if (auth.user.role === "PRODUCTION_MANAGER" && !query.offerId) {
      throw new ForbiddenException({
        code: "OFFER_SCOPE_REQUIRED",
        message: "Ouvrez le suivi depuis une Affaire en production.",
      });
    }
    return this.production.getProductionMonitor(
      query,
      auth.user.role as "ADMIN" | "PRODUCTION_MANAGER",
    );
  }

  @Get("non-conformities")
  @Roles("ADMIN", "PRODUCTION_MANAGER", "QUALITY_CONTROLLER")
  getOpenNonConformities(@Query() query: unknown) {
    return this.production.listOpenNonConformities(query);
  }
}
