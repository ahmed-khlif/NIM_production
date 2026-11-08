# Production State Machine

## Offer status override (administrator)

The normal Offer lifecycle remains `DRAFT → READY → IN_PRODUCTION → COMPLETED`, with the existing server checks and production-driven start. An `ADMIN` can separately override an active Offer to any of those four statuses at any time. The override changes only `Offer.status` and its version, and atomically appends `OFFER_STATUS_OVERRIDDEN` with the prior/new status and actor. It does not cancel or rewind cutting bars, assignments, production runs, PieceUnit states, quality decisions, or approved plans. Consequently, the displayed Offer status can intentionally differ from the recorded shop-floor state after an override. `ARCHIVED` remains available only through the dedicated archive/restore workflow.

## Non-conformance lifecycle (implemented)

`NON_CONFORM` requires a server-validated comment and defect category. A production manager or administrator can choose `REWORK`, `REMAKE`, `SCRAP`, or request a `DEVIATION`. Rework and remake close active assignments, return the unit to `PENDING`, and create a new inspection cycle. Scrap moves the unit to terminal `SCRAPPED`. A deviation remains pending until an administrator explicitly approves or rejects it; approval moves the unit to `ACCEPTED`, while rejection preserves `REJECTED`. Defect photos belong to the exact inspection and remain available through authenticated, audited media endpoints.

```text
UNASSIGNED -> ASSIGNED -> IN_PRODUCTION -> MANUFACTURED -> WAITING_QUALITY
                                                        -> CONFORM
                                                        -> NON_CONFORM
```

| Current         | Next            | Actor                      |
| --------------- | --------------- | -------------------------- |
| UNASSIGNED      | ASSIGNED        | Production Manager         |
| ASSIGNED        | IN_PRODUCTION   | Operator                   |
| IN_PRODUCTION   | MANUFACTURED    | Operator                   |
| MANUFACTURED    | WAITING_QUALITY | System/Operator completion |
| WAITING_QUALITY | CONFORM         | Quality Controller         |
| WAITING_QUALITY | NON_CONFORM     | Quality Controller         |

Rules: transitions are server validated; production cannot start without active assignment; a maintenance machine cannot receive new work; the same PieceUnit cannot be completed twice; quality cannot precede manufacturing completion; a PieceUnit can be quality-validated only once in the current phase; `NON_CONFORM` requires a comment and is terminal until rework/scrap behavior is decided.

## Cutting bars and machine assignment

```text
 PENDING PieceUnit --selected proposal validation--> FACONNEE PieceUnit
FACONNEE bar + units --manager assigns active machine--> AFFECTEE bar + ASSIGNED units
AFFECTEE bar --session operator starts ProductionRun--> LANCEE bar
LANCEE bar --session lead finishes ProductionRun--> FABRIQUEE bar
AFFECTEE bar + units --manager removes before production--> FACONNEE bar + units
FACONNEE bar + units --manager cancels--> CANCELLED bar + PENDING units
```

Assignment and unassignment are atomic, Offer-scoped, server-authorized, and recorded in history. A bar cannot be removed after production starts; cancellation is a soft state transition and closes membership rather than deleting the bar. Unit `Assignment` rows remain a compatibility projection for queue and traceability; bar lifecycle transitions are controlled only by the bar assignment and `ProductionRun` services. Legacy `ProductionOperation` endpoints reject units in actively assigned bars and cannot independently change bar state.

Cutting plans now move `DRAFT → PARTIALLY_VALIDATED → VALIDATED`, or `DRAFT/PARTIALLY_VALIDATED → CANCELLED`. Each proposal independently moves `PROPOSED → VALIDATED` or `PROPOSED → CANCELLED`. Validation locks the Offer and plan rows, checks the current material revision and exact pending PieceUnit IDs, then materializes only selected bars in one transaction. Cancelling a partial plan cancels only its unvalidated proposals; generated bars and their history remain intact. A `READY` Offer may continue preparation and optimization for eligible `PENDING` units; `IN_PRODUCTION` remains locked against additional façonnage.

## Production planning lifecycle (Phase 2A)

```text
MachineBarAssignment = WHERE a bar is assigned
ScheduleEvent        = WHEN a machine is reserved and WHO is planned
MachineSession       = WHO is actually present at the machine
ProductionRun        = WHAT physically happened
```

`ScheduleEvent` is separate from the bar/run lifecycle. Production scheduling requires an `AFFECTEE` bar with one active assignment and uses that assignment’s exact machine; Planning cannot silently reassign it. `MAINTENANCE` and `MACHINE_BLOCK` reserve time without changing machine status. All active event types conflict on overlapping machine intervals, and a lead/helper cannot be planned on overlapping event intervals. PostgreSQL advisory transaction locks serialize resource checks.

Events are `PLANNED` or `CANCELLED`. Cancellation keeps the event and roster in the database and appends history; it never rolls back assignment, PieceUnit, bar, session, run, or quality facts. If a real run starts, that fact remains solely in `ProductionRun`; the corresponding planned slot can be cancelled as obsolete, while editing it is blocked. Before removing an assigned bar from its machine, cancel its active planned production slot first.

## Operator tablet execution

`PieceUnit.productionStatus`: `PENDING → FACONNEE → AFFECTEE → LANCEE → FABRIQUEE`.
`CuttingBar.status`: `FACONNEE → AFFECTEE → LANCEE → FABRIQUEE`.
`PieceUnit.qualityStatus` and `CuttingBar.qualityStatus` remain independent (`NOT_INSPECTED`, `CONFORME`, `NON_CONFORME`). Reporting a tablet defect changes only quality state; finishing a run changes only physical production state and does not clear an NC warning. Legacy User-based operations remain available only for standalone unit assignments; an active bar assignment must be started and finished through `ProductionRun`.

`MachineSession` is temporary and belongs to one active machine/team. `ProductionRun` is one persisted bar execution; only one may be running per bar, machine, or session. Starting requires an active session membership, active machine, active bar assignment, matching unit assignments, a production-ready Offer, and ready PieceUnits. Finishing requires the same active membership and a running run. An operator may cancel a running launch only while every unit remains in progress and no quality issue is open; the run remains auditable as `CANCELLED`, and the bar/units return to `AFFECTEE`/`ASSIGNED`. A launch cancellation never erases the run or history. `NonConformity` capture is allowed only for a PieceUnit in the active bar/run; one open report per unit is enforced in the database. Resolution is deferred to Phase 3.
