import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { OperatorAuthGuard } from "../operators/operator-auth.guard";
import { CurrentOperatorAuth } from "../operators/operator-auth.decorators";
import type { OperatorAuthContext } from "../operators/operator-auth.types";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import { Roles } from "../auth/auth.decorators";
import { TabletProductionService } from "./tablet-production.service";

@Controller("production")
@UseGuards(OperatorAuthGuard)
export class TabletProductionController {
  constructor(
    @Inject(TabletProductionService) private readonly production: TabletProductionService,
  ) {}

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
  currentSession(@CurrentOperatorAuth() auth: OperatorAuthContext) {
    return this.production.getCurrentSession(auth);
  }

  @Post("sessions/:sessionId/end")
  endSession(
    @CurrentOperatorAuth() auth: OperatorAuthContext,
    @Param("sessionId") sessionId: string,
  ) {
    return this.production.endMachineSession(auth, sessionId);
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
  getMonitor(@Query() query: unknown) {
    return this.production.getProductionMonitor(query);
  }

  @Get("non-conformities")
  @Roles("ADMIN", "PRODUCTION_MANAGER", "QUALITY_CONTROLLER")
  getOpenNonConformities(@Query() query: unknown) {
    return this.production.listOpenNonConformities(query);
  }
}
