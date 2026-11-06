# NIM Production API

NestJS modular-monolith foundation with strict TypeScript, validated configuration, a public health endpoint, Swagger at `/docs`, Prisma/PostgreSQL persistence, and session-based authentication.

## Local development

1. Copy `.env.example` to `.env` and set your local PostgreSQL connection and seed credentials.
2. Ensure the local PostgreSQL service is running on port `5432`.
3. Run `pnpm --filter @nim/api prisma:generate`.
4. Run `pnpm --filter @nim/api exec prisma migrate dev --name local_setup`.
5. Run `pnpm --filter @nim/api prisma:seed`.
6. Run `pnpm --filter @nim/api dev`.

Docker Compose remains available as an optional PostgreSQL alternative for environments without a local PostgreSQL installation.

Authentication routes are `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, and `POST /auth/change-password`. Passwords use Argon2id; session tokens are stored only as SHA-256 hashes. Login, logout, password changes, and failed logins write history events.

Piece and machine detail routes expose persisted unit traceability, active queues, and scoped history. Tekla imports support CSV, XLS and XLSX with server-side preview validation and transactional piece/unit creation. Uploaded workbooks are parsed in memory and are not retained; per-piece and import-summary audit events are preserved. The import maps Repère, Profil, Qté, Qualité, Long., Poids, Pds Tot and Désignation, while Surface is intentionally ignored. Authenticated Socket.IO realtime invalidates REST-backed views after committed production, assignment, and quality events. Offline conflict handling remains a later domain phase.

User management is intentionally not public registration. Administrators use the `/users` API and web page to create accounts, assign one of the four roles, update roles, deactivate/reactivate accounts, and reset passwords. Every account action is authorized server-side and written to history.

Piece planning is available through `/pieces`. Authenticated users can read pieces; administrators and production managers can create/update/archive them. Creating a piece transactionally creates its unit rows, and all mutations write append-only history events.

Unit-level assignments are available through `/assignments`. Authenticated users can read the active board; administrators and production managers can assign, reassign, and remove units. Maintenance/inactive machines and duplicate active assignments are rejected server-side, while previous assignments remain persisted for traceability. Production and Quality are persisted unit-level workflows, dashboard overview metrics are served through `/dashboard/overview`, piece and machine detail routes expose persisted traceability, completion uses optimistic concurrency checks, and Tekla CSV/XLS/XLSX imports use preview validation plus transactional piece/unit saves without retaining source workbooks or filenames. Authenticated Socket.IO realtime is available for committed production, assignment, and quality events; offline conflict handling and broker-backed scaling remain later domain phases.
