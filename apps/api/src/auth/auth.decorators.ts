import { createParamDecorator, SetMetadata } from "@nestjs/common";
import type { UserRole } from "@nim/types";
import type { AuthContext, AuthenticatedRequest } from "./auth.types";

export const ROLES_KEY = "nim_roles";
export const Roles = (...roles: UserRole[]): ReturnType<typeof SetMetadata> => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_data: unknown, context) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.auth?.user;
});

export const CurrentAuth = createParamDecorator((_data: unknown, context): AuthContext | undefined => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.auth;
});
