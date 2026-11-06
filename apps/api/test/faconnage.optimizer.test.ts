import { describe, expect, it } from "vitest";
import { CuttingOptimizer } from "../src/faconnage/cutting-optimizer";
import { RawStockLimitError } from "../src/faconnage/faconnage.types";

const optimizer = new CuttingOptimizer();

describe("CuttingOptimizer", () => {
  it("creates a zero-waste plan when an exact combination exists", async () => {
    const result = await optimizer.optimize({
      profile: "IPE200",
      requirements: [
        { lengthMm: 7000, quantity: 2 },
        { lengthMm: 5000, quantity: 2 },
      ],
      rawLengths: [{ lengthMm: 12000 }, { lengthMm: 15000 }],
    });

    expect(result.totalWasteMm).toBe(0);
    expect(result.totalBars).toBe(2);
    expect(result.bars.every((bar) => bar.rawLengthMm === 12000)).toBe(true);
    expect(result.status).toBe("OPTIMAL");
  });

  it("can mix raw lengths when the mixed plan is globally better", async () => {
    const result = await optimizer.optimize({
      profile: "HEA140",
      requirements: [
        { lengthMm: 9000, quantity: 1 },
        { lengthMm: 2000, quantity: 4 },
      ],
      rawLengths: [{ lengthMm: 8000 }, { lengthMm: 10000 }],
    });

    expect(result.totalWasteMm).toBe(1000);
    expect(result.bars.map((bar) => bar.rawLengthMm).sort((a, b) => a - b)).toEqual([8000, 10000]);
  });

  it("fulfills every requested quantity exactly", async () => {
    const result = await optimizer.optimize({
      profile: "UPN120",
      requirements: [
        { lengthMm: 3200, quantity: 5 },
        { lengthMm: 1800, quantity: 4 },
        { lengthMm: 900, quantity: 3 },
      ],
      rawLengths: [{ lengthMm: 6000 }, { lengthMm: 7500 }],
    });

    for (const requirement of result.requirementSummary) {
      expect(requirement.producedQuantity).toBe(requirement.requestedQuantity);
    }
    expect(result.totalRawLengthMm - result.totalUsedLengthMm).toBe(result.totalWasteMm);
  });

  it("uses deterministic lexicographic objectives: waste/raw material first, bars second", async () => {
    const result = await optimizer.optimize({
      profile: "IPE_TEST",
      requirements: [{ lengthMm: 3000, quantity: 4 }],
      rawLengths: [{ lengthMm: 6000 }, { lengthMm: 12000 }],
    });

    expect(result.totalWasteMm).toBe(0);
    // Both 2x6000 and 1x12000 consume the same raw length and create zero waste;
    // the bar-count tie-break must select one bar.
    expect(result.totalBars).toBe(1);
    expect(result.bars[0].rawLengthMm).toBe(12000);
  });

  it("returns optimization diagnostics without exposing implementation to the business model", async () => {
    const result = await optimizer.optimize({
      profile: "ROND30",
      requirements: [{ lengthMm: 1800, quantity: 5 }],
      rawLengths: [{ lengthMm: 6000 }],
    });

    expect(result.diagnostics.generatedPatternCount).toBeGreaterThan(0);
    expect(result.diagnostics.solveTimeMs).toBeGreaterThanOrEqual(0);
    expect(["HIGHS", "INTERNAL"]).toContain(result.diagnostics.solver);
  });

  it("never recommends more raw bars than the optional stock limits", async () => {
    const result = await optimizer.optimize({
      profile: "IPE200",
      requirements: [{ lengthMm: 5000, quantity: 3 }],
      rawLengths: [{ lengthMm: 6000, quantity: 1 }, { lengthMm: 12000, quantity: 1 }],
    });

    expect(result.totalBars).toBe(2);
    expect(result.bars.filter((bar) => bar.rawLengthMm === 6000)).toHaveLength(1);
    expect(result.bars.filter((bar) => bar.rawLengthMm === 12000)).toHaveLength(1);
    expect(result.requirementSummary[0]).toMatchObject({ requestedQuantity: 3, producedQuantity: 3 });
  });

  it("rejects a request when the optional stock limits cannot meet demand", async () => {
    await expect(optimizer.optimize({
      profile: "HEA140",
      requirements: [{ lengthMm: 3000, quantity: 3 }],
      rawLengths: [{ lengthMm: 6000, quantity: 1 }],
    })).rejects.toBeInstanceOf(RawStockLimitError);
  });
});
