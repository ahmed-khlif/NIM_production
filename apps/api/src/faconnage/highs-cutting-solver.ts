import type { CuttingRequirementInput } from "./faconnage.types";

export interface SolverPattern {
  rawLengthMm: number;
  cuts: number[];
  usedLengthMm: number;
  wasteMm: number;
}

export interface LpDualResult {
  optimal: boolean;
  rowDuals: number[];
  objectiveValue: number | null;
  runtimeMs: number;
}

export interface MipPatternResult {
  optimal: boolean;
  feasible: boolean;
  counts: number[];
  objectiveValue: number | null;
  runtimeMs: number;
}

export interface RawStockLimit {
  lengthMm: number;
  quantity: number;
}

type HighsSolution = {
  rowDual?: ArrayLike<number>;
  colValue?: ArrayLike<number>;
};

type HighsModel = {
  options: { set(options: Record<string, string | number | boolean>): void };
  addRow(lowerBound: number, upperBound: number, coefficients: { indices: number[]; values: number[] }): void;
  addCol(cost: number, lowerBound: number, upperBound: number, coefficients: { indices: number[]; values: number[] }): void;
  getNumCol(): number;
  changeColIntegrality(columnIndex: number, variableType: unknown): void;
  run(): void;
  getModelStatus(): unknown;
  getSolution(): HighsSolution;
  getObjectiveValue(): number;
  dispose(): void;
};

type HighsModule = {
  constants?: {
    variableType?: { integer?: unknown };
    modelStatus?: { optimal?: unknown };
  };
  createModel(): HighsModel;
};

const dynamicImport = Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<{ default?: unknown }>;

let highsPromise: Promise<HighsModule | null> | null = null;

async function loadHighsRuntime(): Promise<HighsModule | null> {
  if (!highsPromise) {
    highsPromise = (async () => {
      try {
        const imported = await dynamicImport("highs");
        const loader = imported.default ?? imported;
        if (typeof loader !== "function") return null;
        return await loader();
      } catch {
        return null;
      }
    })();
  }
  return highsPromise;
}

function addMasterRows(model: HighsModel, requirements: CuttingRequirementInput[]): void {
  for (const requirement of requirements) {
    model.addRow(requirement.quantity, requirement.quantity, {
      indices: [],
      values: [],
    });
  }
}

function addPatternColumn(
  model: HighsModel,
  highs: HighsModule,
  pattern: SolverPattern,
  cost: number,
  integer: boolean,
  upperBound: number,
  stockRows?: Map<number, number>,
): void {
  const indices: number[] = [];
  const values: number[] = [];
  for (let index = 0; index < pattern.cuts.length; index += 1) {
    if (pattern.cuts[index] <= 0) continue;
    indices.push(index);
    values.push(pattern.cuts[index]);
  }
  const stockRow = stockRows?.get(pattern.rawLengthMm);
  if (stockRow !== undefined) {
    indices.push(stockRow);
    values.push(1);
  }

  const columnIndex = model.getNumCol();
  model.addCol(cost, 0, upperBound, { indices, values });
  if (integer) {
    const integerType = highs.constants?.variableType?.integer;
    if (integerType === undefined) throw new Error("HiGHS integer variable type is unavailable.");
    model.changeColIntegrality(columnIndex, integerType);
  }
}

function isOptimalStatus(highs: HighsModule, status: unknown): boolean {
  return status === highs.constants?.modelStatus?.optimal;
}

/**
 * Thin adapter around HiGHS. The rest of the Façonnage domain never depends on
 * the solver package directly, so we can replace it later without touching the
 * business workflow.
 */
export class HighsCuttingSolver {
  async available(): Promise<boolean> {
    return (await loadHighsRuntime()) !== null;
  }

  async solveRestrictedMasterLp(
    requirements: CuttingRequirementInput[],
    patterns: SolverPattern[],
    costs: number[],
    timeLimitSeconds = 3,
  ): Promise<LpDualResult | null> {
    const highs = await loadHighsRuntime();
    if (!highs || patterns.length === 0) return null;

    const startedAt = Date.now();
    const model = highs.createModel();
    try {
      model.options.set({
        output_flag: false,
        presolve: "on",
        solver: "simplex",
        time_limit: timeLimitSeconds,
      });
      addMasterRows(model, requirements);
      const upperBound = requirements.reduce((sum, item) => sum + item.quantity, 0);
      patterns.forEach((pattern, index) => {
        addPatternColumn(model, highs, pattern, costs[index], false, upperBound);
      });

      model.run();
      const status = model.getModelStatus();
      const solution = model.getSolution();
      const rowDuals = Array.from(solution.rowDual ?? [], Number);
      return {
        optimal: isOptimalStatus(highs, status),
        rowDuals,
        objectiveValue: Number.isFinite(model.getObjectiveValue()) ? model.getObjectiveValue() : null,
        runtimeMs: Math.max(0, Date.now() - startedAt),
      };
    } catch {
      return null;
    } finally {
      model.dispose();
    }
  }

  async solveIntegerMaster(
    requirements: CuttingRequirementInput[],
    patterns: SolverPattern[],
    costs: number[],
    timeLimitSeconds = 12,
    rawStockLimits: RawStockLimit[] = [],
  ): Promise<MipPatternResult | null> {
    const highs = await loadHighsRuntime();
    if (!highs || patterns.length === 0) return null;

    const startedAt = Date.now();
    const model = highs.createModel();
    try {
      model.options.set({
        output_flag: false,
        presolve: "on",
        time_limit: timeLimitSeconds,
        mip_rel_gap: 0,
      });
      addMasterRows(model, requirements);
      const stockRows = new Map<number, number>();
      rawStockLimits.forEach((limit, index) => {
        const rowIndex = requirements.length + index;
        stockRows.set(limit.lengthMm, rowIndex);
        model.addRow(0, limit.quantity, { indices: [], values: [] });
      });
      const upperBound = requirements.reduce((sum, item) => sum + item.quantity, 0);
      patterns.forEach((pattern, index) => {
        addPatternColumn(model, highs, pattern, costs[index], true, upperBound, stockRows);
      });

      model.run();
      const status = model.getModelStatus();
      const solution = model.getSolution();
      const rawValues = Array.from(solution.colValue ?? [], Number);
      const counts = rawValues.map((value) => {
        const rounded = Math.round(value);
        return Math.abs(value - rounded) <= 1e-5 ? Math.max(0, rounded) : Math.max(0, Math.floor(value + 1e-6));
      });

      const produced = requirements.map(() => 0);
      for (let patternIndex = 0; patternIndex < patterns.length; patternIndex += 1) {
        const count = counts[patternIndex] ?? 0;
        if (count <= 0) continue;
        for (let pieceIndex = 0; pieceIndex < requirements.length; pieceIndex += 1) {
          produced[pieceIndex] += patterns[patternIndex].cuts[pieceIndex] * count;
        }
      }
      const feasible = produced.every((quantity, index) => quantity === requirements[index].quantity);

      return {
        optimal: feasible && isOptimalStatus(highs, status),
        feasible,
        counts,
        objectiveValue: Number.isFinite(model.getObjectiveValue()) ? model.getObjectiveValue() : null,
        runtimeMs: Math.max(0, Date.now() - startedAt),
      };
    } catch {
      return null;
    } finally {
      model.dispose();
    }
  }
}
