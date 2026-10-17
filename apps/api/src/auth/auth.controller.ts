import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthGuard } from "./auth.guards";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./auth.decorators";
import type { AuthenticatedRequest } from "./auth.types";
import type { AuthenticatedUser } from "@nim/types";

function requestIp(request: Request): string | undefined {
  return request.ip ?? request.socket.remoteAddress;
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  async login(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<{ user: AuthenticatedUser }> {
    const result = await this.authService.login(body, { ipAddress: requestIp(request), userAgent: request.headers["user-agent"] });
    response.setHeader("Set-Cookie", this.authService.createSessionCookie(result.token, result.expiresAt));
    return { user: result.user };
  }

  @UseGuards(AuthGuard)
  @Post("logout")
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response): Promise<{ success: true }> {
    if (request.auth) await this.authService.logout(request.auth, { ipAddress: requestIp(request) });
    response.setHeader("Set-Cookie", this.authService.clearSessionCookie());
    return { success: true };
  }

  @UseGuards(AuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): { user: AuthenticatedUser } {
    return { user };
  }

  @UseGuards(AuthGuard)
  @Post("change-password")
  async changePassword(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<{ success: true }> {
    if (request.auth) await this.authService.changePassword(request.auth, body);
    return { success: true };
  }
}
