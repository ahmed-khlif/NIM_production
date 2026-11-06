import { describe, expect, it } from "vitest";
import { CuttingOptimizerExecution } from "../src/faconnage/cutting-optimizer-execution";

describe("CuttingOptimizerExecution", () => {
  it("runs the real optimizer in an isolated worker and returns its plan", async () => {
    const execution = new CuttingOptimizerExecution();
    const result = await execution.optimize([
      {
        profile: "IPE200",
        requirements: [{ lengthMm: 1_000, quantity: 1 }],
        rawLengths: [{ lengthMm: 6_000 }],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ profile: "IPE200", totalBars: 1 });
    expect(result[0].bars[0]).toMatchObject({
      rawLengthMm: 6_000,
      cuts: [{ lengthMm: 1_000, quantity: 1 }],
    });
  }, 30_000);
});
