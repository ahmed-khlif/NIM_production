# Product Requirements

## Context

NIM needs a responsive workshop application for assigning pieces to machines and tracking production in real time on desktop, tablet and mobile.

## Roles

### Administrator

Manages users, machines, settings and access.

### Production Manager

Creates/imports pieces, assigns/reassigns them, sets priorities, monitors production and history.

### Operator

Selects any machine, sees its queue, starts production, validates units one by one and finishes production.

### Quality Controller

Reviews completed work and marks it conform/non-conform with comments.

## Functional modules

- Authentication and role/permission control
- User management
- Machine management
- Piece management
- Excel/CSV import
- Assignment and reassignment
- Unit-by-unit production tracking
- Quality control
- Immutable traceability/history
- Production dashboard
- Realtime updates
- Responsive/PWA
- Offline synchronization later

## Piece attributes

Reference/repère, quantity, exact profile, quality, lengthMm in millimetres, unitWeightKg, imported totalWeightKg, designation, priority, dueDate, status. Tekla exports may include Surface, which is intentionally ignored.

## Main production flow

`UNASSIGNED -> ASSIGNED -> IN_PRODUCTION -> MANUFACTURED -> WAITING_QUALITY -> CONFORM/NON_CONFORM`

Every important transition records exact time, actor, machine, old state and new state.

## Quantity

For quantity 10, the system must support 0/10 ... 10/10 and preserve which operator/machine handled each unit.

## Façonnage demand estimate

Façonnage calculates raw-bar requirements from eligible PieceUnits, not the piece's original requested quantity. New pending units and approved remake work need a fresh cut; already assigned/produced units and rework do not. A manager provides candidate standard bar lengths and the measured saw kerf for each selected profile. NIM reports required bar counts and cut patterns. NIM does not track on-hand raw-bar quantities or reserve/consume stock; the result is an audited point-in-time estimate.

## Dashboard minimum

Global progress, in-production count, delayed pieces, active machines, maintenance machines, machine load and recent activity.

## Non-functional

Responsive touch UI, common operator actions in 1-2 touches, realtime without refresh, target page load under about 3s on workshop network, offline support later.
