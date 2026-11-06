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

# Façonnage input and revision behavior

For each selected exact profile, managers may configure several raw lengths and optionally enter a maximum count available for each length. Blank count means no cap; zero means that length is unavailable. These counts constrain only the current optimization and do not create, decrement, reserve, or otherwise represent inventory.

A persisted fully validated plan may be revised only before production begins and only while all its generated bars remain unassigned. The operation cancels those bars and their proposals, releases their piece units to pending, returns a READY offer to DRAFT, and records an audit event. Assigned or started bars must be explicitly unassigned first; production history remains immutable.

Profile-family context is loaded from the selected detailed profiles in the existing profile catalog and shown on each optimization card. A separate Canon/template entity does not currently exist, so optimization must not invent or persist Canon data until that domain is specified.

# Shared client records

Affaires select a reusable client record instead of creating an unrelated free-text name. Creating a client requires its legal name, fiscal identifier, one telephone number, and one e-mail address; up to two additional telephone numbers and one additional e-mail address are optional. A client may also have an optional image. Authorized staff can search, update, archive/restore, and export a print-ready PDF profile. Archival preserves every existing Affaire association.
