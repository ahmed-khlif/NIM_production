# Domain Model

## User

`id, username, displayName, passwordHash, role, isActive, disabledAt?, lastLoginAt?, tabletAccessEnabled, connectionKeyId?, connectionKeyHash?, createdAt, updatedAt`

`OPERATOR` is a role on this same User record, not a separate person/profile table. Tablet credentials and tablet auth sessions are additional authentication data for the User; production and history references use `User.id`.

## Machine

`id, name, type, internalNumber, status, description?, location?, createdAt, updatedAt`
Statuses: ACTIVE, MAINTENANCE, INACTIVE.

## Piece

`id, reference/repère, quantity, profile, quality, lengthMm, unitWeightKg?, totalWeightKg?, designation, priority, dueDate, status, createdBy, createdAt, updatedAt, version`

## PieceUnit

One exemplar when quantity > 1.
`id, pieceId, sequenceNumber, status, currentMachineId?, currentOperatorId?, currentProductionOperatorId?, productionStatus, qualityStatus, startedAt?, manufacturedAt?, controlledAt?, qualityResult?, version`

## Assignment

`id, pieceUnitId, machineId, queuePosition?, assignedBy, assignedAt, unassignedAt?, active, reason?, version`
Reassignment creates a new assignment/history event rather than overwriting history.

## ProductionOperation

`id, pieceId, pieceUnitId?, machineId, operatorId, startedAt, completedAt?, status`

## QualityControl

`id, pieceId, pieceUnitId, controllerId, result, comment?, controlledAt, version`

The current phase stores one unit-level decision per PieceUnit. `CONFORM` moves the unit to `ACCEPTED`; `NON_CONFORM` moves it to `REJECTED` and requires a comment.

## HistoryEvent

Append-oriented: `id, eventType, pieceId?, pieceUnitId?, machineId?, actorUserId?, oldStatus?, newStatus?, metadata, timestamp`

## ImportBatch

`id, filename, status, rowsTotal, rowsCreated, rowsRejected, errors?, createdBy, createdAt, completedAt?`. A committed CSV, Tekla `.xls`, or `.xlsx` batch is immutable from the application surface and is linked to its `PIECE_IMPORTED` history events. Preview remains non-persistent.
