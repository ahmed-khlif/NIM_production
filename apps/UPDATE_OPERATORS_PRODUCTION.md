# Operator tablet production

## One person, one account

An operator is an ordinary application `User` whose role is `OPERATOR`. NIM does not maintain a second operator profile, duplicate name, duplicate active state, or duplicate identity. The same `User.id` is used for the operator's tablet identity, temporary machine-team membership, production runs, piece traceability, and history.

- An administrator creates, edits, disables, or reactivates the account in `/users` and assigns the `OPERATOR` role.
- A production manager opens the same directory filtered to operators (`/users?role=OPERATOR`) and can issue/reset a tablet key or toggle tablet access. Managers cannot create or change user accounts.
- `/operators` is retained only as a compatibility redirect to `/users?role=OPERATOR`.
- The tablet key is an additional credential for tablet sign-in. It does not create another account and is displayed only once when issued/reset.
- The regular username/password session and short-lived tablet session use separate cookies. Both resolve to the same User ID.

## Workflow

1. Admin creates the operator's account and assigns role `OPERATOR`.
2. Admin or production manager issues a tablet key from the operator's row in Users. Deliver it securely; reset revokes prior tablet sessions and replaces the key.
3. Prepare bars through the existing Offer Façonnage workflow and assign them to an active machine.
4. The operator signs in at `/production/login`, selects an active machine, adds optional helpers, and starts a temporary machine session.
5. The tablet shows bars assigned to that machine. The operator starts a bar run, may report a piece-level non-conformity, then finishes the run.
6. Managers review persisted progress in Offer Production, Dashboard, Machine detail, and Quality. Team membership is temporary; operators are not permanently attached to machines.

## Data model and migration

Migration `20261015170000_use_existing_operator_users` converts the earlier separate `Operator` / `OperatorAuthSession` tables to `User` / `TabletAuthSession` without resetting PostgreSQL.

- The migration links a legacy profile only when its normalized full name matches exactly one existing active-role `OPERATOR` user. It never guesses between ambiguous matches.
- Matched connection credentials, tablet sessions, machine sessions, team membership, production runs, non-conformities, PieceUnit operator references, and history actors are moved to the existing User ID.
- All legacy operator profiles and tablet-session rows are copied to `LegacyOperatorArchive` and `LegacyOperatorAuthSessionArchive` before the old active tables are removed. An unmatched profile with production/history/session references makes the migration stop with an error; reconcile that identity explicitly before retrying. An unmatched profile with no references remains preserved in the archive and is not made into a new account automatically.
- Existing production and audit rows are retained, and unmatched legacy profiles are preserved in the archive. Apply this migration with Prisma's deploy workflow; do not use `prisma migrate reset`.
- `TabletAuthSession` stores a keyed hash of an opaque session token. `User.connectionKeyHash` stores an Argon2id hash; neither raw secret is stored or returned by list APIs.
- `MachineSession` and `MachineSessionOperator` model temporary lead/helper membership. `ProductionRun` records each bar run. `NonConformity` captures an open report for a specific piece unit and run.
- Partial unique indexes protect one active membership per operator, one active session per machine, one running run per bar, and one open non-conformity per unit.

Physical production status is independent from quality status. A non-conformity report does not erase completed physical work.

## API and authorization

- `GET /users`: ADMIN receives the full directory; PRODUCTION_MANAGER receives only `OPERATOR` users.
- User account creation, profile/role edits, deactivation/reactivation, and password reset remain ADMIN-only.
- `POST /operators/:userId/activate`, `/deactivate`, and `/reset-key` are tablet-access actions against an existing `User` with role `OPERATOR`. They do not create/list/update operator profiles. These actions require ADMIN or PRODUCTION_MANAGER and write history using the actor's User ID.
- Tablet authentication: `POST /production/auth/login`, `GET /production/auth/me`, and `POST /production/auth/logout`.
- Tablet workflow: machine/helper selection, temporary session start/current/end, assigned-bar read, run start/finish, and non-conformity reporting under `/production`.
- Manager monitor: `GET /production/monitor`; quality-visible open reports: `GET /production/non-conformities`.

Every state-changing API validates the user role, tablet session, active machine membership, bar assignment, Offer/Piece relationship, and current state on the server. State and append-only history commit together; realtime publication happens only after commit.

## UI and tests

The shared Users screen has role-aware navigation: admins see “Utilisateurs”; production managers see “Opérateurs” and land on the same directory filtered to `OPERATOR`. The row-level tablet key controls are reused across desktop and mobile layouts. No second operator list/create/edit form exists. The tablet remains an isolated, touch-friendly workflow with loading, empty, pending, error, retry, and confirmation states.

Focused API tests cover key issuance/hash secrecy, access revocation, generic inactive-key rejection, existing User identity in tablet login/history, machine membership, bar starts, invalid machine boundaries, post-commit events, and run completion. Web UI tests cover tablet screens and the single shared user-directory navigation.

Run from the repository root:

```powershell
pnpm --filter @nim/api exec prisma migrate status
pnpm --filter @nim/api prisma:validate
pnpm --filter @nim/api prisma:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Deploy pending migrations safely with:

```powershell
pnpm --filter @nim/api exec prisma migrate deploy
```

Never reset the project database to apply this feature.

## Known follow-up

The tablet non-conformity flow currently captures and exposes open reports; return-to-production, rework/scrap/deviation resolution, and closure remain in the Quality lifecycle. Login throttling is process-local and needs a shared store before horizontal API scaling. The existing username/password production-operation path remains for compatibility with its own historical records; it is not a second user identity or a permanent machine assignment.
