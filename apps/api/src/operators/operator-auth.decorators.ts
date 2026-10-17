import { createParamDecorator } from "@nestjs/common";
import type { OperatorAuthContext, OperatorAuthenticatedRequest } from "./operator-auth.types";

export const CurrentOperatorAuth = createParamDecorator(
  (_data: unknown, context): OperatorAuthContext | undefined => {
    const request = context.switchToHttp().getRequest<OperatorAuthenticatedRequest>();
    return request.operatorAuth;
  },
);

export const CurrentOperator = createParamDecorator((_data: unknown, context) => {
  const request = context.switchToHttp().getRequest<OperatorAuthenticatedRequest>();
  return request.operatorAuth?.operator;
});
