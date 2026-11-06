import { BadRequestException, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentAuth } from "../auth/auth.decorators";
import { AuthGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentAuth() actor: AuthContext, @Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("search") search?: string, @Query("eventType") eventType?: string, @Query("unreadOnly") unreadOnly?: string, @Query("includeEventTypes") includeEventTypes?: string): ReturnType<NotificationsService["list"]> {
    if (unreadOnly !== undefined && unreadOnly !== "true" && unreadOnly !== "false") {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Le filtre lu/non lu est invalide." });
    }
    if (includeEventTypes !== undefined && includeEventTypes !== "true" && includeEventTypes !== "false") {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Le filtre de catégories est invalide." });
    }
    return this.notificationsService.list(actor, { page: page === undefined ? 1 : Number(page), pageSize: pageSize === undefined ? 20 : Number(pageSize), search, eventType, unreadOnly: unreadOnly === "true", includeEventTypes: includeEventTypes === "true" });
  }

  @Patch(":id/read")
  markRead(@CurrentAuth() actor: AuthContext, @Param("id") id: string): ReturnType<NotificationsService["markRead"]> {
    return this.notificationsService.markRead(actor, id);
  }

  @Post("read-all")
  markAllRead(@CurrentAuth() actor: AuthContext): ReturnType<NotificationsService["markAllRead"]> {
    return this.notificationsService.markAllRead(actor);
  }
}
