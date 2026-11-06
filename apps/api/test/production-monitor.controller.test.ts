import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ProductionMonitorController } from "../src/production/tablet-production.controller";

describe("ProductionMonitorController role scope", () => {
  it("allows administrators to open the global production monitor", () => {
    const production = { getProductionMonitor: vi.fn().mockResolvedValue({ bars: [] }) };
    const controller = new ProductionMonitorController(production as never);
    const auth = { user: { role: "ADMIN" } } as never;
    controller.getMonitor(auth, {});
    expect(production.getProductionMonitor).toHaveBeenCalledWith({}, "ADMIN");
  });

  it("requires production managers to open the monitor from a specific Affaire", async () => {
    const production = { getProductionMonitor: vi.fn().mockResolvedValue({ bars: [] }) };
    const controller = new ProductionMonitorController(production as never);
    const manager = { user: { role: "PRODUCTION_MANAGER" } } as never;
    expect(() => controller.getMonitor(manager, {})).toThrow(ForbiddenException);
    await expect(controller.getMonitor(manager, { offerId: "offer-1" })).resolves.toEqual({ bars: [] });
    expect(production.getProductionMonitor).toHaveBeenCalledWith({ offerId: "offer-1" }, "PRODUCTION_MANAGER");
  });
});
