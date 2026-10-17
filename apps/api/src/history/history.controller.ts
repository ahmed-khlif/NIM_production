import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { CurrentAuth, Roles } from "../auth/auth.decorators";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { HistoryService } from "./history.service";

@Controller("history")
@UseGuards(AuthGuard, RolesGuard)
@Roles("ADMIN", "PRODUCTION_MANAGER")
export class HistoryController {
  constructor(@Inject(HistoryService) private readonly historyService: HistoryService) {}

  @Get()
  async list(
    @CurrentAuth() actor: AuthContext,
    @Query() query: Record<string, unknown>,
  ): Promise<Awaited<ReturnType<HistoryService["list"]>>> {
    return this.historyService.list(actor, query);
  }


  @Get("offers/:offerId")
  async offer(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<Awaited<ReturnType<HistoryService["list"]>>> {
    return this.historyService.list(actor, query, { metadataKey: "offerId", id: offerId });
  }

  @Get("pieces/:pieceId")
  async piece(
    @CurrentAuth() actor: AuthContext,
    @Param("pieceId") pieceId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<Awaited<ReturnType<HistoryService["list"]>>> {
    return this.historyService.list(actor, query, { metadataKey: "pieceId", id: pieceId });
  }

  @Get("machines/:machineId")
  async machine(
    @CurrentAuth() actor: AuthContext,
    @Param("machineId") machineId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<Awaited<ReturnType<HistoryService["list"]>>> {
    return this.historyService.list(actor, query, { metadataKey: "machineId", id: machineId });
  }

  @Get("operators/:operatorId")
  async operator(
    @CurrentAuth() actor: AuthContext,
    @Param("operatorId") operatorId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<Awaited<ReturnType<HistoryService["list"]>>> {
    return this.historyService.list(actor, query, { actorUserId: operatorId });
  }
}
