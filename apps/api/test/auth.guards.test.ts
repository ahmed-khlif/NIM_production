import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { RolesGuard } from "../src/auth/auth.guards";

describe("RolesGuard", () => {
  it("returns the stable permission-denied error for a missing role", () => {
    const reflector = { getAllAndOverride: vi.fn(() => ["ADMIN"]) };
    const context = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({ getRequest: () => ({ auth: { user: { role: "OPERATOR" } } }) }),
    };
    const guard = new RolesGuard(reflector as never);

    try {
      guard.canActivate(context as never);
      throw new Error("Expected the guard to reject the role");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual({
        code: "PERMISSION_DENIED",
        message: "Vous n'avez pas la permission d'effectuer cette action.",
      });
    }
  });
});
