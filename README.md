# NIM Production

Industrial production-management and real-time traceability platform for **La Nouvelle Industrie Des Métaux (NIM)**.

## Stack

- Next.js + React + strict TypeScript
- Tailwind CSS + shadcn/ui + Lucide
- NestJS + PostgreSQL + Prisma
- TanStack Query / Table
- WebSocket realtime
- PWA + IndexedDB later
- Docker

## Core domain

`Piece -> PieceUnit -> Assignment -> ProductionOperation -> QualityControl -> HistoryEvent`

## Read first

1. docs/PRODUCT_REQUIREMENTS.md
2. docs/DOMAIN_MODEL.md
3. docs/STATE_MACHINE.md
4. docs/PERMISSIONS.md
5. docs/ARCHITECTURE.md
6. docs/DATABASE.md
7. docs/API.md
8. docs/UX_FLOW.md
9. docs/DESIGN_SYSTEM.md
10. docs/SECURITY.md
11. docs/REALTIME.md
12. docs/OFFLINE_STRATEGY.md
13. docs/TESTING.md
14. docs/DEPLOYMENT.md
15. docs/ROADMAP.md
16. docs/CODING_RULES.md
17. docs/SCREEN_INVENTORY.md
18. docs/OPEN_QUESTIONS.md
19. docs/MASTER_BUILD_PROMPT.md

The latest cross-platform UI/UX findings and prioritized follow-up work are documented in [docs/UI_UX_AUDIT.md](docs/UI_UX_AUDIT.md).

## Non-negotiable rules

- Never trust client-side authorization.
- Never store plaintext passwords.
- Never erase production history.
- Operators are not permanently attached to machines.
- Quantity > 1 must support unit-by-unit progression.
- Reassignment must preserve previous assignments.
- Machines in maintenance cannot receive new assignments.
- Realtime events are emitted only after DB commit.

## Current implementation

Piece and machine detail views read persisted unit traceability, active assignments, machine queues, and scoped history. The `/pieces` workbench presents Repère, detailed profile, quantity, quality, length, unit/total weight, designation, traceability progress, profile/status/priority filters, pagination, selection, and audited row actions. Production managers and administrators can add/edit/duplicate pieces in a responsive side sheet and preview/commit CSV, Tekla HTML `.xls`, and `.xlsx` imports. The server reports recognized source-column mappings, explicitly marks Surface as ignored, flags invalid rows and weight discrepancies, and commits each valid batch with its units and append-only audit events in one transaction. `/pieces/faconnage` calculates outstanding unit demand (including remakes but excluding assigned, completed, and rework units), then optimizes user-selected standard bar lengths using measured saw kerf and records the estimate in history. It reports required bar counts without tracking or reserving on-hand stock. The manager dashboard includes shadcn-style Recharts visualizations backed by persisted machine, order, unit, priority, quality, and due-date metrics. `/planning` shows all Affaires by default and lets the user filter to one; unscheduled assigned bars are grouped by Affaire, machine, and profile. Each bar keeps its existing machine assignment and receives its own planned event. Day/week/month calendar views, lead/helper selection, maintenance and machine-block events, and PostgreSQL machine/operator conflict protection support follow-up. An Affaire-scoped route opens directly in that Affaire, while machine routes retain the machine context. Planned events remain separate from live MachineSession and ProductionRun records. Authenticated Socket.IO realtime publishes planning changes after commit alongside production, assignment, and quality events, while offline conflict resolution and broker-backed horizontal scaling remain explicit future domains.

The repository now includes the pnpm monorepo foundation, a Next.js application shell, and a NestJS/Prisma/PostgreSQL API. Authentication, admin user management, machine administration, piece planning, unit-level assignments, unit-level production execution, unit-level quality control, authenticated piece-photo galleries, traceability history, and role-protected dashboard metrics are server-backed with validation, persistence, responsive states, and audit history. The profile password-change flow is also connected to the secured API.

### Local setup

The manager dashboard includes server-validated daily production and quality trends backed by persisted operations and controls.

Requirements: Node.js 20+, pnpm 9+, and a local PostgreSQL 16+ installation. Docker Compose is optional.

```powershell
pnpm install
Copy-Item apps/api/.env.example apps/api/.env
pnpm --filter @nim/api prisma:generate
pnpm --filter @nim/api exec prisma migrate dev --name local_setup
pnpm --filter @nim/api prisma:seed
pnpm dev
```

Web: `http://localhost:3000/login` · API health: `http://localhost:4000/health` · Swagger: `http://localhost:4000/docs`

The seed creates the local administrator from `apps/api/.env` (`SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`, and `SEED_ADMIN_DISPLAY_NAME`). Authentication, admin user management, machine management, piece planning, unit-level assignments, production execution, quality validation, traceability history, and dashboard metrics use PostgreSQL sessions, Argon2id password hashes, server-side guards, role assignment, persisted piece units, production and quality records, preserved assignment history, and append-only history events.

Required checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm build`.

Browser E2E setup: run `pnpm exec playwright install chromium` once, then `pnpm e2e`. The suite reuses the local API and web servers when they are running and reads admin credentials from `E2E_ADMIN_USERNAME`/`E2E_ADMIN_PASSWORD` or the local seed environment without printing them.

The operator tablet flow uses the existing application `User` with the `OPERATOR` role—there is no parallel operator account. Administrators create and manage those accounts in `/users`; production managers can manage tablet keys for existing operator users. The tablet has its own short-lived authentication session, while machine teams, production runs, and history all reference the same User ID. See [apps/UPDATE_OPERATORS_PRODUCTION.md](apps/UPDATE_OPERATORS_PRODUCTION.md) and apply pending migrations with `pnpm --filter @nim/api exec prisma migrate deploy` (never reset the database).
