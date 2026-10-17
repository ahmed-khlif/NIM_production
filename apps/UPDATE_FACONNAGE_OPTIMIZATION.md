# NIM — Façonnage / Mise en barres — Solver upgrade

## What changed

### Guided selection and review (UI)

Façonnage presents its existing workflow as three explicit stages: select exact profiles, enter valid raw-stock lengths and calculate, then review and validate proposed bars. Profile selection is searchable and family-filterable; bulk selection applies to the currently visible profiles, while clearing the visible selection preserves selections hidden by filters. The proposal review has a profile/reference/length search and visible-result bulk selection. Requirement lengths are mapped to the recommended bars that contain each cut, with arrows and quantities to make the relationship explicit. Server-side optimization and validation remain authoritative.

Saved plans are fetched in server-paginated pages (10 per page by default). Unmaterialized draft plans can be permanently removed together with their proposal rows; the deletion itself remains in the history log. Plans with materialized bars cannot be physically removed because those bars depend on the plan for production traceability. Removing a partially validated plan's remainder deletes only its unmaterialized proposal rows, preserves validated bars, logs the action, and hides the cancelled plan from the active saved-plan list.

The Façonnage workflow remains exactly the same from the user's point of view:

`Pièces → Profils à traiter → Longueurs brutes possibles → Optimiser → Plan de mise en barres`

The optimization core has been upgraded from the first custom pattern search to a production-oriented hybrid engine.

## Optimization engine

The new optimizer uses:

1. **Best Fit Decreasing (BFD)** as a deterministic, immediate baseline and fallback.
2. **Pattern generation** with dominance elimination.
3. **Full pattern enumeration + HiGHS MILP** when the pattern universe can be generated completely. When HiGHS proves this MIP optimal, NIM returns `OPTIMAL`.
4. **Column Generation** for larger pattern spaces:
   - solve the restricted master LP,
   - read demand dual values,
   - solve an exact bounded-knapsack pricing problem for every possible raw length,
   - add negative-reduced-cost patterns,
   - repeat until no improving pattern remains or a safety limit is reached.
5. **HiGHS integer master problem** on the generated columns to produce the final cutting plan.
6. **Internal exact state-search fallback** for bounded cases if HiGHS is unavailable.
7. **BFD fallback** if no advanced solver path is available.

## Objective

Demand is fulfilled **exactly**. The objective is lexicographic:

1. minimize total raw material / total waste,
2. then minimize number of bars.

For exact demand, useful cut length is constant, so minimizing total raw length is exactly equivalent to minimizing total chute.

## Multiple raw lengths

Raw lengths remain fully dynamic and can be mixed in one solution. No 6 m / 12 m / 15 m or other length is hardcoded.

## Correct optimization status

- `OPTIMAL`: global optimum is actually proven (complete pattern universe + optimal MILP, or bounded internal exhaustive fallback).
- `FEASIBLE`: advanced Column Generation + MILP produced the best validated plan found, but global integer optimality is not falsely claimed without branch-and-price.
- `HEURISTIC`: BFD fallback.

This distinction is intentional and avoids reporting a mathematical guarantee that was not proven.

## New dependency

API package:

```json
"highs": "^1.14.0"
```

HiGHS is a modern LP/MILP optimizer compiled to WebAssembly. The optimization integration is isolated in `highs-cutting-solver.ts`; domain/UI code does not depend directly on HiGHS.

## Files changed / added

### Added

- `api/src/faconnage/highs-cutting-solver.ts`

### Updated

- `api/src/faconnage/cutting-optimizer.ts`
- `api/src/faconnage/faconnage.types.ts`
- `api/src/faconnage/faconnage.service.ts`
- `api/test/faconnage.optimizer.test.ts`
- `api/package.json`
- `web/features/auth/auth-client.ts`

## Diagnostics

The API now records solver diagnostics for audit/troubleshooting:

- solver (`HIGHS` or internal fallback),
- method,
- number of generated patterns,
- Column Generation iterations,
- whether Column Generation converged,
- whether all patterns were enumerated,
- solve time.

These are backend diagnostics; the business UI continues to show simple labels such as `Solution optimale`, `Très bonne solution`, and `Solution rapide`.

## No scope creep

Still intentionally **not implemented** in this version:

- stock quantities,
- warehouse,
- supplier,
- kerf,
- reusable remnants,
- minimum reusable chute,
- machine constraints,
- raw material purchase cost.

The optimizer architecture remains extensible for those future constraints.

## Validation performed in this environment

Because the uploaded archive contains only `apps/api` and `apps/web` rather than the complete NIM workspace, the full monorepo build cannot be run here.

The modified TypeScript files were syntax-transpiled successfully. The internal fallback optimizer was executed against known cases and verified for:

- zero-waste exact plan,
- mixed raw lengths,
- exact quantity fulfillment,
- bar-count tie-break after equal waste/raw length.

After restoring these apps into the complete NIM workspace, run:

```bash
pnpm install
pnpm --filter @nim/api typecheck
pnpm --filter @nim/api test
pnpm --filter @nim/api build
pnpm --filter @nim/web typecheck
pnpm --filter @nim/web test
pnpm --filter @nim/web build
```

No database migration is required for this solver upgrade.
