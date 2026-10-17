# Roles and Permissions

Roles: ADMIN, PRODUCTION_MANAGER, OPERATOR, QUALITY_CONTROLLER.

Key permissions: USERS_READ/CREATE/UPDATE/DISABLE, MACHINES_READ/CREATE/UPDATE/MAINTENANCE, PIECES_READ/CREATE/UPDATE/IMPORT, ASSIGNMENTS_READ/CREATE/REASSIGN, PRODUCTION_START/PROGRESS/COMPLETE, QUALITY_READ/VALIDATE, HISTORY_READ, DASHBOARD_READ.

## Typical ownership

- Admin: user management, machine administration, settings, history access.
- Production Manager: pieces, imports, assignments, dashboard, production/history reads.
- Operator: machine read, assigned queue read, production start/progress/complete.
- Quality Controller: pending quality read and validation.

Frontend hiding is convenience only; NestJS guards enforce permissions.

## Implemented account management

Administrators create and manage application accounts in `/users`. `GET /users` is also available to production managers, but the server returns only `OPERATOR`-role users to them; create, update, disable/reactivate, and password-reset routes remain ADMIN-only. Production managers use this same directory to manage tablet access for existing operator users. The server enforces these limits with `AuthGuard` and `RolesGuard`; hiding UI controls is not the security boundary.

Administrators cannot disable themselves, remove their own last admin role, disable the last active administrator, or remove the last active administrator through a role update. These protections prevent locking the system out.

Machine reads are available to every authenticated role. Creating, editing, or changing machine status is restricted server-side to `ADMIN` and `PRODUCTION_MANAGER`. Machine status changes are recorded as `MACHINE_STATUS_CHANGED` events.

Piece reads are available to every authenticated role. Creating, editing, or archiving pieces is restricted server-side to `ADMIN` and `PRODUCTION_MANAGER`. Creating a piece also creates all of its `PieceUnit` records transactionally; piece mutations record actor and role snapshots in history. Operators and quality controllers can see the planning data but cannot change it.

Piece images follow the same boundary: every authenticated role can view an image through the guarded stream route, while only `ADMIN` and `PRODUCTION_MANAGER` can upload or remove images. Archived pieces are read-only, including their gallery. Removing a file never removes the corresponding history event.

Piece and machine detail reads are available to authenticated roles, including persisted queues and unit traceability. Scoped history reads remain restricted to `ADMIN` and `PRODUCTION_MANAGER`. CSV import preview and commit are restricted server-side to `ADMIN` and `PRODUCTION_MANAGER`; commit revalidates every row and records the uploader, batch, and imported piece events transactionally.

Assignment reads are available to every authenticated role. Creating, reassigning, or removing an assignment is restricted server-side to `ADMIN` and `PRODUCTION_MANAGER`. Assignment writes are unit-level, reject machines that are not `ACTIVE`, and preserve previous assignments as inactive history records.

## Implemented production execution

Production queue reads and start/complete transitions are restricted server-side to `ADMIN`, `PRODUCTION_MANAGER`, and `OPERATOR`. Operators may complete only their own active operation; administrators and production managers may complete an operation for supervised recovery. Starting requires an active assignment to the selected active machine. Every transition is transactional and records the actor, machine, unit, and old/new statuses in history.

## Operator management and tablet

ADMIN and PRODUCTION_MANAGER can manage tablet keys/access for an existing `User` with role `OPERATOR` and read the production monitor; they cannot create a parallel operator profile. QUALITY_CONTROLLER may read open tablet non-conformities. The tablet connection key and HttpOnly cookie provide a separate authentication mechanism for the same User ID, not a separate identity. Operator-only routes may list active machines/helpers and act only within the caller's active MachineSession. They may start/finish that session's assigned bar and report an NC on a PieceUnit in its current run. Operators cannot manage Offers, Pieces, Faconnage, Machines, assignments, or other user accounts. All these checks are enforced by API guards and domain services, not the UI.

## Implemented quality control

Pending quality and quality history reads are available to `ADMIN`, `PRODUCTION_MANAGER`, and `QUALITY_CONTROLLER`. Validation is restricted server-side to `ADMIN` and `QUALITY_CONTROLLER`. The server requires a `QUALITY_PENDING` unit, validates the decision and non-conform comment, updates the unit and creates the QualityControl record in one transaction, then records the actor, result, comment and old/new status in append-only history.

## Implemented traceability history

The history reader is restricted server-side to `ADMIN` and `PRODUCTION_MANAGER`. It supports paginated event, entity, actor, and text filters, plus piece, machine, and operator scopes. The frontend cannot broaden these permissions and the application never deletes audit records.

## Implemented dashboard

Dashboard reads are restricted server-side to `ADMIN` and `PRODUCTION_MANAGER`. Metrics are calculated from persisted pieces, piece units, machines, production operations, due dates, and append-only history events.

Settings reads and updates are scoped to the authenticated user and write `SETTINGS_UPDATED` events. Notifications are scoped server-side: managers/admins receive recent non-auth activity, while operators and quality controllers receive their own recent activity. Neither surface broadens access to production records.
