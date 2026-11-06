# Testing

## Unit

Invalid state transitions, maintenance blocking assignment, reassignment history, quantity progression, duplicate completion rejection, delay calculation, quality sequencing, permission mapping.

## Integration

Auth, disabled-user rejection, guards, transactions, assignment, production, history creation, quality validation.

## E2E

The Playwright suite in `e2e/` runs against the real Next.js app, NestJS API, and PostgreSQL-backed session. The Offer workspace is the root of the production workflow; create pieces, imports, photos, and cutting plans through an Offer-scoped route (`/offers/:offerId/...`). `/pieces` is a compatibility redirect, not the piece-management entry point. The suite verifies:

- Admin UI login, session refresh, and role-aware navigation.
- Anonymous rejection from the admin-only `/users` API boundary.
- Authenticated access to the primary admin-facing pages, including the Offer workspace.
- Users, machines, Offers, and assignments management dialogs without mutating production data.
- Offer creation through the UI and persistence through the Offer API.

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
