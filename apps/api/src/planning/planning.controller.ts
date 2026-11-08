import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentAuth, Roles } from "../auth/auth.decorators";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { PlanningService } from "./planning.service";

@Controller("planning")
@UseGuards(AuthGuard, RolesGuard)
@Roles("ADMIN", "PRODUCTION_MANAGER")
export class PlanningController {
  constructor(@Inject(PlanningService) private readonly planning: PlanningService) {}

  @Get("board")
  board(
    @Query("startAt") startAt: string,
    @Query("endAt") endAt: string,
    @Query("offerId") offerId?: string,
    @Query("machineId") machineId?: string,
    @Query("operatorId") operatorId?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("unscheduledPage") unscheduledPage?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.planning.getBoard({ startAt, endAt, offerId, machineId, operatorId, status, search, unscheduledPage, pageSize });
  }

  @Get("first-event-date")
  firstEventDate(@Query("offerId") offerId?: string, @Query("machineId") machineId?: string) {
    return this.planning.getFirstEventDate({ offerId, machineId });
  }

  @Get("events/:eventId")
  event(@Param("eventId") eventId: string) {
    return this.planning.getEvent(eventId);
  }

  @Get("offers/:offerId/day")
  offerDay(@Param("offerId") offerId: string, @Query("date") date: string) {
    return this.planning.getOfferDay(offerId, { date });
  }

  @Post("events")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  create(@CurrentAuth() actor: AuthContext, @Body() body: unknown) {
    return this.planning.createEvent(actor, body);
  }

  @Post("batches/preview")
  previewBatch(@Body() body: unknown) {
    return this.planning.previewBatch(body);
  }

  @Post("batches")
  createBatch(@CurrentAuth() actor: AuthContext, @Body() body: unknown) {
    return this.planning.createBatch(actor, body);
  }

  @Patch("events/:eventId")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  update(@CurrentAuth() actor: AuthContext, @Param("eventId") eventId: string, @Body() body: unknown) {
    return this.planning.updateEvent(actor, eventId, body);
  }

  @Post("events/:eventId/cancel")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  cancel(@CurrentAuth() actor: AuthContext, @Param("eventId") eventId: string) {
    return this.planning.cancelEvent(actor, eventId);
  }
}
