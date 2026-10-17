# NIM workflow enhancement — implementation report

Date: 2026-10-16

## Phase delivered: safe incremental Façonnage validation

- Cutting plans now persist each proposed bar separately, including its cut pattern and exact `PieceUnit` allocation. Selected proposals alone become `CuttingBar` records.
- Validation is Offer-scoped and protected by server role guards, current-state checks, Offer/plan row locks, conditional proposal claiming, unique proposal-to-bar links, and the active-bar unit constraint. A concurrent or stale request receives a conflict instead of double materializing units.
- A plan can move from `DRAFT` to `PARTIALLY_VALIDATED` and later to `VALIDATED`. Draft/partial plans can be cancelled; cancellation affects only proposed remainder and preserves materialized bars and history.
- `READY` Offers can prepare and optimize remaining eligible pending units. Façonnage remains blocked after production starts; Piece creation/edit/import restrictions remain unchanged.
- Offer status transitions and overview plan metrics recognize the new plan statuses. The Façonnage result lets a manager select individual bars, displays their exact cut patterns, and offers a shadcn confirmation before cancelling a plan remainder.
- Existing materialized bars are backfilled as validated proposals. Existing saved draft patterns are backfilled with stable pending-unit associations where matching units are available.

## Database migration

Added:

- `apps/api/prisma/migrations/20261016100000_cutting_plan_proposals/migration.sql`
- `apps/api/prisma/migrations/20261016100100_migrate_approved_cutting_plans/migration.sql`

Both migrations are additive/backfill-oriented; no production rows or audit events are hard-deleted. They were applied to the configured local PostgreSQL database with `pnpm --filter @nim/api exec prisma migrate deploy`; a subsequent `prisma migrate status` confirmed the schema is up to date.

## Files changed

- `apps/api/prisma/schema.prisma` and the two migrations above
- `apps/api/src/faconnage/faconnage.service.ts`
- `apps/api/src/faconnage/faconnage.controller.ts`
- `apps/api/src/cutting-bars/cutting-bars.service.ts`
- `apps/api/src/pieces/pieces.service.ts`
- `apps/api/src/offers/offers.service.ts`
- `packages/types/src/index.ts`
- `apps/web/features/auth/auth-client.ts`
- `apps/web/features/pieces/faconnage-optimization-panel.tsx`
- `apps/web/features/pieces/faconnage-preparation-view.tsx`
- `apps/api/test/faconnage.service.test.ts`
- `apps/api/test/cutting-bars.service.test.ts`
- `apps/api/test/pieces.service.test.ts`
- `apps/api/test/offers.service.test.ts`
- `apps/web/test/ui-components.test.tsx`
- `apps/UPDATE_OFFERS_WORKSPACE.md`
- `docs/API.md`, `docs/DATABASE.md`, `docs/STATE_MACHINE.md`, `docs/UX_FLOW.md`, `docs/SCREEN_INVENTORY.md`

## Verification

- Prisma schema validation: passed.
- API and web typecheck: passed.
- Repository lint: passed.
- API tests: 105 passed across 21 files.
- Focused Façonnage selection UI test: passed.
- API production build: passed.
- Web production build: passed.
- Running app smoke check: `GET /login` and `GET /health` both returned HTTP 200.
- Full web test suite: not clean; 11 failures remain in the broader UI component suite (including missing `TooltipProvider` test wrappers and duplicate planning-calendar test IDs). These are outside the files changed for this workflow phase; the focused Façonnage test passes.
- Prisma client generation reported `EPERM` while Windows tried to replace `query_engine-windows.dll.node` with the API process running. The generated Prisma DMMF was checked and contains both proposal models; schema validation, typechecks, builds, migrations, and API health passed. Re-run generation after a controlled API restart if further schema changes are made.

## Remaining roadmap from the broader brief

Not implemented in this phase: safe import-batch deletion; piece bulk actions and mixed production-status summaries; server-side Bars/Production pagination and URL filters; Production list/overview redesign and operational charts; shared table modernization across the app; app-wide status-badge normalization; broader responsive audit and remaining per-page refinements. These should be separate phases with their own tests and end-of-phase checks, as required by `AGENTS.md`.
