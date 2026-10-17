# Machines and Bar Assignments

## Delivered

- Persisted each approved cutting-plan bar and its exact PieceUnit membership.
- Added Offer-scoped bar list/detail and bulk machine-assignment APIs and screens.
- Connected bar assignments to the existing unit-level `Assignment` rows so the existing production queue remains authoritative.
- Added safe unassignment before production and soft cancellation of unassigned shaped bars.
- Added machine bar counts, current bar details, fabrication KPIs, and a persisted fabrication timestamp.
- Kept machine changes and bar transitions audited; assignment history is retained and constrained to one active assignment per bar.
- Added Offer workspace tabs for Barres and Affectations, with responsive table/card layouts, confirmation dialogs, and loading/error/empty states.

## Database and migration

Migration: `apps/api/prisma/migrations/20261015100000_cutting_bars_assignments/migration.sql`.

It adds the `FACONNEE` PieceUnit status, `CuttingBarStatus`, `CuttingBar`, `CuttingBarItem`, `MachineBarAssignment`, `Assignment.barAssignmentId`, the `fabricatedAt` timestamp, foreign keys, and partial unique indexes. It is additive and does not delete or rewrite existing rows. Existing approved plans are not auto-backfilled: they may already have piece assignments or changed demand, so silently reconstructing bar membership would risk misrepresenting production. Those offers keep the previous piece-level assignment route; a manager can use a newly generated/approved plan for persisted bar tracking.

## Business rules and transitions

- Approved plan: eligible PieceUnits `PENDING → FACONNEE`; generated bars start `FACONNEE`.
- Bulk assignment: all bars must belong to the route Offer, be `FACONNEE`, have eligible member units, and target an `ACTIVE` machine. The transaction updates every selected bar/unit or none, creates machine assignment history and standard production-queue assignments, and writes history events.
- Production start: the first member unit moves the bar `AFFECTEE → LANCEE`.
- Fabrication completion: when all active member units have finished fabrication, the bar moves `LANCEE → FABRIQUEE` and records `fabricatedAt`.
- Unassignment: allowed only while the bar is `AFFECTEE`; closes assignment records and returns units to `FACONNEE`.
- Cancellation: allowed only while the bar is unassigned and `FACONNEE`; closes bar memberships, returns units to `PENDING`, and keeps the canceled bar and history.
- `LANCEE`, `FABRIQUEE`, or otherwise production-started bars cannot be unassigned or canceled.
- Only administrators and production managers can assign, unassign, or cancel. Reads require authentication; route and Offer isolation are enforced in the API.
- Legacy piece-unit assignment writes remain compatible for Offers without cutting-bar history. Once bar tracking exists for an Offer, its new assignments must use the bar flow, and linked units cannot be individually reassigned or removed.

## Routes

- `GET /offers/:offerId/bars`
- `GET /offers/:offerId/bars/:barId`
- `GET /offers/:offerId/bar-assignments`
- `POST /offers/:offerId/bar-assignments`
- `POST /offers/:offerId/bars/:barId/unassign`
- `DELETE /offers/:offerId/bars/:barId`
- `GET /machines` includes active `assignedBarCount`.
- `GET /machines/:id` includes current bars plus assigned, in-progress, fabricated-today, and historical fabricated counts.

## Frontend routes

- `/offers/:offerId/bars`
- `/offers/:offerId/bars/:barId`
- `/offers/:offerId/bar-assignments`
- `/machines` and `/machines/:id` include bar assignment summaries.

The Offer tabs and sidebar nested routes expose Barres and Affectations. Successful writes invalidate Offer bars/overview, machines, unit assignments, production summaries, dashboard, and history queries.

## Security, consistency, and audit

Zod validates and bounds request bodies, server guards enforce roles, and all queries/mutations scope bars by `offerId`. Prisma serializable transactions, conditional status updates, and PostgreSQL partial unique indexes protect against concurrent assignment. Realtime events are emitted only after the transaction commits. No history row or started bar is hard-deleted.

## Tests and verification

Added API tests for duplicate selection, Offer isolation, bar/unit assignment, post-start unassignment rejection, cancellation with unit release, machine bar metrics, plan-approval integration and post-commit event emission, and legacy unit-assignment guards. Updated existing responsive UI tests for Offer navigation, bar empty states, and machine details.

Run from the workspace root:

```powershell
pnpm --filter @nim/api prisma:validate
pnpm --filter @nim/api prisma:generate
pnpm --filter @nim/api exec prisma migrate deploy
pnpm --filter @nim/api typecheck
pnpm --filter @nim/api test
pnpm --filter @nim/api lint
pnpm --filter @nim/api build
pnpm --filter @nim/web typecheck
pnpm --filter @nim/web test
pnpm --filter @nim/web lint
pnpm --filter @nim/web build
```
