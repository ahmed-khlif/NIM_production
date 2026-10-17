import { Body, Controller, Get, Inject, Patch, UseGuards } from "@nestjs/common";
import { CurrentAuth } from "../auth/auth.decorators";
import { AuthGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { SettingsService } from "./settings.service";

@Controller("settings")
@UseGuards(AuthGuard)
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settingsService: SettingsService) {}

  @Get()
  async get(@CurrentAuth() actor: AuthContext): Promise<{ settings: Awaited<ReturnType<SettingsService["get"]>> }> {
    return { settings: await this.settingsService.get(actor) };
  }

  @Patch()
  async update(@CurrentAuth() actor: AuthContext, @Body() body: unknown): Promise<{ settings: Awaited<ReturnType<SettingsService["update"]>> }> {
    return { settings: await this.settingsService.update(actor, body) };
  }
}
