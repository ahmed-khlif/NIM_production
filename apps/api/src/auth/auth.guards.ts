import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@nim/types";
import { ROLES_KEY } from "./auth.decorators";
import { AuthService } from "./auth.service";
import type { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.authService.readSessionCookie(request.headers.cookie);
    const session = token ? await this.authService.validateSession(token) : null;
    if (!session) {
      throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "Une session valide est requise." });
    }
    request.auth = session;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth || !roles.includes(request.auth.user.role)) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Vous n'avez pas la permission d'effectuer cette action." });
    }
    return true;
  }
}
