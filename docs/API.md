# API Outline

## Health and readiness

GET `/health` is a public liveness probe and returns when the API process is serving requests. GET `/health/ready` is a public readiness probe; it performs a lightweight PostgreSQL query and returns HTTP 503 with a stable `DATABASE_UNAVAILABLE` code if the database cannot be reached. Neither endpoint exposes connection details.

## Implemented authentication

The API uses an HttpOnly `nim_session` cookie. The browser sends it with `credentials: include`; the client never stores the raw token in application state.

| Method | Route                   | Access        | Purpose                                                                                                                 |
| ------ | ----------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/login`           | Public        | Validates credentials, creates a session, and records `AUTH_LOGIN`.                                                     |
| GET    | `/auth/me`              | Authenticated | Returns the public user profile and role.                                                                               |
| POST   | `/auth/logout`          | Authenticated | Revokes the current session and records `AUTH_LOGOUT`.                                                                  |
| POST   | `/auth/change-password` | Authenticated | Validates the current password, updates the Argon2id hash, revokes other sessions, and records `AUTH_PASSWORD_CHANGED`. |

Authentication and role checks are enforced by Nest guards on the server. UI visibility is only a convenience and is never an authorization boundary.

## Offer façonnage plans

`POST /offers/:offerId/faconnage/optimize` — ADMIN or PRODUCTION_MANAGER; persists a draft plan, per-bar proposals, exact proposed PieceUnit membership, and an audit event.
`GET /offers/:offerId/faconnage/plans` and `GET /offers/:offerId/faconnage/plans/:planId` — scoped persisted plan/proposal views.
`POST /offers/:offerId/faconnage/plans/:planId/validate` — body `{ "proposalIds": string[] }`; transactionally materializes only selected proposals and returns the validated/remaining bar counts.
`POST /offers/:offerId/faconnage/plans/:planId/cancel` — soft-cancels a draft or the unvalidated remainder of a partial plan; already materialized bars are preserved.

All four endpoints use the existing manager/admin controller guard. Validation serializes on Offer and plan rows, checks material revision and current PieceUnit availability, and writes history before publishing realtime after commit. Façonnage preparation/optimization accepts `DRAFT` and `READY`, but not `IN_PRODUCTION` or terminal Offers.

Optimization runs the solver before opening its write transaction. Plan/proposal persistence, availability recheck, and the history event remain atomic; the transaction allows up to 30 seconds for large valid plans instead of Prisma's 5-second default.

## Auth

POST /auth/login
POST /auth/logout
GET /auth/me
POST /auth/change-password

## Settings and notifications

GET /settings — Authenticated; returns persisted per-user display/activity preferences, with safe defaults for a new account.
PATCH /settings — Authenticated; validates and persists preferences and records `SETTINGS_UPDATED`.
GET /notifications — Authenticated; returns role-scoped recent activity projected from append-only history events.

## Users

GET /users — ADMIN or PRODUCTION_MANAGER; managers receive only users whose role is `OPERATOR`.
POST /users — ADMIN; creates a user and records `USER_CREATED`
PATCH /users/:id — ADMIN; changes display name or role
POST /users/:id/disable — ADMIN; revokes sessions and records `USER_DISABLED`
POST /users/:id/reactivate — ADMIN; records `USER_REACTIVATED`
POST /users/:id/reset-password — ADMIN; revokes sessions and records `USER_PASSWORD_RESET`

There is no public self-registration. New accounts are created by an administrator so every account has an explicit business role and audit actor.

## Machines

`GET /machines/:id` returns an authenticated machine detail with its persisted unit queue, active operation count, currently associated bars, and derived bar metrics (`assigned`, `inProgress`, `fabricatedToday`, `fabricatedTotal`). `GET /machines/:id/queue` exposes the queue projection for queue-focused clients. `GET /machines` includes an `assignedBarCount` derived from active machine-bar assignment records.

GET /machines — Authenticated
POST /machines — ADMIN or PRODUCTION_MANAGER
PATCH /machines/:id — ADMIN or PRODUCTION_MANAGER
POST /machines/:id/maintenance — ADMIN or PRODUCTION_MANAGER
POST /machines/:id/reactivate — ADMIN or PRODUCTION_MANAGER
POST /machines/:id/deactivate — ADMIN or PRODUCTION_MANAGER

## Cutting bars and machine assignments

Validating selected Offer-scoped cutting-plan proposals persists only the chosen `CuttingBar` records and links each to its exact proposed `PieceUnit` set. Selected units move from `PENDING` to `FACONNEE` in the same transaction. Existing approved plans are backfilled as fully validated proposals by the additive migration.

GET `/offers/:offerId/bars` and GET `/offers/:offerId/bars/:barId` are authenticated and strictly Offer-scoped. The bar list accepts validated `page` (default 1), `pageSize` (10/20/50), `search`, `status`, and `profile`; details and memberships are loaded only for the requested page. It returns total/status counts, profile facets, and pagination metadata. GET `/offers/:offerId/bar-assignments` returns that Offer’s unassigned shaped bars and its active machine assignments.

GET `/offers/:offerId/bar-summary` is an authenticated, Offer-scoped aggregate projection for overview counters. It groups bar counts by status in the database and does not load bar memberships; use `/bars` only when the UI needs bar details.

POST `/offers/:offerId/bar-assignments` (ADMIN or PRODUCTION_MANAGER) accepts `{ machineId, barIds }` and atomically validates the Offer, active machine, all bar ownership/status, unique selection, and every member PieceUnit. It moves bars `FACONNEE → AFFECTEE`, creates historical `MachineBarAssignment` rows, and creates the existing unit-level `Assignment` rows consumed by the production queue. History events are committed with the state changes; realtime events, where enabled, are emitted after commit.

POST `/offers/:offerId/bars/:barId/unassign` (ADMIN or PRODUCTION_MANAGER) closes assignment history and returns an unstarted bar and its units to the shaped state. It is rejected once the bar has started production. DELETE `/offers/:offerId/bars/:barId` is a soft cancellation only for an unassigned `FACONNEE` bar: memberships are closed, its units return to `PENDING`, and history is retained. No audit or assignment history is hard-deleted.

Production start moves an assigned bar `AFFECTEE → LANCEE`; when all of its member units have completed fabrication, the bar moves to `FABRIQUEE` and stores `fabricatedAt` for reliable daily machine metrics. These bar transitions are derived from existing production operations and do not add an operator login/tablet workflow.

## Offers (workflow root)

An Offer owns its pieces, imports, cutting plans, production summary, and traceability context. Offer creation and updates are restricted to `ADMIN` and `PRODUCTION_MANAGER`; the API validates lifecycle transitions and writes history in the same transaction. Archive preserves its full history; permanent deletion is limited to an empty draft and administrators.

`GET /offers` and `GET /offers/:id` provide the workspace list and detail. The list accepts validated `page` (default 1; pageSize 10/20/50), `search`, `status`, `clientName`, `site`, and `includeArchived` filters; filtering/counting and page selection are applied in PostgreSQL and the response includes pagination metadata plus client/site facets. `POST /offers` creates an isolated offer. `PATCH /offers/:id` updates editable fields or requests a guarded status transition. `POST /offers/:id/archive` and `/restore` preserve and restore records. `DELETE /offers/:id` only removes an empty draft.

Offer detail metrics use database aggregation for piece rows, quantities, profile families, and manufactured units; the response does not load every PieceUnit just to calculate the summary. The detail query preserves the validated/partial/approved plan precedence and returns only the five most recent plan summaries.

Offer-scoped piece, import, image, and cutting-plan routes use `/offers/:offerId/pieces`, `/offers/:offerId/pieces/import/...`, `/offers/:offerId/pieces/:pieceId/images/...`, and `/offers/:offerId/faconnage/...`. `GET /offers/:offerId/pieces` uses the same validated pagination/filter contract as `GET /pieces` and scopes results and profile options to that Offer. The server verifies the parent Offer for every scoped operation; identical piece references may exist in different Offers without crossing data boundaries. The legacy `/pieces` routes remain compatibility endpoints and mutations must identify their `offerId`; new workflows should use Offer-scoped routes.

## Pieces

Manual piece creation requires a positive unit weight; the API calculates and stores total weight from unit weight multiplied by quantity. Existing records may retain unknown legacy weights. Tekla XLS/XLSX rows require numeric unit and total weights; the source total is preserved and discrepancies above 0.05 kg are flagged. CSV remains backward-compatible with the existing lighter-weight import format. Binary workbooks scan for the first worksheet with matching business headers rather than assuming the first tab contains the data.

`GET /pieces/:id` returns the piece, every PieceUnit, current machine/operator, active assignment, timestamps, and quality result.

The same response includes the ordered `images` gallery. `GET /pieces/:pieceId/images/:imageId` streams an authenticated JPEG, PNG, or WebP image; files are never exposed through an unguarded public URL.

GET /pieces — Authenticated; returns production-piece summaries with unit progress. Supports validated `page` (default 1), `pageSize` (default 20, maximum 100), `search` (reference/profile/quality/designation, maximum 80 characters), and exact `profile` filters. Returns `{ pieces, profiles, page, pageSize, total, totalPages }`; database filtering and pagination are applied before rows and unit summaries are loaded.
POST /pieces — ADMIN or PRODUCTION_MANAGER; validates and creates a piece plus its persisted PieceUnit rows, then records `PIECE_CREATED`.
PATCH /pieces/:id — ADMIN or PRODUCTION_MANAGER; updates editable planning fields, increments the version, and records `PIECE_UPDATED`.
POST /pieces/:id/archive — ADMIN or PRODUCTION_MANAGER; archives eligible pieces without deleting units or history and records `PIECE_ARCHIVED`.

Piece references are normalized to uppercase and unique. Archived pieces and pieces already assigned or in fabrication cannot be edited/archived again. Quantity is bounded server-side and every created unit receives a unique sequence number inside the same database transaction.

`POST /pieces/:id/images` — ADMIN or PRODUCTION_MANAGER; accepts one multipart `file` (JPEG, PNG, or WebP, maximum 5 MB), validates both the declared MIME type and file signature, stores the binary under `MEDIA_ROOT`, persists metadata, and records `PIECE_IMAGE_ADDED` in the same database transaction. A piece supports at most 10 images.

`DELETE /pieces/:pieceId/images/:imageId` — ADMIN or PRODUCTION_MANAGER; removes the image metadata and binary without deleting its append-only `PIECE_IMAGE_REMOVED` history event. Archived pieces cannot receive or remove images.

`POST /pieces/import/preview` and `POST /pieces/import` are restricted to ADMIN and PRODUCTION_MANAGER. They accept CSV, Tekla HTML `.xls`, and binary `.xls`/`.xlsx` payloads (`encoding: text|base64`). Tekla imports require Repère, Profil, Qté, Qualité, Long., Poids, Pds Tot, and Désignation; Surface is intentionally ignored. The preview returns `columns` metadata (`sourceHeader`, canonical `field`, display `label`, and `ignored`) so the UI can show the detected mapping and intentional omissions. Preview detects duplicate/existing references, validates localized numbers, reports row-level errors and weight discrepancy warnings without persistence. Commit revalidates and transactionally creates an ImportBatch, pieces, units, and one `PIECE_IMPORTED` event per row. Imports are limited to 1000 rows and 5 MB.

`GET /pieces/profiles` is restricted to ADMIN and PRODUCTION_MANAGER and returns exact profiles with outstanding cutting demand, grouped into IPE, HEA, UPN, L, ROND, or OTHER. Classification is strict: a value such as `DEMI-IPE400` remains OTHER rather than being silently treated as IPE. Demand is counted from eligible `PieceUnit` rows, not the original piece quantity: pending, unassigned units with no production operation, plus units whose latest non-conformance disposition is REMAKE. Already assigned/produced units and REWORK units are excluded.

`POST /pieces/faconnage/prepare` is restricted to ADMIN and PRODUCTION_MANAGER. It validates selected exact profile strings, aggregates eligible units by profile and length, returns `FaconnageRequirement[]`, and records `FACONNAGE_PREPARATION_CREATED`.

`POST /faconnage/optimize` is restricted to ADMIN and PRODUCTION_MANAGER. The request supplies only each selected profile, candidate standard raw lengths, and the measured saw kerf in millimetres; the API re-reads eligible unit demand from PostgreSQL and ignores any client-supplied quantities. It returns the cutting patterns and required bar counts, subtracts the configured kerf for every piece cut, and records the demand, compact plan, solver diagnostics, and actor in `FACONNAGE_OPTIMIZATION_EXECUTED`. NIM does not record on-hand raw-bar quantities or reserve/consume stock; the result is a point-in-time requirement estimate, not a released shop order.

## Assignments

GET /assignments — Authenticated; returns active assignments and pending units available for assignment.
POST /assignments — ADMIN or PRODUCTION_MANAGER; assigns one PieceUnit to an active machine and records `ASSIGNMENT_CREATED`.
POST /assignments/:id/reassign — ADMIN or PRODUCTION_MANAGER; closes the old assignment, creates a replacement, and records `ASSIGNMENT_REASSIGNED`.
POST /assignments/:id/unassign — ADMIN or PRODUCTION_MANAGER; closes the assignment, returns the unit to the pending queue, and records `ASSIGNMENT_UNASSIGNED`.

Assignments are unit-level so a quantity can be split across machines without losing traceability. The server rejects maintenance/inactive machines, duplicate active assignments, archived/completed pieces, and reassignment or unassignment of units already in fabrication.

The legacy unit-assignment write path remains for Offers without bar records. Once an Offer has bar tracking, new assignments must use the bar-level endpoint; unit assignments linked to a bar cannot be individually reassigned or removed, preventing one bar from being split across machines.

## Production

GET /production/current?machineId=:id — ADMIN, PRODUCTION_MANAGER or OPERATOR; returns the authenticated operator's active operation and the selected machine's assigned queue.
POST /production/start — ADMIN, PRODUCTION_MANAGER or OPERATOR; starts an assigned PieceUnit on its active machine, persists the operator and machine, moves the unit to `IN_PROGRESS`, and records `PRODUCTION_STARTED`.
POST /production/:operationId/unit-complete — ADMIN, PRODUCTION_MANAGER or OPERATOR; completes one operation, moves its unit to `QUALITY_PENDING`, and records `PRODUCTION_COMPLETED`.
POST /production/:operationId/complete — ADMIN, PRODUCTION_MANAGER or OPERATOR; equivalent completion endpoint for the finish action.

The server rejects maintenance/inactive machines, units not assigned to the selected machine, duplicate active operations, concurrent operations by one operator, invalid state transitions, and completion by another operator unless the actor is an administrator or production manager. Pause/resume remains intentionally undefined until the business decision in `OPEN_QUESTIONS.md` is resolved.

## Quality

### Non-conformance lifecycle (implemented)

`POST /quality/:pieceUnitId/disposition` (ADMIN or PRODUCTION_MANAGER) accepts `REWORK`, `REMAKE`, `SCRAP`, or `DEVIATION` with a required reason for the latest rejected inspection. Rework/remake return the unit to production with a new quality cycle; scrap is terminal; deviation creates a pending approval request.

`POST /quality/dispositions/:dispositionId/decision` (ADMIN) approves or rejects a pending deviation. Approval accepts the unit and rejection preserves its rejected state.

`GET /quality/controls/:qualityControlId/images/:imageId` streams an authenticated defect photo. `POST /quality/controls/:qualityControlId/images` (ADMIN or QUALITY_CONTROLLER) accepts JPEG, PNG, or WebP uploads up to 5 MB, with a maximum of 10 photos per inspection. `DELETE /quality/controls/:qualityControlId/images/:imageId` removes the binary and metadata while preserving append-only history.

GET /quality/pending — ADMIN, PRODUCTION_MANAGER or QUALITY_CONTROLLER; returns manufactured units waiting for inspection.
POST /quality/:pieceUnitId/validate — ADMIN or QUALITY_CONTROLLER; validates a pending unit as `CONFORM` or `NON_CONFORM`, persists an optional comment, updates the unit, and records `QUALITY_VALIDATED` or `QUALITY_REJECTED`.
GET /quality/history — ADMIN, PRODUCTION_MANAGER or QUALITY_CONTROLLER; returns the latest persisted quality decisions.

Quality is unit-by-unit and every inspection is immutable. A non-conform result requires a server-validated comment and defect category and moves the unit to `REJECTED`. Duplicate validation, invalid disposition transitions, duplicate active dispositions, and validation before manufacturing completion are rejected transactionally. Realtime events are emitted only after the transaction commits.

## History

GET /history — ADMIN or PRODUCTION_MANAGER; paginated append-only events. Supports `page`, `pageSize`, `search`, `eventType`, `entityType`, `actorUserId`, and `entityId` filters.
GET /history/pieces/:pieceId — ADMIN or PRODUCTION_MANAGER; filtered piece traceability, including metadata references written by production and quality transitions.
GET /history/machines/:machineId — ADMIN or PRODUCTION_MANAGER; filtered machine traceability.
GET /history/operators/:operatorId — ADMIN or PRODUCTION_MANAGER; filtered actor traceability.

History reads return `{ events, page, pageSize, total, totalPages }`. History events are never hard-deleted by the application and preserve actor role snapshots even when an account is later removed.

## Dashboard

The overview endpoint accepts an optional validated `days` query parameter (`7` to `90`, default `14`). It returns daily production and quality trend points calculated from persisted production-operation and quality-control timestamps. Access remains restricted to administrators and production managers.

GET /dashboard/overview — ADMIN or PRODUCTION_MANAGER; returns persisted summary KPIs, machine load, piece-status breakdown, unit-lifecycle breakdown, priority breakdown, quality summary, delivery-risk summary, recent history activity, delayed pieces, and active pieces. The manager Planning Calendar reuses the authenticated `/pieces` projection for due-date events.

The dashboard counts production progress from PieceUnit state, calculates quality conformity and defect/disposition analytics from persisted quality rows, and calculates delivery risk from active piece due dates. The read-only metrics endpoint is the single source for the shadcn-style dashboard charts; mutations continue to use their domain endpoints.

## Realtime

Authenticated Socket.IO clients connect to the `/realtime` namespace using the HttpOnly session cookie. Events include `piece.assigned`, `piece.reassigned`, `cutting-bars.generated`, `bar.assigned`, `machine.bars-assigned`, `bar.unassigned`, `bar.cancelled`, `production.started`, `production.completed`, `quality.validated`, and `quality.rejected`; REST remains authoritative and events are emitted only after commit.

Stable error format: `{ code, message, details }`; never expose stack traces.

## Operators and tablet production

Operator tablet-key actions require ADMIN or PRODUCTION_MANAGER and target an existing `User` ID whose role is `OPERATOR`: `POST /operators/:userId/activate`, `/deactivate`, and `/reset-key`. These routes do not create or update a second operator profile. The raw connection key is returned only on reset; user/list projections never include its Argon2id hash. The `/operators` page is a compatibility redirect to the shared `/users?role=OPERATOR` directory.

Tablet authentication uses a separate cookie/session for the same `User` identity: `POST/GET /production/auth/login|me`, `POST /production/auth/logout`. The tablet connection key is an additional credential on the user, not a second account. Operator-cookie routes select active machines/helpers, start/read/end a machine session, read assigned bars, start/finish a ProductionRun, and report a NonConformity; all operator IDs and history actors resolve to `User.id`. Manager monitor reads are `GET /production/monitor`; open reports are `GET /production/non-conformities` (also QUALITY_CONTROLLER).

Session, run, and NC commands enforce membership, active machine/assignment, state transitions, and Offer/Piece/bar relationships in the API. State and append-only history commit together; Socket.IO publication follows commit. Physical production and quality status are independent.
