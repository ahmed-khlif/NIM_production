import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { OperatorAuthenticatedRequest } from "./operator-auth.types";
import { OperatorAuthService } from "./operator-auth.service";

@Injectable()
export class OperatorAuthGuard implements CanActivate {
  constructor(@Inject(OperatorAuthService) private readonly auth: OperatorAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OperatorAuthenticatedRequest>();
    const token = this.auth.readSessionCookie(request.headers.cookie);
    const session = token ? await this.auth.validateSession(token) : null;
    if (!session) {
      throw new UnauthorizedException({
        code: "OPERATOR_SESSION_REQUIRED",
        message: "Connectez-vous avec votre identifiant et votre mot de passe opérateur.",
      });
    }
    request.operatorAuth = session;
    return true;
  }
}
