import type { CuttingPlanBarProposal, CuttingPlanStatus } from "@nim/types";

export type OptimizationStatus = "OPTIMAL" | "FEASIBLE" | "HEURISTIC";

export interface CuttingRequirementInput {
  lengthMm: number;
  quantity: number;
}

export interface RawLengthOptionInput {
  lengthMm: number;
}

export interface ProfileOptimizationInput {
  profile: string;
  requirements: CuttingRequirementInput[];
  rawLengths: RawLengthOptionInput[];
}

export interface CuttingBarPlan {
  rawLengthMm: number;
  cuts: Array<{ lengthMm: number; quantity: number }>;
  usedLengthMm: number;
  wasteMm: number;
  utilizationRate: number;
}

export interface CuttingPlanAlternative {
  totalBars: number;
  totalRawLengthMm: number;
  totalUsedLengthMm: number;
  totalWasteMm: number;
  utilizationRate: number;
  bars: CuttingBarPlan[];
}

export interface ProfileOptimizationResult extends CuttingPlanAlternative {
  profile: string;
  status: OptimizationStatus;
  requirementSummary: Array<{
    lengthMm: number;
    requestedQuantity: number;
    producedQuantity: number;
  }>;
  alternatives: CuttingPlanAlternative[];
  diagnostics: {
    method:
      | "HIGHS_MILP_EXHAUSTIVE"
      | "COLUMN_GENERATION_MILP"
      | "PATTERN_INTEGER_SEARCH_FALLBACK"
      | "BEST_FIT_DECREASING_FALLBACK";
    solver: "HIGHS" | "INTERNAL";
    generatedPatternCount: number;
    columnGenerationIterations: number;
    columnGenerationConverged: boolean;
    exhaustivePatternSet: boolean;
    solveTimeMs: number;
  };
}

export interface FaconnageOptimizationBatchResult {
  profiles: ProfileOptimizationResult[];
  summary: {
    profileCount: number;
    totalBars: number;
    totalRawLengthMm: number;
    totalUsedLengthMm: number;
    totalWasteMm: number;
    utilizationRate: number;
  };
  plan?: {
    id: string;
    reference: string;
    status: CuttingPlanStatus;
    createdAt: string;
  };
  proposals?: CuttingPlanBarProposal[];
}

