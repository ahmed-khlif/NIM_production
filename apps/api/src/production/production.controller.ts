import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentAuth, Roles } from "../auth/auth.decorators";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { ProductionService } from "./production.service";

@Controller("production")
@UseGuards(AuthGuard, RolesGuard)
@Roles("ADMIN", "PRODUCTION_MANAGER", "OPERATOR")
export class ProductionController {
  constructor(@Inject(ProductionService) private readonly productionService: ProductionService) {}

  @Get("current")
  current(@CurrentAuth() actor: AuthContext, @Query() query: unknown) {
    return this.productionService.getCurrent(actor, query);
  }

  @Post("start")
  start(@CurrentAuth() actor: AuthContext, @Body() body: unknown) {
    return this.productionService.start(actor, body).then((operation) => ({ operation }));
  }

  @Post(":operationId/unit-complete")
  completeUnit(@CurrentAuth() actor: AuthContext, @Param("operationId") operationId: string) {
    return this.productionService.complete(actor, operationId).then((operation) => ({ operation }));
  }

  @Post(":operationId/complete")
  complete(@CurrentAuth() actor: AuthContext, @Param("operationId") operationId: string) {
    return this.productionService.finish(actor, operationId).then((operation) => ({ operation }));
  }

  @Post("operators/:operatorId/machine-session/end")
  @Roles("ADMIN")
  endOperatorMachineSession(
    @CurrentAuth() actor: AuthContext,
    @Param("operatorId") operatorId: string,
  ) {
    return this.productionService.endMachineSessionByAdmin(actor, operatorId);
  }
}
