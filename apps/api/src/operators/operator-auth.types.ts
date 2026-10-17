import type { Request } from "express";

export const OPERATOR_SESSION_COOKIE_NAME = "nim_operator_session";

export type OperatorIdentity = {
  id: string;
  displayName: string;
};

export type OperatorAuthContext = {
  operator: OperatorIdentity;
  sessionId: string;
  tokenHash: string;
};

export type OperatorAuthenticatedRequest = Request & {
  operatorAuth?: OperatorAuthContext;
};
