import type { AuthenticatedUser } from "@nim/types";
import type { Request } from "express";

export const SESSION_COOKIE_NAME = "nim_session";

export type AuthContext = {
  user: AuthenticatedUser;
  sessionId: string;
  tokenHash: string;
};

export type AuthenticatedRequest = Request & {
  auth?: AuthContext;
};
