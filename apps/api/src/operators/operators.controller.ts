import { Controller, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import { CurrentAuth, Roles } from "../auth/auth.decorators";
import type { AuthContext } from "../auth/auth.types";
import { OperatorsService } from "./operators.service";

@Controller("operators")
@UseGuards(AuthGuard, RolesGuard)
@Roles("ADMIN", "PRODUCTION_MANAGER")
export class OperatorsController {
  constructor(@Inject(OperatorsService) private readonly operators: OperatorsService) {}

  @Post(":id/activate")
  async activate(@CurrentAuth() actor: AuthContext, @Param("id") id: string) {
    return this.operators.setTabletAccess(actor, id, true);
  }

  @Post(":id/deactivate")
  async deactivate(@CurrentAuth() actor: AuthContext, @Param("id") id: string) {
    return this.operators.setTabletAccess(actor, id, false);
  }

}
