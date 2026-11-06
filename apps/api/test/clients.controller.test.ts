import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../src/auth/auth.decorators";
import { ClientsController } from "../src/clients/clients.controller";

describe("ClientsController role policy", () => {
  it("limits directory management to administrators and production managers", () => {
    expect(Reflect.getMetadata(ROLES_KEY, ClientsController)).toEqual([
      "ADMIN",
      "PRODUCTION_MANAGER",
    ]);
  });

  it("allows only administrators to archive or restore client records", () => {
    expect(Reflect.getMetadata(ROLES_KEY, ClientsController.prototype.archive)).toEqual(["ADMIN"]);
    expect(Reflect.getMetadata(ROLES_KEY, ClientsController.prototype.restore)).toEqual(["ADMIN"]);
  });
});
