import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { OperatorAuthGuard } from "./operator-auth.guard";
import { CurrentOperatorAuth } from "./operator-auth.decorators";
import { OperatorAuthService } from "./operator-auth.service";
import type { OperatorAuthContext } from "./operator-auth.types";

function requestIp(request: Request): string | undefined {
  return request.ip ?? request.socket.remoteAddress;
}

@Controller("production/auth")
export class OperatorTabletAuthController {
  constructor(@Inject(OperatorAuthService) private readonly auth: OperatorAuthService) {}

  @Post("login")
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body, {
      ipAddress: requestIp(request),
      userAgent: request.headers["user-agent"],
    });
    response.setHeader("Set-Cookie", this.auth.createSessionCookie(result.token, result.expiresAt));
    return { operator: result.operator, expiresAt: result.expiresAt.toISOString() };
  }

  @UseGuards(OperatorAuthGuard)
  @Get("me")
  me(@CurrentOperatorAuth() auth: OperatorAuthContext) {
    return { operator: auth.operator };
  }

  @UseGuards(OperatorAuthGuard)
  @Post("logout")
  async logout(
    @CurrentOperatorAuth() auth: OperatorAuthContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(auth, requestIp(request));
    response.setHeader("Set-Cookie", this.auth.clearSessionCookie());
    return { success: true as const };
  }
}
