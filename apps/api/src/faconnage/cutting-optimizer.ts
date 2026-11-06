import { Injectable } from "@nestjs/common";
import type {
  CuttingBarPlan,
  CuttingPlanAlternative,
  ProfileOptimizationInput,
  ProfileOptimizationResult,
} from "./faconnage.types";
import { RawStockLimitError } from "./faconnage.types";
import { HighsCuttingSolver, type RawStockLimit, type SolverPattern } from "./highs-cutting-solver";

interface NormalizedRequirement {
  lengthMm: number;
  quantity: number;
}

interface Pattern extends SolverPattern {
  id: number;
}

interface SearchSolution {
  patternIds: number[];
  totalWasteMm: number;
  totalRawLengthMm: number;
  totalBars: number;
}

interface GeneratedPatterns {
  patterns: Pattern[];
  truncated: boolean;
}

interface PricingItem {
  weight: number;
  value: number;
  typeIndex: number;
  count: number;
}

interface PricingNode {
  itemIndex: number;
  previousNode: number;
}

interface PricingResult {
  cuts: number[];
  value: number;
}

const MAX_EXHAUSTIVE_PATTERNS_PER_RAW_LENGTH = 4_000;
const MAX_EXHAUSTIVE_TOTAL_PATTERNS = 15_000;
const MAX_COLUMN_GENERATION_ITERATIONS = 60;
const MAX_COLUMN_GENERATION_PATTERNS = 12_000;
const COLUMN_EPSILON = 1e-7;
const MAX_FALLBACK_EXACT_TOTAL_QUANTITY = 120;
const MAX_FALLBACK_EXACT_PIECE_TYPES = 10;
const MAX_FALLBACK_EXACT_STATES = 80_000;

function roundRate(used: number, raw: number): number {
  if (raw <= 0) return 0;
  return Math.round((used / raw) * 10000) / 100;
}

function compareMetrics(
  left: Pick<SearchSolution, "totalWasteMm" | "totalRawLengthMm" | "totalBars">,
  right: Pick<SearchSolution, "totalWasteMm" | "totalRawLengthMm" | "totalBars">,
): number {
  return (
    left.totalWasteMm - right.totalWasteMm ||
    left.totalRawLengthMm - right.totalRawLengthMm ||
    left.totalBars - right.totalBars
  );
}

function aggregateCuts(lengths: number[], cuts: number[]): Array<{ lengthMm: number; quantity: number }> {
  const result: Array<{ lengthMm: number; quantity: number }> = [];
  for (let index = 0; index < cuts.length; index += 1) {
    if (cuts[index] > 0) result.push({ lengthMm: lengths[index], quantity: cuts[index] });
  }
  return result;
}

function barSignature(bar: CuttingBarPlan): string {
  return `${bar.rawLengthMm}:${bar.cuts.map((cut) => `${cut.lengthMm}x${cut.quantity}`).join("+")}`;
}

function planSignature(plan: CuttingPlanAlternative): string {
  return plan.bars
    .map(barSignature)
    .sort()
    .join("|");
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return Math.max(1, a);
}

function patternCutsSignature(cuts: number[]): string {
  return cuts.join(",");
}

@Injectable()
export class CuttingOptimizer {
  private readonly highs = new HighsCuttingSolver();

  async optimize(input: ProfileOptimizationInput): Promise<ProfileOptimizationResult> {
    const startedAt = Date.now();
    const requirements = this.normalizeRequirements(input.requirements);
    const stockLimits = new Map(
      input.rawLengths
        .filter((option): option is typeof option & { quantity: number } => option.quantity !== undefined)
        .map((option) => [option.lengthMm, option.quantity]),
    );
    const rawStockLimits: RawStockLimit[] = [...stockLimits.entries()].map(([lengthMm, quantity]) => ({ lengthMm, quantity }));
    const stockLimited = rawStockLimits.length > 0;
    const rawLengths = [...new Set(input.rawLengths.map((option) => option.lengthMm))].sort((a, b) => a - b);
    const heuristic = this.bestFitDecreasing(requirements, rawLengths, stockLimited ? stockLimits : undefined);
    const objectiveScale = requirements.reduce((sum, item) => sum + item.quantity, 0) + 1;

    let recommended: CuttingPlanAlternative | null = heuristic;
    let status: ProfileOptimizationResult["status"] = "HEURISTIC";
    let method: ProfileOptimizationResult["diagnostics"]["method"] = "BEST_FIT_DECREASING_FALLBACK";
    let generatedPatternCount = 0;
    let columnGenerationIterations = 0;
    let columnGenerationConverged = false;
    let exhaustivePatternSet = false;
    let solverAvailable = false;

    const exhaustive = this.generateExhaustivePatterns(requirements, rawLengths, stockLimited);
    generatedPatternCount = exhaustive.patterns.length;
    exhaustivePatternSet = !exhaustive.truncated;

    solverAvailable = await this.highs.available();

    if (solverAvailable && exhaustive.patterns.length > 0 && (exhaustivePatternSet || stockLimited)) {
      const mip = await this.highs.solveIntegerMaster(
        requirements,
        exhaustive.patterns,
        exhaustive.patterns.map((pattern) => this.patternObjectiveCost(pattern, objectiveScale)),
        15,
        rawStockLimits,
      );
      if (mip?.feasible) {
        const solverPlan = this.planFromPatternCounts(requirements, exhaustive.patterns, mip.counts);
        if (!recommended || this.comparePlans(solverPlan, recommended) <= 0) recommended = solverPlan;
        status = mip.optimal && exhaustivePatternSet ? "OPTIMAL" : "FEASIBLE";
        method = "HIGHS_MILP_EXHAUSTIVE";
      }
    }

    if (solverAvailable && !stockLimited && (!exhaustivePatternSet || status === "HEURISTIC")) {
      const columnResult = await this.solveWithColumnGeneration(
        requirements,
        rawLengths,
        heuristic ?? this.bestFitDecreasing(requirements, rawLengths)!,
        objectiveScale,
      );
      generatedPatternCount = Math.max(generatedPatternCount, columnResult.patternCount);
      columnGenerationIterations = columnResult.iterations;
      columnGenerationConverged = columnResult.converged;
      if (columnResult.plan && (!recommended || this.comparePlans(columnResult.plan, recommended) <= 0)) {
        recommended = columnResult.plan;
        status = columnResult.optimalProof ? "OPTIMAL" : "FEASIBLE";
        method = "COLUMN_GENERATION_MILP";
      }
    }

    if (!solverAvailable || status === "HEURISTIC") {
      const totalQuantity = requirements.reduce((sum, item) => sum + item.quantity, 0);
      const fallbackExactEligible =
        exhaustivePatternSet &&
        totalQuantity <= MAX_FALLBACK_EXACT_TOTAL_QUANTITY &&
        requirements.length <= MAX_FALLBACK_EXACT_PIECE_TYPES &&
        exhaustive.patterns.length > 0;

      if (fallbackExactEligible) {
        const exact = this.solveIntegerPatternProblem(
          requirements,
          exhaustive.patterns,
          stockLimited ? stockLimits : undefined,
        );
        if (exact) {
          const exactPlan = this.planFromPatterns(requirements, exhaustive.patterns, exact.patternIds);
          if (!recommended || this.comparePlans(exactPlan, recommended) <= 0) recommended = exactPlan;
          status = "OPTIMAL";
          method = "PATTERN_INTEGER_SEARCH_FALLBACK";
        }
      }
    }

    if (!recommended) throw new RawStockLimitError(input.profile);
    const alternatives = stockLimited ? [] : this.buildAlternatives(requirements, rawLengths, recommended);
    const producedByLength = new Map<number, number>();
    for (const bar of recommended.bars) {
      for (const cut of bar.cuts) {
        producedByLength.set(cut.lengthMm, (producedByLength.get(cut.lengthMm) ?? 0) + cut.quantity);
      }
    }

    return {
      profile: input.profile,
      status,
      ...recommended,
      requirementSummary: requirements.map((item) => ({
        lengthMm: item.lengthMm,
        requestedQuantity: item.quantity,
        producedQuantity: producedByLength.get(item.lengthMm) ?? 0,
      })),
      alternatives,
      diagnostics: {
        method,
        solver: solverAvailable ? "HIGHS" : "INTERNAL",
        generatedPatternCount,
        columnGenerationIterations,
        columnGenerationConverged,
        exhaustivePatternSet,
        solveTimeMs: Math.max(0, Date.now() - startedAt),
      },
    };
  }

  private normalizeRequirements(requirements: ProfileOptimizationInput["requirements"]): NormalizedRequirement[] {
    const grouped = new Map<number, number>();
    for (const requirement of requirements) {
      grouped.set(requirement.lengthMm, (grouped.get(requirement.lengthMm) ?? 0) + requirement.quantity);
    }
    return [...grouped.entries()]
      .map(([lengthMm, quantity]) => ({ lengthMm, quantity }))
      .sort((left, right) => right.lengthMm - left.lengthMm);
  }

  /**
   * Fast, deterministic baseline. Existing open bars are filled best-fit first;
   * a new bar uses the shortest raw format that can accept the current piece.
   */
  private bestFitDecreasing(
    requirements: NormalizedRequirement[],
    rawLengths: number[],
    stockLimits?: Map<number, number>,
  ): CuttingPlanAlternative | null {
    type OpenBar = { rawLengthMm: number; remainingMm: number; cuts: number[] };
    const lengths = requirements.map((item) => item.lengthMm);
    const bars: OpenBar[] = [];
    const usedByLength = new Map<number, number>();

    for (let typeIndex = 0; typeIndex < requirements.length; typeIndex += 1) {
      const requirement = requirements[typeIndex];
      for (let count = 0; count < requirement.quantity; count += 1) {
        let bestBarIndex = -1;
        let bestRemaining = Number.POSITIVE_INFINITY;
        for (let barIndex = 0; barIndex < bars.length; barIndex += 1) {
          const after = bars[barIndex].remainingMm - requirement.lengthMm;
          if (after >= 0 && after < bestRemaining) {
            bestRemaining = after;
            bestBarIndex = barIndex;
          }
        }

        if (bestBarIndex === -1) {
          const rawLength = rawLengths.find(
            (value) => value >= requirement.lengthMm &&
              (!stockLimits?.has(value) || (usedByLength.get(value) ?? 0) < (stockLimits.get(value) ?? 0)),
          );
          if (rawLength === undefined) return null;
          usedByLength.set(rawLength, (usedByLength.get(rawLength) ?? 0) + 1);
          const cuts = Array.from({ length: requirements.length }, () => 0);
          cuts[typeIndex] = 1;
          bars.push({ rawLengthMm: rawLength, remainingMm: rawLength - requirement.lengthMm, cuts });
        } else {
          bars[bestBarIndex].remainingMm -= requirement.lengthMm;
          bars[bestBarIndex].cuts[typeIndex] += 1;
        }
      }
    }

    const plans = bars.map((bar) => {
      const usedLengthMm = bar.rawLengthMm - bar.remainingMm;
      return {
        rawLengthMm: bar.rawLengthMm,
        cuts: aggregateCuts(lengths, bar.cuts),
        usedLengthMm,
        wasteMm: bar.remainingMm,
        utilizationRate: roundRate(usedLengthMm, bar.rawLengthMm),
      };
    });
    return this.summarizeBars(plans);
  }

  private patternObjectiveCost(pattern: Pick<Pattern, "rawLengthMm">, objectiveScale: number): number {
    // Exact-demand plans all have the same useful length. Minimizing total raw
    // length therefore minimizes waste. The scale makes one millimetre of raw
    // material more important than any possible difference in number of bars.
    return pattern.rawLengthMm * objectiveScale + 1;
  }

  private generateExhaustivePatterns(
    requirements: NormalizedRequirement[],
    rawLengths: number[],
    preserveRawLength = false,
  ): GeneratedPatterns {
    const globalByCuts = new Map<string, Pattern>();
    let truncated = false;

    for (const rawLengthMm of rawLengths) {
      let generatedForRaw = 0;
      const cuts = Array.from({ length: requirements.length }, () => 0);
      const visit = (index: number, remainingMm: number, usedLengthMm: number): void => {
        if (
          generatedForRaw >= MAX_EXHAUSTIVE_PATTERNS_PER_RAW_LENGTH ||
          globalByCuts.size >= MAX_EXHAUSTIVE_TOTAL_PATTERNS
        ) {
          truncated = true;
          return;
        }
        if (index === requirements.length) {
          if (cuts.every((value) => value === 0)) return;
          generatedForRaw += 1;
          this.addDominantPattern(globalByCuts, {
            id: -1,
            rawLengthMm,
            cuts: [...cuts],
            usedLengthMm,
            wasteMm: rawLengthMm - usedLengthMm,
          }, preserveRawLength);
          return;
        }

        const requirement = requirements[index];
        const maxCount = Math.min(requirement.quantity, Math.floor(remainingMm / requirement.lengthMm));
        for (let count = maxCount; count >= 0; count -= 1) {
          cuts[index] = count;
          visit(
            index + 1,
            remainingMm - count * requirement.lengthMm,
            usedLengthMm + count * requirement.lengthMm,
          );
          if (truncated && globalByCuts.size >= MAX_EXHAUSTIVE_TOTAL_PATTERNS) break;
        }
        cuts[index] = 0;
      };
      visit(0, rawLengthMm, 0);
    }

    return {
      patterns: this.sortAndIdentifyPatterns([...globalByCuts.values()]),
      truncated,
    };
  }

  private initialColumnGenerationPatterns(
    requirements: NormalizedRequirement[],
    rawLengths: number[],
    heuristic: CuttingPlanAlternative,
  ): Pattern[] {
    const byCuts = new Map<string, Pattern>();

    // Single-piece columns guarantee an exact-demand feasible master problem.
    for (let pieceIndex = 0; pieceIndex < requirements.length; pieceIndex += 1) {
      const rawLengthMm = rawLengths.find((raw) => raw >= requirements[pieceIndex].lengthMm);
      if (rawLengthMm === undefined) continue;
      const cuts = requirements.map(() => 0);
      cuts[pieceIndex] = 1;
      this.addDominantPattern(byCuts, {
        id: -1,
        rawLengthMm,
        cuts,
        usedLengthMm: requirements[pieceIndex].lengthMm,
        wasteMm: rawLengthMm - requirements[pieceIndex].lengthMm,
      });
    }

    // Strong homogeneous columns help the first restricted master LP.
    for (const rawLengthMm of rawLengths) {
      for (let pieceIndex = 0; pieceIndex < requirements.length; pieceIndex += 1) {
        const maxCount = Math.min(
          requirements[pieceIndex].quantity,
          Math.floor(rawLengthMm / requirements[pieceIndex].lengthMm),
        );
        if (maxCount <= 0) continue;
        const cuts = requirements.map(() => 0);
        cuts[pieceIndex] = maxCount;
        const usedLengthMm = maxCount * requirements[pieceIndex].lengthMm;
        this.addDominantPattern(byCuts, {
          id: -1,
          rawLengthMm,
          cuts,
          usedLengthMm,
          wasteMm: rawLengthMm - usedLengthMm,
        });
      }
    }

    // Seed the master with the heuristic's mixed patterns as a warm structural start.
    const lengthToIndex = new Map(requirements.map((item, index) => [item.lengthMm, index]));
    for (const bar of heuristic.bars) {
      const cuts = requirements.map(() => 0);
      for (const cut of bar.cuts) {
        const pieceIndex = lengthToIndex.get(cut.lengthMm);
        if (pieceIndex !== undefined) cuts[pieceIndex] += cut.quantity;
      }
      this.addDominantPattern(byCuts, {
        id: -1,
        rawLengthMm: bar.rawLengthMm,
        cuts,
        usedLengthMm: bar.usedLengthMm,
        wasteMm: bar.wasteMm,
      });
    }

    return this.sortAndIdentifyPatterns([...byCuts.values()]);
  }

  private async solveWithColumnGeneration(
    requirements: NormalizedRequirement[],
    rawLengths: number[],
    heuristic: CuttingPlanAlternative,
    objectiveScale: number,
  ): Promise<{ plan: CuttingPlanAlternative | null; patternCount: number; iterations: number; optimalProof: boolean; converged: boolean }> {
    const byCuts = new Map<string, Pattern>();
    for (const pattern of this.initialColumnGenerationPatterns(requirements, rawLengths, heuristic)) {
      this.addDominantPattern(byCuts, pattern);
    }

    let iterations = 0;
    let lpConverged = false;

    for (; iterations < MAX_COLUMN_GENERATION_ITERATIONS; iterations += 1) {
      const patterns = this.sortAndIdentifyPatterns([...byCuts.values()]);
      if (patterns.length >= MAX_COLUMN_GENERATION_PATTERNS) break;
      const lp = await this.highs.solveRestrictedMasterLp(
        requirements,
        patterns,
        patterns.map((pattern) => this.patternObjectiveCost(pattern, objectiveScale)),
        3,
      );
      if (!lp?.optimal || lp.rowDuals.length !== requirements.length) break;

      let added = 0;
      for (const rawLengthMm of rawLengths) {
        const priced = this.pricePattern(requirements, rawLengthMm, lp.rowDuals);
        if (!priced || priced.cuts.every((value) => value === 0)) continue;
        const usedLengthMm = priced.cuts.reduce(
          (sum, count, index) => sum + count * requirements[index].lengthMm,
          0,
        );
        const candidate: Pattern = {
          id: -1,
          rawLengthMm,
          cuts: priced.cuts,
          usedLengthMm,
          wasteMm: rawLengthMm - usedLengthMm,
        };
        const reducedCost = this.patternObjectiveCost(candidate, objectiveScale) - priced.value;
        if (reducedCost < -COLUMN_EPSILON) {
          const before = byCuts.size;
          this.addDominantPattern(byCuts, candidate);
          if (byCuts.size > before) added += 1;
        }
      }

      if (added === 0) {
        lpConverged = true;
        break;
      }
    }

    const patterns = this.sortAndIdentifyPatterns([...byCuts.values()]);
    const mip = await this.highs.solveIntegerMaster(
      requirements,
      patterns,
      patterns.map((pattern) => this.patternObjectiveCost(pattern, objectiveScale)),
      15,
    );
    if (!mip?.feasible) {
      return { plan: null, patternCount: patterns.length, iterations, optimalProof: false, converged: lpConverged };
    }

    // Column generation proves LP optimality for the generated master but not
    // integer global optimality without full branch-and-price. We therefore only
    // claim OPTIMAL when the pattern universe was exhaustive elsewhere.
    return {
      plan: this.planFromPatternCounts(requirements, patterns, mip.counts),
      patternCount: patterns.length,
      iterations,
      optimalProof: false,
      converged: lpConverged,
    };
  }

  private pricePattern(
    requirements: NormalizedRequirement[],
    rawLengthMm: number,
    duals: number[],
  ): PricingResult | null {
    const activeIndices = requirements
      .map((requirement, index) => ({ requirement, index, dual: duals[index] ?? 0 }))
      .filter((item) => item.dual > COLUMN_EPSILON && item.requirement.lengthMm <= rawLengthMm);
    if (activeIndices.length === 0) return null;

    const divisor = activeIndices.reduce(
      (current, item) => gcd(current, item.requirement.lengthMm),
      activeIndices[0].requirement.lengthMm,
    );
    const capacity = Math.floor(rawLengthMm / divisor);
    if (capacity <= 0) return null;

    const items: PricingItem[] = [];
    for (const item of activeIndices) {
      let remaining = item.requirement.quantity;
      let chunk = 1;
      while (remaining > 0) {
        const take = Math.min(chunk, remaining);
        items.push({
          weight: (item.requirement.lengthMm / divisor) * take,
          value: item.dual * take,
          typeIndex: item.index,
          count: take,
        });
        remaining -= take;
        chunk *= 2;
      }
    }

    const values = new Float64Array(capacity + 1);
    values.fill(Number.NEGATIVE_INFINITY);
    values[0] = 0;
    const nodeIds = new Int32Array(capacity + 1);
    nodeIds.fill(-1);
    const nodes: PricingNode[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      for (let cap = capacity; cap >= item.weight; cap -= 1) {
        const base = values[cap - item.weight];
        if (!Number.isFinite(base)) continue;
        const candidate = base + item.value;
        if (candidate <= values[cap] + COLUMN_EPSILON) continue;
        nodes.push({ itemIndex, previousNode: nodeIds[cap - item.weight] });
        values[cap] = candidate;
        nodeIds[cap] = nodes.length - 1;
      }
    }

    let bestCapacity = 0;
    let bestValue = 0;
    for (let cap = 1; cap <= capacity; cap += 1) {
      if (values[cap] > bestValue + COLUMN_EPSILON) {
        bestValue = values[cap];
        bestCapacity = cap;
      }
    }
    if (bestValue <= COLUMN_EPSILON) return null;

    const cuts = requirements.map(() => 0);
    let nodeId = nodeIds[bestCapacity];
    while (nodeId >= 0) {
      const node = nodes[nodeId];
      const item = items[node.itemIndex];
      cuts[item.typeIndex] += item.count;
      nodeId = node.previousNode;
    }
    return { cuts, value: bestValue };
  }

  private addDominantPattern(
    byCuts: Map<string, Pattern>,
    pattern: Pattern,
    preserveRawLength = false,
  ): void {
    if (pattern.cuts.every((value) => value === 0)) return;
    const signature = preserveRawLength
      ? `${pattern.rawLengthMm}:${patternCutsSignature(pattern.cuts)}`
      : patternCutsSignature(pattern.cuts);
    const current = byCuts.get(signature);
    // For identical cuts, the shortest raw bar strictly dominates longer bars.
    if (!current || pattern.rawLengthMm < current.rawLengthMm) byCuts.set(signature, pattern);
  }

  private sortAndIdentifyPatterns(patterns: Pattern[]): Pattern[] {
    return patterns
      .sort(
        (left, right) =>
          left.wasteMm - right.wasteMm ||
          left.rawLengthMm - right.rawLengthMm ||
          right.usedLengthMm - left.usedLengthMm ||
          patternCutsSignature(left.cuts).localeCompare(patternCutsSignature(right.cuts)),
      )
      .map((pattern, id) => ({ ...pattern, id }));
  }

  private solveIntegerPatternProblem(
    requirements: NormalizedRequirement[],
    patterns: Pattern[],
    stockLimits?: Map<number, number>,
  ): SearchSolution | null {
    const initial = requirements.map((item) => item.quantity);
    const patternsByTarget = requirements.map((_, index) =>
      patterns
        .filter((pattern) => pattern.cuts[index] > 0)
        .sort(
          (left, right) =>
            left.wasteMm - right.wasteMm ||
            left.rawLengthMm - right.rawLengthMm ||
            right.usedLengthMm - left.usedLengthMm ||
            left.id - right.id,
        ),
    );
    const memo = new Map<string, SearchSolution | null>();
    let states = 0;
    let limitReached = false;

    const limitedRawLengths = [...(stockLimits?.keys() ?? [])];
    const stockIndex = new Map(limitedRawLengths.map((length, index) => [length, index]));
    const solve = (remaining: number[], stockRemaining: number[]): SearchSolution | null => {
      if (remaining.every((value) => value === 0)) {
        return { patternIds: [], totalWasteMm: 0, totalRawLengthMm: 0, totalBars: 0 };
      }
      const key = `${remaining.join(",")}|${stockRemaining.join(",")}`;
      if (memo.has(key)) return memo.get(key) ?? null;
      states += 1;
      if (states > MAX_FALLBACK_EXACT_STATES) {
        limitReached = true;
        return null;
      }

      const targetIndex = remaining.findIndex((value) => value > 0);
      let best: SearchSolution | null = null;
      for (const pattern of patternsByTarget[targetIndex]) {
        const limitIndex = stockIndex.get(pattern.rawLengthMm);
        if (limitIndex !== undefined && (stockRemaining[limitIndex] ?? 0) <= 0) continue;
        let applicable = true;
        for (let index = 0; index < remaining.length; index += 1) {
          if (pattern.cuts[index] > remaining[index]) {
            applicable = false;
            break;
          }
        }
        if (!applicable) continue;

        const next = remaining.map((value, index) => value - pattern.cuts[index]);
        const nextStock = [...stockRemaining];
        if (limitIndex !== undefined) nextStock[limitIndex] -= 1;
        const sub = solve(next, nextStock);
        if (!sub) continue;
        const candidate: SearchSolution = {
          patternIds: [pattern.id, ...sub.patternIds],
          totalWasteMm: pattern.wasteMm + sub.totalWasteMm,
          totalRawLengthMm: pattern.rawLengthMm + sub.totalRawLengthMm,
          totalBars: 1 + sub.totalBars,
        };
        if (!best || compareMetrics(candidate, best) < 0) best = candidate;
      }
      memo.set(key, best);
      return best;
    };

    const solution = solve(initial, limitedRawLengths.map((length) => stockLimits?.get(length) ?? 0));
    return limitReached ? null : solution;
  }

  private planFromPatterns(
    requirements: NormalizedRequirement[],
    patterns: Pattern[],
    patternIds: number[],
  ): CuttingPlanAlternative {
    const counts = patterns.map(() => 0);
    for (const patternId of patternIds) counts[patternId] += 1;
    return this.planFromPatternCounts(requirements, patterns, counts);
  }

  private planFromPatternCounts(
    requirements: NormalizedRequirement[],
    patterns: Pattern[],
    counts: number[],
  ): CuttingPlanAlternative {
    const lengths = requirements.map((item) => item.lengthMm);
    const bars: CuttingBarPlan[] = [];
    for (let patternIndex = 0; patternIndex < patterns.length; patternIndex += 1) {
      const count = counts[patternIndex] ?? 0;
      if (count <= 0) continue;
      const pattern = patterns[patternIndex];
      const bar: CuttingBarPlan = {
        rawLengthMm: pattern.rawLengthMm,
        cuts: aggregateCuts(lengths, pattern.cuts),
        usedLengthMm: pattern.usedLengthMm,
        wasteMm: pattern.wasteMm,
        utilizationRate: roundRate(pattern.usedLengthMm, pattern.rawLengthMm),
      };
      for (let instance = 0; instance < count; instance += 1) bars.push({ ...bar, cuts: [...bar.cuts] });
    }
    return this.summarizeBars(bars);
  }

  private summarizeBars(bars: CuttingBarPlan[]): CuttingPlanAlternative {
    const totalRawLengthMm = bars.reduce((sum, bar) => sum + bar.rawLengthMm, 0);
    const totalUsedLengthMm = bars.reduce((sum, bar) => sum + bar.usedLengthMm, 0);
    const totalWasteMm = bars.reduce((sum, bar) => sum + bar.wasteMm, 0);
    return {
      bars,
      totalBars: bars.length,
      totalRawLengthMm,
      totalUsedLengthMm,
      totalWasteMm,
      utilizationRate: roundRate(totalUsedLengthMm, totalRawLengthMm),
    };
  }

  private comparePlans(left: CuttingPlanAlternative, right: CuttingPlanAlternative): number {
    return compareMetrics(left, right);
  }

  private buildAlternatives(
    requirements: NormalizedRequirement[],
    rawLengths: number[],
    recommended: CuttingPlanAlternative,
  ): CuttingPlanAlternative[] {
    const candidates: CuttingPlanAlternative[] = [];
    const bestFit = this.bestFitDecreasing(requirements, rawLengths);
    if (bestFit) candidates.push(bestFit);
    for (const rawLength of rawLengths) {
      if (requirements.every((requirement) => requirement.lengthMm <= rawLength)) {
        const candidate = this.bestFitDecreasing(requirements, [rawLength]);
        if (candidate) candidates.push(candidate);
      }
    }
    const recommendedSignature = planSignature(recommended);
    const unique = new Map<string, CuttingPlanAlternative>();
    for (const candidate of candidates) {
      const signature = planSignature(candidate);
      if (signature === recommendedSignature) continue;
      const current = unique.get(signature);
      if (!current || this.comparePlans(candidate, current) < 0) unique.set(signature, candidate);
    }
    return [...unique.values()]
      .sort((left, right) => this.comparePlans(left, right))
      .slice(0, 2);
  }
}
