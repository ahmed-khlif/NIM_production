# API Outline

## Health and readiness

GET `/health` is a public liveness probe and returns when the API process is serving requests. GET `/health/ready` is a public readiness probe; it performs a lightweight PostgreSQL query and returns HTTP 503 with a stable `DATABASE_UNAVAILABLE` code if the database cannot be reached. Neither endpoint exposes connection details.

Notifications are durable, user-targeted inbox records created atomically with their source business history event. They are distinct from `/history`: the latter is the all-time audit trail; notifications are recipient-specific, link to the relevant workflow, and carry a persistent `readAt` state. Existing historical events are not backfilled into inboxes.

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
`POST /offers/:offerId/faconnage/plans/:planId/revise` — ADMIN or PRODUCTION_MANAGER; releases a fully validated plan only when every generated bar is still façonnée and unassigned, preserves cancelled bar/proposal records and history, and returns its pieces to pending. If the offer was READY it returns to DRAFT. Assigned/started bars and production history are never cleared.

Raw length options may include `quantity` (integer 0–10,000). Omitted quantity means unlimited for this optimization; a supplied quantity caps bars of that length for this run only. It is not inventory accounting or a reservation. The optimizer rejects a request if the caps cannot satisfy all selected pieces.

All four endpoints use the existing manager/admin controller guard. Validation serializes on Offer and plan rows, checks material revision and current PieceUnit availability, and writes history before publishing realtime after commit. Façonnage preparation/optimization accepts `DRAFT` and `READY`, but not `IN_PRODUCTION` or terminal Offers.

Available-piece profiles are grouped against active catalogue designations and aliases without case/spacing duplicates. Preparation and optimization match those canonical profile selections case-insensitively, so legacy piece rows that differ only by capitalization remain included.

Optimization runs the solver before opening its write transaction. Plan/proposal persistence, availability recheck, and the history event remain atomic; the transaction allows up to 30 seconds for large valid plans instead of Prisma's 5-second default.

`GET /offers/:id/production-summary` supports `page`, `pageSize`, `search` (reference/profile) and `status` (`PLANNED`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `DELAYED`). `pagination.total` follows those row filters; `totals` remains the full-offer production summary.

## Auth

POST /auth/login
POST /auth/logout
GET /auth/me
POST /auth/change-password

## Settings and notifications

Material-profile catalogue export is administrator-only: `GET /material-profiles/export` downloads the shared catalogue as XLSX with designation, aliases, weight, raw lengths, and active state. Import is also administrator-only: `POST /material-profiles/import/preview` accepts an Excel filename and base64 workbook, validates designation/alias/weight/raw-length columns, and returns row-level errors plus current values for matching profiles without persistence. An extra legacy reference column is ignored. `POST /material-profiles/import` commits reviewed rows atomically; existing profiles are skipped unless `updateExisting: true` is explicitly provided, and updates/reactivations are recorded in history. Files are limited to 5 MB and 5,000 profiles.

GET /settings — Authenticated; returns persisted per-user display/activity preferences, with safe defaults for a new account.
PATCH /settings — Authenticated; validates and persists preferences and records `SETTINGS_UPDATED`.
GET /notifications — Authenticated; returns the caller's persisted, recipient-scoped notification inbox. Read `/notifications` API details below.

## Users

GET /users — ADMIN or PRODUCTION_MANAGER; managers receive only users whose role is `OPERATOR`.
POST /users — ADMIN; creates a user and records `USER_CREATED`
PATCH /users/:id — ADMIN; changes display name or role
POST /users/:id/disable — ADMIN; revokes sessions and records `USER_DISABLED`
POST /users/:id/reactivate — ADMIN; records `USER_REACTIVATED`
POST /users/:id/reset-password — ADMIN; revokes sessions and records `USER_PASSWORD_RESET`

There is no public self-registration. New accounts are created by an administrator so every account has an explicit business role and audit actor.

## Machines

`GET /machines/:id` returns an authenticated machine detail with its persisted unit queue, active operation count, currently associated bars, and derived bar metrics (`assigned`, `inProgress`, `fabricatedToday`, `fabricatedTotal`). Its bar list accepts `sortBy` (`profile`, `reference`, `offer`, `rawLengthMm`, `status`) and `sortDirection` (`asc`, `desc`); sorting happens in PostgreSQL before pagination. `GET /machines/:id/releasable-bars` is ADMIN/PRODUCTION_MANAGER-only, requires the machine to be in maintenance, and returns a compact, paginated list of filtered, assigned-but-not-started bars for bulk selection. `GET /machines/:id/queue` exposes the queue projection for queue-focused clients. `GET /machines` includes an `assignedBarCount` derived from active machine-bar assignment records.

GET /machines — Authenticated
POST /machines — ADMIN or PRODUCTION_MANAGER
PATCH /machines/:id — ADMIN or PRODUCTION_MANAGER
POST /machines/:id/maintenance — ADMIN or PRODUCTION_MANAGER
POST /machines/:id/reactivate — ADMIN or PRODUCTION_MANAGER
POST /machines/:id/deactivate — ADMIN or PRODUCTION_MANAGER

## Cutting bars and machine assignments

Validating selected Offer-scoped cutting-plan proposals persists only the chosen `CuttingBar` records and links each to its exact proposed `PieceUnit` set. Selected units move from `PENDING` to `FACONNEE` in the same transaction. Existing approved plans are backfilled as fully validated proposals by the additive migration.

GET `/offers/:offerId/bars` and GET `/offers/:offerId/bars/:barId` are authenticated and strictly Offer-scoped. The bar list accepts validated `page` (default 1), `pageSize` (10/20/50), `search`, `status`, and `profile`; details and memberships are loaded only for the requested page. It returns total/status counts, profile facets, and pagination metadata. GET `/offers/:offerId/bar-assignments` returns that Offer’s unassigned shaped bars and its active machine assignments.

GET `/offers/:offerId/material-report` is authenticated and Offer-scoped. It returns all non-cancelled bars created from validated cutting-plan proposals, grouped gross material needs by profile and raw length, plus per-bar active piece references, lengths, waste, status, and source plan. The report explicitly marks stock availability as untracked: these are gross requirements, not net purchase quantities. The UI offers a print-ready A4 PDF workflow; machine, consumables, and labor requirements are not inferred because the planning domain does not model them.

The printable report keeps the compact purchasing summary and includes a separate cut-detail section. It distinguishes net piece weight (saved piece-unit weights, falling back to profile kg/m) from gross raw-stock weight (raw length × profile kg/m). Identical bars are grouped with the same profile, stock length, cut pattern, status, and machine rules used by the Affaire bar list; grouped rows retain their bar references, piece references, cut lengths, waste, and source plan.

GET `/offers/:offerId/bar-summary` is an authenticated, Offer-scoped aggregate projection for overview counters. It groups bar counts by status in the database and does not load bar memberships; use `/bars` only when the UI needs bar details.

POST `/offers/:offerId/bar-assignments` (ADMIN or PRODUCTION_MANAGER) accepts `{ machineId, barIds }` (maximum 500 bars per assignment request) and atomically validates the Offer, active machine, all bar ownership/status, unique selection, and every member PieceUnit. It moves bars `FACONNEE → AFFECTEE`, creates historical `MachineBarAssignment` rows, and creates the existing unit-level `Assignment` rows consumed by the production queue. History events are committed with the state changes; realtime events, where enabled, are emitted after commit.

POST `/offers/:offerId/bars/:barId/unassign` (ADMIN or PRODUCTION_MANAGER) closes assignment history and returns an unstarted bar and its units to the shaped state. It is rejected once the bar has started production. DELETE `/offers/:offerId/bars/:barId` is a soft cancellation only for an unassigned `FACONNEE` bar: memberships are closed, its units return to `PENDING`, and history is retained. No audit or assignment history is hard-deleted.

Production start moves an assigned bar `AFFECTEE → LANCEE`; when all of its member units have completed fabrication, the bar moves to `FABRIQUEE` and stores `fabricatedAt` for reliable daily machine metrics. These bar transitions are derived from existing production operations and do not add an operator login/tablet workflow.

## Offers (workflow root)

An Offer owns its pieces, imports, cutting plans, production summary, and traceability context. Offer creation and updates are restricted to `ADMIN` and `PRODUCTION_MANAGER`; the API validates lifecycle transitions and writes history in the same transaction. Archive preserves its full history; permanent deletion is limited to an empty draft and administrators.

`GET /offers` and `GET /offers/:id` provide the workspace list and detail. The list accepts validated `page` (default 1; pageSize 10/20/50), `search`, `status`, `clientName`, `site`, and `includeArchived` filters; filtering/counting and page selection are applied in PostgreSQL and the response includes pagination metadata plus client/site facets. `POST /offers` creates an isolated offer. `PATCH /offers/:id` updates editable fields or requests a guarded status transition. `POST /offers/:id/archive` and `/restore` preserve and restore records. `DELETE /offers/:id` only removes an empty draft.

The machine and user directory screens accept database-backed `page` (default 1), `pageSize` (10/20/50), `search` (maximum 80 characters), and their supported status/role/active filters. They return `pagination` metadata and summary counts. Legacy unfiltered requests remain available to existing compact machine/user selectors.

Piece-list queries also accept `dueDateFrom`, `dueDateTo`, `priority`, and persisted `status`. The planning calendar uses these filters to request only pieces with due dates in its visible date range, then loads that range in bounded database pages instead of downloading all application pieces.

`GET /assignments` accepts `offerId`, `page`, `pageSize` (10/20/50), `search`, and `machineId`; it returns a database-paginated active assignment list plus total/summary counts. `GET /assignments/available-units` applies the same bounded page/search model to the assignment picker. `GET /offers/:offerId/bar-assignments` independently paginates available bars and active assignments with `availablePage`, `assignmentPage`, `pageSize`, and `search`; the UI retains explicit bar selections across pages.

`GET /notifications` returns only the authenticated recipient’s inbox rows; accepts `page`, `pageSize` (5 for the header preview; 10/20/50 for the inbox), `search` (maximum 80 characters), `eventType`, `unreadOnly=true`, and optional `includeEventTypes=true` (used by the full inbox filter; omitted by the bell to avoid an unnecessary aggregation). The response includes `unreadCount`, which counts that recipient’s unread notifications independent of current filters. `PATCH /notifications/:id/read` marks one owned row read; `POST /notifications/read-all` marks only the caller’s unread rows read. Both write endpoints are authenticated, ownership-scoped, and server-validated. Administrators and production managers receive relevant cross-affaire operational changes because the current product has no per-manager Affaire assignment. Quality controllers receive quality decisions and work awaiting inspection. Operators receive events for their current active machine session and explicit account/tablet-access messages; there is no permanent operator-to-machine binding. The personal setting controls visibility of the unread badge only and never suppresses inbox delivery.

The operator tablet’s `GET /production/sessions/current` returns the active session and the distinct Affaires that have waiting bars assigned to that session’s machine. Passing an `offerId` selects one of those Affaires and returns its queue paginated by profile, then bar reference; `page`, `pageSize` (10/20/50), and `search` apply only inside that Affaire. The API validates the selected Affaire against active assignments for the current machine. The active production run remains returned independently of the selected queue page. `GET /production/non-conformities` accepts the same page/search options with optional Offer and machine scope.

Quality pending and control-history routes accept `page`, `pageSize` (10/20/50), and `search` (maximum 80 characters); history additionally accepts `result=CONFORM|NON_CONFORM`. Filtering, counting, and page selection are performed in PostgreSQL. Offer production summaries accept `page` and `pageSize` (10/20/50) and return page-level piece progress plus offer-wide totals.

Offer detail metrics use database aggregation for piece rows, quantities, profile families, and manufactured units; the response does not load every PieceUnit just to calculate the summary. The detail query preserves the validated/partial/approved plan precedence and returns only the five most recent plan summaries.

Offer-scoped piece, import, image, and cutting-plan routes use `/offers/:offerId/pieces`, `/offers/:offerId/pieces/import/...`, `/offers/:offerId/pieces/:pieceId/images/...`, and `/offers/:offerId/faconnage/...`. `GET /offers/:offerId/pieces` uses the same validated pagination/filter contract as `GET /pieces` and scopes results to that Offer. The server verifies the parent Offer for every scoped operation; identical piece references may exist in different Offers without crossing data boundaries. `GET /offers/:offerId/pieces/facets` lazily returns distinct profiles, qualities, and designations for the Offer; the global equivalent is `GET /pieces/facets`. Piece-list requests no longer calculate facets. The legacy `/pieces` routes remain compatibility endpoints and mutations must identify their `offerId`; new workflows should use Offer-scoped routes.

`GET /pieces/next-reference?offerId=:id` is available to administrators and production managers as an Offer-scoped suggestion for manual piece creation. An omitted reference on `POST /offers/:offerId/pieces` is generated inside the transaction from that Offer’s existing sequence; the Offer row is locked first to serialize concurrent automatic assignments. Empty quality and designation values default to `UNKNOWN` and `À compléter`.

## Pieces

## Material profile catalogue

`GET /material-profiles?search=` returns active profiles with their canonical designation, aliases, `kgPerMeter`, and available raw lengths. An administrator may set `includeInactive=true` to review inactive entries. `POST /material-profiles` creates a profile and `PATCH /material-profiles/:id` updates its canonical designation, aliases, line weight, raw lengths, and active state; both mutations are ADMIN-only, schema-validated, persisted, and audited as `MATERIAL_PROFILE_CREATED` / `MATERIAL_PROFILE_UPDATED` in the same transaction. Canonical names and aliases are checked for collisions. Profiles are deactivated, never hard-deleted.

The additive `MaterialProfile` migration seeds the 656 unique entries validated from `Profils couramment utilisé.xlsx`. Piece creation/update calculates unit weight as `kgPerMeter × lengthMm / 1000` when the request does not include a manual weight; an explicitly supplied weight remains an override. Total weight is calculated from unit weight × quantity.

Manual piece creation requires a positive unit weight; the API calculates and stores total weight from unit weight multiplied by quantity. Existing records may retain unknown legacy weights. Tekla XLS/XLSX rows require numeric unit and total weights; the source total is preserved and discrepancies above 0.05 kg are flagged. CSV remains backward-compatible with the existing lighter-weight import format. Binary workbooks scan for the first worksheet with matching business headers rather than assuming the first tab contains the data.

`GET /pieces/:id` returns the piece, every PieceUnit, current machine/operator, active assignment, timestamps, and quality result.

The same response includes the ordered `images` gallery. `GET /pieces/:pieceId/images/:imageId` streams an authenticated JPEG, PNG, or WebP image; files are never exposed through an unguarded public URL.

GET /pieces — Authenticated; returns production-piece summaries with unit progress. Supports validated `page` (default 1), `pageSize` (default 20, maximum 100), `search` (reference/profile/quality/designation, maximum 80 characters), exact `profile` filters, and whitelisted `sortBy`/`sortDirection` values for reference, profile, quantity, status, quality, length, unit/total weight, and designation. Sorting is performed in PostgreSQL before pagination. Returns `{ pieces, page, pageSize, total, totalPages }`; database filtering and pagination are applied before rows and unit summaries are loaded. `GET /pieces/facets` separately returns distinct profile, quality, and designation values and should be requested only when a filter or piece form needs those options.
POST /pieces — ADMIN or PRODUCTION_MANAGER; validates and creates a piece plus its persisted PieceUnit rows, then records `PIECE_CREATED`.
POST `/offers/:offerId/pieces/batch` — ADMIN or PRODUCTION_MANAGER; atomically creates 2–50 separate pieces for multiple lengths of the same profile. Each gets its own generated/validated reference, quantity, PieceUnit rows, and `PIECE_CREATED` history event; the whole batch rolls back if a row fails.
PATCH /pieces/:id — ADMIN or PRODUCTION_MANAGER; updates editable planning fields, increments the version, and records `PIECE_UPDATED`.
POST /pieces/:id/archive — ADMIN or PRODUCTION_MANAGER; archives eligible pieces without deleting units or history and records `PIECE_ARCHIVED`.
DELETE `/offers/:offerId/pieces/bulk` — ADMIN or PRODUCTION_MANAGER; accepts 1–100 unique `pieceIds` on any non-archived Affaire and permanently deletes only `PLANNED` pieces whose units remain fully pending and have no assignment, cutting-bar, production, or quality references. Draft cutting-plan proposals are estimates rather than created bars: when a piece is deleted, draft plans for that Affaire are archived and their piece-unit links are removed before deleting the piece; the saved plan result remains as an archived snapshot. Piece-unit links from already-cancelled proposals are also detached as stale references while the proposal snapshot remains. A proposal in a partially validated plan remains protected; managers must cancel that plan's remainder first, which preserves already-created bars. The operation is atomic, increments the Affaire material revision, deletes attached image files, and writes append-only `PIECE_DELETED` audit events. Any ineligible piece rejects the entire request.

Piece references are normalized to uppercase and unique. Archived pieces and pieces already assigned or in fabrication cannot be edited/archived again. Quantity is bounded server-side and every created unit receives a unique sequence number inside the same database transaction.

`POST /pieces/:id/images` — ADMIN or PRODUCTION_MANAGER; accepts one multipart `file` (JPEG, PNG, or WebP, maximum 5 MB), validates both the declared MIME type and file signature, stores the binary under `MEDIA_ROOT`, persists metadata, and records `PIECE_IMAGE_ADDED` in the same database transaction. A piece supports at most 10 images.

`DELETE /pieces/:pieceId/images/:imageId` — ADMIN or PRODUCTION_MANAGER; removes the image metadata and binary without deleting its append-only `PIECE_IMAGE_REMOVED` history event. Archived pieces cannot receive or remove images.

`POST /pieces/import/preview` and `POST /pieces/import` are restricted to ADMIN and PRODUCTION_MANAGER. They accept CSV, Tekla HTML `.xls`, and binary `.xls`/`.xlsx` payloads (`encoding: text|base64`). Tekla imports require Repère, Profil, Qté, Qualité, Long., Poids, Pds Tot, and Désignation; Surface is intentionally ignored. The preview returns `columns` metadata (`sourceHeader`, canonical `field`, display `label`, and `ignored`) so the UI can show the detected mapping and intentional omissions. Preview detects duplicate/existing references, validates localized numbers, reports row-level errors and weight discrepancy warnings without persistence. Commit revalidates and transactionally creates pieces, units, per-piece audit events, and one import-summary event. Uploaded workbooks are parsed in memory and are not saved; import filenames and batch records are not persisted. Imports are limited to 1000 rows and 5 MB.

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

GET /history — ADMIN or PRODUCTION_MANAGER; paginated all-time append-only events. Supports `page`, `pageSize`, `search`, `eventType`, `entityType`, `actorUserId`, and `entityId` filters. Search includes common persisted business references and results use stable newest-first ordering with an ID tie-breaker.
GET /history/pieces/:pieceId — ADMIN or PRODUCTION_MANAGER; filtered piece traceability, including metadata references written by production and quality transitions.
GET /history/machines/:machineId — ADMIN or PRODUCTION_MANAGER; filtered machine traceability.
GET /history/operators/:operatorId — ADMIN or PRODUCTION_MANAGER; filtered actor traceability.

History reads return `{ events, page, pageSize, total, totalPages }`. History events are never hard-deleted by the application and preserve actor role snapshots even when an account is later removed.

## Dashboard

The overview endpoint accepts an optional validated `days` query parameter (`7` to `90`, default `14`). It returns daily production and quality trend points calculated from persisted production-operation and quality-control timestamps. Status, delivery, quality, and trend aggregates are calculated in one PostgreSQL query; the aggregate snapshot is coalesced and cached in-process for at most three seconds. Committed realtime domain events invalidate that cache; piece/import and machine writes publish their invalidation events after their transactions commit. Piece progress and machine queue projections use filtered counts rather than loading every unit or assignment ID. Access remains restricted to administrators and production managers.

GET /dashboard/overview — ADMIN or PRODUCTION_MANAGER; returns persisted summary KPIs, machine load, piece-status breakdown, unit-lifecycle breakdown, priority breakdown, quality summary, delivery-risk summary, recent history activity, delayed pieces, and active pieces. The manager Planning Calendar reuses the authenticated `/pieces` projection for due-date events.

The dashboard counts production progress from PieceUnit state, calculates quality conformity and defect/disposition analytics from persisted quality rows, and calculates delivery risk from active piece due dates. The read-only metrics endpoint is the single source for the shadcn-style dashboard charts; mutations continue to use their domain endpoints.

## Realtime

Authenticated Socket.IO clients connect to the `/realtime` namespace using the HttpOnly session cookie. Events include piece/import mutations (`piece.created`, `piece.updated`, `piece.archived`, `pieces.imported`), machine changes (`machine.created`, `machine.updated`, `machine.statusChanged`), `piece.assigned`, `piece.reassigned`, `cutting-bars.generated`, `bar.assigned`, `machine.bars-assigned`, `bar.unassigned`, `bar.cancelled`, production/session transitions, and quality decisions. REST remains authoritative and write notifications are emitted only after commit; web clients invalidate the affected query families rather than refetching every cached route.

Stable error format: `{ code, message, details }`; never expose stack traces.

## Operators and tablet production

Operator tablet-access activation/deactivation requires ADMIN or PRODUCTION_MANAGER and targets an existing `User` ID whose role is `OPERATOR`: `POST /operators/:userId/activate` and `/deactivate`. These routes do not create a second operator profile. There is no connection-key issuance/reset endpoint; operators use their existing username and password. Administrators reset the normal User password through user-management routes. The `/operators` page is a compatibility redirect to the shared `/users?role=OPERATOR` directory.

Tablet authentication uses a separate cookie/session for the same `User` identity: `POST/GET /production/auth/login|me`, `POST /production/auth/logout`. Login accepts the operator account username and password; the tablet credential is not separate from the User account. Operator-cookie routes select active machines/helpers, start/read/end a machine session, read assigned bars, start/finish/cancel a ProductionRun, and report a NonConformity; `POST /production/runs/:runId/cancel` is limited to an active member of that run's machine session and refuses cancellation when any open non-conformity exists. A successful cancellation retains the run with status `CANCELLED`, restores the bar and piece units to their assigned state, records audit events, then publishes realtime updates after commit. All operator IDs and history actors resolve to `User.id`. `GET /production/monitor` is global for ADMIN and requires an Affaire `offerId` for PRODUCTION_MANAGER; open reports are `GET /production/non-conformities` (also QUALITY_CONTROLLER).

Session, run, and NC commands enforce membership, active machine/assignment, state transitions, and Offer/Piece/bar relationships in the API. State and append-only history commit together; Socket.IO publication follows commit. Physical production and quality status are independent.

# Machine detail pagination

Current operator credential and role-scope behavior is documented in [Operator account access and production roles](OPERATOR_ACCOUNT_ACCESS.md). In particular, tablet login uses operator username/password; production managers must query the monitor with an Affaire ID, while admins may query the global monitor.

`GET /machines/:id` accepts `page`, `pageSize` (10, 20, or 50), `search` (up to 80 characters), and `status` for the machine's assigned-bar list. Bar search/status filtering is applied by PostgreSQL before pagination; totals and machine-wide assigned/in-progress metrics are independent of the current page. The unit assignment queue in this detail response is also bounded and paginated. `GET /machines/:id/queue` accepts `page` and `pageSize` for the same bounded queue. The active production run remains a separate summary and is never hidden by list pagination.

`DELETE /machines/:id` is restricted to `ADMIN` and `PRODUCTION_MANAGER`. It deletes only an unused machine with no piece references, assignments, bar assignments, sessions, production runs/operations, or non-conformities. Otherwise it returns `409 MACHINE_HAS_HISTORY`; set the machine to `INACTIVE` to prevent future assignments while preserving its traceability. A successful deletion writes `MACHINE_DELETED` to append-only history in the same transaction and publishes realtime invalidation only after commit.

## Read-path performance

Administrator status override: `PATCH /offers/:id/status` with `{ "status": "DRAFT" | "READY" | "IN_PRODUCTION" | "COMPLETED" }`. This ADMIN-only endpoint changes the Offer status/version without mutating production or quality entities, and writes an `OFFER_STATUS_OVERRIDDEN` audit event in the same transaction. `ARCHIVED` is intentionally excluded and must use archive/restore.

Piece-list rows remain bounded by the requested page; distinct profile/quality/designation facets use a separate parameterized route and are loaded only when requested. The dashboard consolidates status, delivery, quality, and daily trend aggregates into one PostgreSQL query and caches only that aggregate snapshot for at most three seconds; piece rows, machine loads, and recent activity remain fresh projections. Offer-list metrics aggregate piece rows by offer/profile and count manufactured units per offer in PostgreSQL; the preferred plan is selected per offer using the existing VALIDATED, PARTIALLY_VALIDATED, APPROVED, then latest-plan precedence. Façonnage optimization runs in a bounded worker-thread executor so synchronous WASM solver work cannot block API request handling; planning writes, availability checks, history, and post-commit realtime behavior remain unchanged.

# Client directory

The client list accepts `status=ACTIVE|ARCHIVED|ALL` alongside `search`, pagination, and the backward-compatible `includeArchived` flag. `GET /clients/export/data` returns all matching client summaries for authorized print layouts; `GET /clients/export` downloads all matching rows as an `.xlsx` workbook. Both export routes use the same validated search/status filters and the directory's existing `ADMIN`/`PRODUCTION_MANAGER` authorization.

`GET /clients` and `GET /clients/:id` are restricted to `ADMIN` and `PRODUCTION_MANAGER`. The list accepts database-backed `page`, `pageSize` (10/20/50), `search` (name or tax ID), and `includeArchived`; it returns offer counts and pagination metadata. `POST /clients` requires a legal name, fiscal identifier, at least one telephone number, and at least one e-mail address (maximum three phones and two e-mails). `PATCH /clients/:id` updates the legal name, fiscal identifier, phone numbers and e-mail addresses. Names are unique case-insensitively after whitespace normalization; a supplied fiscal identifier is unique after punctuation/spacing normalization. Duplicate entries return `409 CLIENT_ALREADY_EXISTS`.

Paginated list sorting is server-side: supported `sortBy` fields and `sortDirection=asc|desc` are validated per endpoint, and the database applies ordering before `skip`/`take`. This keeps a selected order consistent across every page instead of sorting only the rows currently loaded in the browser. Columns derived from aggregates or display-only combinations are not advertised as sortable unless the endpoint has a database ordering for them.

`POST /clients/:id/photo` replaces the optional client image (JPEG/PNG/WebP, max 5 MB); authenticated users in the client-management roles can read it through `GET /clients/:id/photo`. `DELETE /clients/:id/photo` removes the current profile image with an audit event. The API verifies the file signature and stores bytes under `MEDIA_ROOT`; metadata and storage key remain in PostgreSQL. `POST /clients/:id/archive` and `/restore` are administrator-only reversible lifecycle actions. Client records are never hard-deleted; old Affaires continue to reference an archived client.

`Offer.clientId` is authoritative. New Affaires select an active client ID, and the API copies the selected name into legacy `Offer.clientName` for compatibility. A legacy name may only be saved if it resolves to a registered active client. The additive migration `20261101100000_client_directory` creates directory records from existing non-empty Offer client names and links those Offers without removing the legacy name.

### Operator presence, notifications, and run ownership

`GET /production/operators/available` returns active, tablet-enabled operators who are not participating in any active machine session, with `isOnline` and `lastSeenAt`. The signed-in lead is excluded. The operator tablet sends an authenticated heartbeat every 15 seconds while its page is visible and the browser is online. Presence is based on valid, unrevoked tablet sessions; an operator is online if the last heartbeat was within 45 seconds. Offline operators remain selectable when available. `PATCH /production/sessions/:sessionId/team` lets only the active session lead replace the assistant roster. New assistants must be eligible and free of another active session. Assistants can be added or removed at any time, except the operator who started a currently running bar cannot be removed until that run is completed or cancelled. Removed membership rows are retained as inactive history. Changes create an audit event, notify newly added operators, and publish realtime after commit. `POST /production/operators/:operatorId/machine-session/end` is ADMIN-only and ends the operator's active team session only when that session has no running production bar; it ends all memberships, writes `MACHINE_SESSION_ENDED`, notifies team members, and emits realtime after commit.

`GET /production/notifications` and `POST /production/notifications/:id/read` expose only the signed-in operator's persisted inbox and read state. When a lead starts a machine session, selected helpers receive an inbox notification in the same transaction as the history event.

The operator who creates a machine session is its lead and alone may end that shared session. All active teammates may observe a `ProductionRun` and report a non-conformity, while only `startedByOperatorId` may finish or cancel that run. One running bar per physical machine remains enforced; a teammate may start the next bar after the current run ends, not concurrently on the same machine.
