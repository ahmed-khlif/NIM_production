# UX Flows

## Production Manager

The dashboard trend panel reads server-aggregated production and quality activity. Managers can select 7, 14, 30, or 90 days; the API validates the range. Loading, API error, and no-activity states remain visible, and the panel collapses responsively with the other shadcn-style charts.

Dashboard -> Pieces -> Create/Import -> Piece Detail -> Assignment Board -> Machine Queue -> Monitor -> History/Quality.

The authenticated shell provides a persisted theme toggle. Users can switch between light and dark mode from the header; the selected theme is stored locally, follows the system preference by default, and applies to shared cards, inputs, menus, dialogs, charts, and calendar surfaces.

The dashboard reads live summary metrics, machine load, order status, unit lifecycle, priority mix, quality conformity, defect categories, treatment decisions, pending deviations, delivery risk, delayed pieces, active orders, and recent persisted history through `/dashboard/overview`; it provides refresh and explicit loading/error/empty states. Reusable shadcn-style chart primitives render the persisted projections without introducing a second data source. Dense charts collapse into stacked responsive cards on smaller screens, and chart summaries remain visible as text for keyboard and assistive-technology users.

Offer metrics follow the production dashboard's shared KPI-card hierarchy. The Offer overview counts piece-unit states only; bar status and assignment indicators count bars only, and those measures are not combined into a single pipeline. The existing Offer Production view is unchanged; bar and assignment pages show only their own bar counts. Progress and quality alerts remain in their existing relevant views, with responsive cards and explicit loading/error states.

Planning is available to administrators and production managers at `/planning`. The Big Calendar view reads persisted piece due dates through `/pieces`, highlights delayed/high-priority work, and opens the corresponding piece traceability view when an event is selected.

The `/pieces` workbench presents the Tekla-facing data in a compact, horizontally scrollable table on small screens: Repère, exact Profil, Qté, Qualité, Longueur, Poids, Pds Tot, and Désignation. Search includes repère/profile/designation; the profile selector and existing status/priority filters, row selection, and pagination stay local to the persisted `/pieces` response. Manager actions open a shadcn right-side Sheet for manual add/edit, with inline validation and a read-only Poids × Qté total; duplication creates a separate server-validated piece, while archival is confirmed and preserves history. No project/affaire context is fabricated because the current data model has no Affaire entity.

For an `IN_PRODUCTION` Offer, production managers may edit business fields only on a piece whose full unit set is still `PENDING`; any piece with a shaped, assigned, started, or completed unit remains read-only. The API checks this inside a serializable transaction, records before/after values in the append-only history event, and increments the material revision. Creating, importing, duplicating, archiving, and changing a piece reference or quantity remain unavailable during production.

Import opens a three-step Tekla/CSV/Excel preview flow. Replacing a file clears any prior preview; nothing is committed until the server confirms zero invalid rows and the manager presses Importer. The server preview returns source-header mappings and the UI explicitly labels Surface as ignored, shows every row error and each non-blocking weight warning, then refreshes piece and profile queries after the transactional commit. Managers can then open Profils à traiter, search exact profile/family, select family subsets or individual profiles with checked/unchecked/indeterminate parent states, and review demand aggregated from eligible PieceUnits. Façonnage includes new pending units and remakes, excludes assigned/completed/rework units, and re-reads demand on the server when optimizing. The manager enters candidate standard bar lengths and the actual saw kerf; NIM calculates the required number of bars and cut patterns without tracking on-hand stock quantities or reserving pieces. The result is an audited point-in-time estimate, not a released bar or machine order.

The Pieces list supports local status and priority filtering over the authenticated API projection, reports the filtered result count, preserves the existing global search entry point, and exposes clear/reset actions. Rows show a secure cover thumbnail and photo count when available. The import flow accepts a CSV by selection or drag-and-drop, shows server preview counters and row-level errors, and invalidates the list cache only after a successful transactional commit. Piece Detail provides explicit refresh/retry feedback and copy-reference utility without changing domain state, plus a responsive piece-photo gallery. Managers can select multiple JPEG/PNG/WebP files, see upload progress and validation errors, preview thumbnails, and remove a photo through confirmation; read-only roles can view but not mutate the gallery.

The Assignment Board assigns individual PieceUnits, blocks unavailable machines, and provides reassignment/removal confirmations while keeping the previous assignment visible in history. In Façonnage, managers select individual persisted bar proposals and validate a subset; only those bars and exact units become real CuttingBars/FACONNEE units. The plan remains partially validated until all proposals are validated, and its remaining units can be handled later. “Supprimer le reliquat” removes only unvalidated proposals from the active plan; validated bars remain untouched and the removal stays in append-only history. The profile-selection action bar stays sticky at the bottom while scrolling so “Continuer vers Façonnage” and the live selection totals remain accessible. `READY` Offers can continue Façonnage for still-pending units; once production starts, Façonnage is locked. The Offer workspace provides Barres and Affectations tabs for generated bars, machine assignment, and piece/bar traceability.

The Assignment Board can be refreshed as a coordinated assignments/machines projection, filtered to one machine, and reset without losing server authority. Each visible piece links to its persisted traceability page. The Machines list provides status filtering and explicit refresh/result feedback; maintenance and inactive transitions still use the existing guarded API actions.

## Traceability

Login -> History -> Search/filter -> Event context -> Page through the append-only timeline.

The History page uses the persisted `HistoryEvent` stream, supports event/entity/search filters, desktop tables and mobile cards, pagination, refresh, loading/error/empty states, and role-aware access. Search can be cleared without losing pagination context, and entity or metadata references link directly back to persisted piece and machine views.

## Authentication and resilience

Login validates locally before calling `POST /auth/login`, keeps the submit action visibly busy, exposes API/network failures inline, and refreshes the authenticated user before navigating to the dashboard. The protected shell distinguishes an expired/absent session from an API or offline failure: unauthenticated users are redirected to Login, while recoverable infrastructure failures offer retry without silently discarding the session context.

The supplied illustrations are used by context: security artwork supports Login and the maskable app icon, machine-maintenance artwork explains unavailable machine states, and production-in-progress artwork reinforces an active operator operation. Empty states keep the illustration optional so filtered/no-result states remain compact and task-focused.

The offline banner announces loss and recovery of connectivity. GET reads may use the safe service-worker cache; all non-GET API calls are blocked before network dispatch while offline and are never queued or replayed. Error, not-found, and unauthorized views provide explicit recovery paths without exposing server stack traces.

## Operator

Login -> Select Machine -> Queue -> Select Piece -> Start -> Validate Unit -> Send to Quality.
The current implementation persists one production operation per PieceUnit, keeps the operator's active operation visible, and rejects duplicate/concurrent starts server-side. The operator workspace exposes an explicit refresh, queue/status summaries, priority and piece traceability context, locks machine switching while work is active, and confirms the irreversible handoff to quality before calling the guarded completion endpoint. Successful production mutations invalidate the related production, assignment, piece, quality, dashboard, history, and notification projections. Pause/resume is intentionally deferred because it remains an open business decision.

## Quality

### Non-conformance treatment

Each rejected inspection shows its defect category, authenticated defect-photo gallery, cycle number, and current treatment. Production managers can choose rework, remake, scrap, or request a deviation; administrators can approve or reject pending deviations. Rework/remake return the unit to production with a new quality cycle, scrap is terminal, and an approved deviation accepts the unit. Upload, mutation, loading, error, and empty states remain visible in the responsive desktop/mobile experience.

Login -> Pending List -> Piece -> Conform/Non-conform -> Comment -> Confirm.

The Quality page is server-backed at PieceUnit level. It provides a searchable pending queue, responsive desktop table/mobile cards, a focused decision dialog, mandatory non-conform comments and defect categories, success/error feedback, consultation-mode guidance for read-only managers, pending/result counts, direct piece links, local decision filtering, and a recent decision history. Rejected inspections expose the defect-photo gallery and role-aware treatment workflow. Validation and disposition changes refresh the related quality, piece, dashboard, history, and notification projections.

## Admin

Login -> Users/Machines/Settings -> Create/Edit/Disable.

Profile is available from the account menu and uses the secured password-change endpoint. The password form confirms the new value locally, supports safe visibility toggles, explains the server-enforced minimum, and reports both API failures and successful session protection. Settings and notifications are available as personal preference/activity surfaces; system-wide notification policy remains a future business domain.

Settings now stores personal density and activity preferences through `/settings`, prevents no-op saves, exposes reset-to-server behavior, and confirms a persisted update. The notification center presents recent role-scoped history events with local text/type filtering and retry feedback; it deliberately does not invent unread/acknowledgement business semantics. The web shell exposes an offline banner and safe read-only cache foundation; production mutations remain disabled offline.

User administration supports local search/status filtering, result counts, refresh and reset controls, responsive table/card layouts, guarded create/edit/password-reset flows, and explicit confirmation before account state changes. Server authorization, validation, persistence, session revocation, and audit events remain the source of truth.

The authenticated shell exposes a role-aware quick-navigation palette with `Ctrl+K`/`⌘K`, a real notification count from `/notifications`, an accurate role label, keyboard-visible focus states, and responsive navigation through the shadcn Sheet on small screens.

The primary sidebar keeps the Pièces workflow in one accessible collapsible group: Liste des pièces, Importer Tekla, and Profils à traiter. It opens automatically on Pièces routes, marks only the current destination active, and keeps import/preparation links visible only to administrators and production managers. The mobile Sheet uses the same navigation; server-side guards remain authoritative.

The desktop sidebar is pinned to the viewport: the brand and account controls remain visible while its navigation list scrolls independently. On mobile, the navigation remains scrollable inside the Sheet. When an Offer is open, the Offres group expands to show that Offer's Overview, Pieces, Tekla import, Façonnage, Production, Quality, and History routes; the active section is highlighted, and section visibility follows the same role rules as the Offer workspace tabs. The Offer workspace keeps its in-page tabs as a second, contextual navigation path.

On desktop, the sidebar remains fixed to the viewport during page scrolling; long navigation scrolls inside the sidebar, with the logo and account footer kept visible. The scrollbar is visually hidden to avoid appearing/disappearing when Pièces expands. The mobile drawer remains independently scrollable.

## Piece detail tabs

Overview, History, Quality, Documents (future-ready).

Desktop uses dense tables/sidebar; tablet simplifies navigation and enlarges actions; mobile converts dense tables into concise lists/cards where needed.

## Operator account and tablet flow

An administrator creates one normal application account with role `OPERATOR` in the shared Users page. A production manager can find that same account in the Operators-filtered view and issue/reset its one-time tablet key. The account's role, username, display name, and lifecycle are not duplicated in a separate operator directory. Tablet sign-in creates a separate short-lived tablet session, but machine membership, production runs, and audit history all use that account's existing User ID.

The operator experience is intentionally outside the manager sidebar: `/production/login` → active machine selection → optional helper selection → temporary session → that machine's assigned bars → start confirmation → running bar with elapsed timer → optional per-piece NC report → finish confirmation. A running bar can be resumed after refresh. Ending a session is blocked while a run remains active. Server-confirmed state is required before the UI presents success; network failures offer explicit retry.
