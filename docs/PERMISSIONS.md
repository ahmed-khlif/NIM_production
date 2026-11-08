# Roles and Permissions

Roles: ADMIN, PRODUCTION_MANAGER, OPERATOR, QUALITY_CONTROLLER.

Key permissions: USERS_READ/CREATE/UPDATE/DISABLE, MACHINES_READ/CREATE/UPDATE/DELETE/MAINTENANCE, PIECES_READ/CREATE/UPDATE/IMPORT, ASSIGNMENTS_READ/CREATE/REASSIGN, PRODUCTION_START/PROGRESS/COMPLETE, QUALITY_READ/VALIDATE, HISTORY_READ, DASHBOARD_READ.

Machine deletion is available to `ADMIN` and `PRODUCTION_MANAGER` only when no operational record references the machine. Machines with production or assignment history must be deactivated instead; the API preserves the machine record and its traceability.

## Typical ownership

- Admin: user management, machine administration, settings, history access.
- Production Manager: pieces, imports, assignments, dashboard, production/history reads.
- Operator: machine read, assigned queue read, production start/progress/complete.
- Quality Controller: pending quality read and validation.

Only `ADMIN` may use `PATCH /offers/:id/status` to override an active Affaire status. The override cannot set `ARCHIVED`; it records an append-only history event and does not undo production or quality facts. Production managers continue to use the normal guarded lifecycle.

Frontend hiding is convenience only; NestJS guards enforce permissions.

## Implemented account management

Administrators create and manage application accounts in `/users`. `GET /users` is also available to production managers, but the server returns only `OPERATOR`-role users to them; create, update, disable/reactivate, and password-reset routes remain ADMIN-only. Production managers use this same directory to manage tablet access for existing operator users. The server enforces these limits with `AuthGuard` and `RolesGuard`; hiding UI controls is not the security boundary.

Administrators cannot disable themselves, remove their own last admin role, disable the last active administrator, or remove the last active administrator through a role update. These protections prevent locking the system out.

Machine reads are available to every authenticated role. Creating, editing, or changing machine status is restricted server-side to `ADMIN` and `PRODUCTION_MANAGER`. Machine status changes are recorded as `MACHINE_STATUS_CHANGED` events.

Piece reads are available to every authenticated role. Creating, editing, archiving, or deleting unused pieces is restricted server-side to `ADMIN` and `PRODUCTION_MANAGER`. Bulk deletion is available on non-archived Affaires and only for pieces whose units remain pending and have never been linked to assignment, cutting, production, or quality records. Deletion removes the piece and its unused units/photos, while a permanent `PIECE_DELETED` history event retains the reference and key business details. Creating a piece also creates all of its `PieceUnit` records transactionally; piece mutations record actor and role snapshots in history. Operators and quality controllers can see the planning data but cannot change it.

Piece images follow the same boundary: every authenticated role can view an image through the guarded stream route, while only `ADMIN` and `PRODUCTION_MANAGER` can upload or remove images. Archived pieces are read-only, including their gallery. Removing a file never removes the corresponding history event.

Piece and machine detail reads are available to authenticated roles, including persisted queues and unit traceability. Scoped history reads remain restricted to `ADMIN` and `PRODUCTION_MANAGER`. CSV import preview and commit are restricted server-side to `ADMIN` and `PRODUCTION_MANAGER`; commit revalidates every row and records the uploader, batch, and imported piece events transactionally.

Assignment reads are available to every authenticated role. Creating, reassigning, or removing an assignment is restricted server-side to `ADMIN` and `PRODUCTION_MANAGER`. Assignment writes are unit-level, reject machines that are not `ACTIVE`, and preserve previous assignments as inactive history records.

## Implemented production execution

Production queue reads and start/complete transitions are restricted server-side to `ADMIN`, `PRODUCTION_MANAGER`, and `OPERATOR`. Operators may complete only their own active operation; administrators and production managers may complete an operation for supervised recovery. Starting requires an active assignment to the selected active machine. Every transition is transactional and records the actor, machine, unit, and old/new statuses in history.

## Operator management and tablet

ADMIN and PRODUCTION_MANAGER can manage tablet access for an existing `User` with role `OPERATOR`; they cannot create a parallel operator profile. Only ADMIN can reset the normal User password. Operators authenticate to the tablet with their existing username/password and cannot change their password themselves. ADMIN can read the global production monitor; PRODUCTION_MANAGER must scope monitor access to an Affaire whose status is `IN_PRODUCTION`. QUALITY_CONTROLLER may read open tablet non-conformities. Operator-only routes may list active machines/helpers and act only within the caller's active MachineSession. They may start/finish that session's assigned bar and report an NC on a PieceUnit in its current run. Operators cannot manage Offers, Pieces, Faconnage, Machines, assignments, or other user accounts. All these checks are enforced by API guards and domain services, not the UI.

## Implemented quality control

Pending quality and quality history reads are available to `ADMIN`, `PRODUCTION_MANAGER`, and `QUALITY_CONTROLLER`. Validation is restricted server-side to `ADMIN` and `QUALITY_CONTROLLER`. The server requires a `QUALITY_PENDING` unit, validates the decision and non-conform comment, updates the unit and creates the QualityControl record in one transaction, then records the actor, result, comment and old/new status in append-only history.

## Implemented traceability history

The history reader is restricted server-side to `ADMIN` and `PRODUCTION_MANAGER`. It supports paginated event, entity, actor, and text filters, plus piece, machine, and operator scopes. The frontend cannot broaden these permissions and the application never deletes audit records.

## Implemented dashboard

Dashboard reads are restricted server-side to `ADMIN` and `PRODUCTION_MANAGER`. Metrics are calculated from persisted pieces, piece units, machines, production operations, due dates, and append-only history events.

Production Planning board reads and schedule mutations are restricted server-side to `ADMIN` and `PRODUCTION_MANAGER`. Create/update/cancel operations validate active bar assignment, machine status, active operator accounts, and machine/operator overlaps in PostgreSQL transactions. Planning cannot change a machine assignment or start/finish production. Removing a machine assignment is rejected until its active planned production event is cancelled.

Settings reads and updates are scoped to the authenticated user and write `SETTINGS_UPDATED` events. Notifications are durable recipient-owned rows: reads, unread counts, mark-one-read, and mark-all-read are always filtered by the authenticated `recipientUserId`. Admins and production managers receive relevant operational changes across the current global workspace; quality controllers receive inspection/NC work; operators receive updates for the active machine session and their account/tablet access. The API stores only the notification copy and safe internal workflow link, and does not grant access to the linked resource: destination routes still enforce their normal guards and affaire scope. Read state never mutates or removes append-only history.

Current operator credential and production visibility rules are documented in [Operator account access and production roles](OPERATOR_ACCOUNT_ACCESS.md). Operator passwords are administrator-managed; operator self-service password changes are rejected by the API. Admins have global production-monitor access; production managers can access it only with an Affaire scope.

# Client directory permissions

Client-directory reads, creation, edits, and photo replacement are limited to `ADMIN` and `PRODUCTION_MANAGER`, matching their authority to manage Affaires. Only `ADMIN` may archive or restore a client. Archived clients remain readable through existing Affaire references but are excluded from new Affaire selection. NestJS enforces these rules; hidden controls are not the security boundary.
