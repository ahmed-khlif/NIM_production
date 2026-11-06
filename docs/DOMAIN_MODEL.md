# Domain Model

## User

`id, username, displayName, passwordHash, role, isActive, disabledAt?, lastLoginAt?, tabletAccessEnabled, createdAt, updatedAt`. Tablet auth uses the User's existing username and password hash.

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

## Notification

Recipient-specific inbox row: `id, recipientUserId, sourceEventId?, eventType, title, message, href, actorName?, offerId?, entityType?, entityId?, readAt?, createdAt`. It is created in the same database transaction as its source business change, is deduplicated per source event and recipient, and never replaces or deletes `HistoryEvent`. Read state is personal to the recipient. Old history is not synthesized into notifications. Operators are targeted through their current active `MachineSession` membership, not a permanent machine assignment; administrators and production managers receive relevant global work changes because the current model has no manager-to-Affaire assignment.
