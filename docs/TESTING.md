# Testing

## Unit

Invalid state transitions, maintenance blocking assignment, reassignment history, quantity progression, duplicate completion rejection, delay calculation, quality sequencing, permission mapping.

Phase 2A planning coverage validates event schemas, Tunis/UTC conversion, machine assignment guards, machine and operator overlap rejection, concurrent competing reservations through the transaction-lock path, post-commit realtime publication, append-only cancellation after a real run starts, Affaire-scoped board data, and the rule that a scheduled bar cannot be unassigned until its slot is cancelled. The Affaire day lookup validates actual calendar dates, uses Africa/Tunis day boundaries, and returns only active planned reservations for the selected Affaire. Batch preview tests assert that conflicts identify their blocking machine/operator and existing event interval. Affaire-wide scheduling tests cover deterministic preview slots, visible conflicts, all-or-nothing creation with per-bar audit records, post-commit publication, and competing requests for the same bar. Frontend coverage checks selecting an Affaire, showing its existing reservations for the chosen date, grouping unscheduled bars by machine/profile, bulk preview and one-action submission while retaining individual event records, day/week/month navigation, date/time selection, and fixed Affaire/machine contexts. Façonnage optimization also has regression coverage proving that catalogue profile normalization matches legacy piece names even when their whitespace differs. Service tests use a transaction-aware Prisma mock; the final PostgreSQL migration deploy and dedicated-database integration check should be run separately from production data.

## Integration

Auth, disabled-user rejection, guards, transactions, assignment, production, history creation, quality validation.

## E2E

The Playwright suite in `e2e/` runs against the real Next.js app, NestJS API, and PostgreSQL-backed session. The Offer workspace is the root of the production workflow; create pieces, imports, photos, and cutting plans through an Offer-scoped route (`/offers/:offerId/...`). `/pieces` is a compatibility redirect, not the piece-management entry point. The suite verifies:

- Admin UI login, session refresh, and role-aware navigation.
- Anonymous rejection from the admin-only `/users` API boundary.
- Authenticated access to the primary admin-facing pages, including the Offer workspace.
- Users, machines, Offers, and assignments management dialogs without mutating production data.
- Offer creation through the UI and persistence through the Offer API.
- Planning navigation across week/month, selection of an Affaire and calendar date, machine/profile bar grouping, opening an Affaire-scoped Planning view, and absence of server errors during the tested flow.
- Initial Planning date uses the earliest active event for the current Affaire or machine, or the global earliest event; empty schedules fall back to today.
- The day/week Planning timeline hides machines without matching events by default and can reveal all machines on demand.

The web component suite also verifies right-side Sheet behavior for user, machine, assignment, and quality forms; the pieces table fields and filters; accessible unit progress; manual Sheet validation and computed total weight; the import file/column/row preview including ignored Surface and warnings; exact profile-family selection; and the Façonnage preparation and raw-bar estimate flow. The API suite verifies Tekla header mapping metadata, row validation, ignored Surface behavior, transactional piece import/preparation history, outstanding-unit demand (including remake but excluding rework), server-authoritative optimization demand, kerf-aware fit/loss, and audit persistence.

Install the browser runtime once, then run:

```powershell
pnpm exec playwright install chromium
pnpm lint:e2e
pnpm typecheck:e2e
pnpm e2e
```

The suite reads `E2E_ADMIN_USERNAME` and `E2E_ADMIN_PASSWORD` when supplied. For local development it falls back to the existing `SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD` values in `apps/api/.env`; credentials are never printed. The Playwright config reuses running services or starts the API and web dev servers when they are not already available.

The role-boundary E2E suite verifies manager/operator/quality-controller permissions and isolation of pieces and duplicate references across two Offers. Full cutting-plan approval → assignment → production → quality browser coverage remains a follow-up. Run database-writing browser tests only against a dedicated local/test database after applying migrations; never against production data.

CI: lint + typecheck + unit/integration tests + E2E + production build.

Manual multi-length piece entry is covered for per-length quantity/weight calculations, generated unique references, one persisted piece per row, per-piece history, server-side batch limits, and duplicate-reference rejection before the transaction can complete.
