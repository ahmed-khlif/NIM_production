import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { CurrentAuth } from "../auth/auth.decorators";
import { AuthGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentAuth() actor: AuthContext): ReturnType<NotificationsService["list"]> {
    return this.notificationsService.list(actor);
  }
}
