# Screen Inventory

## Common

Login, Profile, Change Password, Notifications, Unauthorized, Error, Offline state.

The authenticated desktop sidebar and mobile Sheet include an accessible, route-aware Pièces disclosure for the piece list, Tekla import, and Profils à traiter. When an Affaire is open, its workspace links expand beneath Affaires in both sidebars, stay available while navigating that Affaire, and highlight the active section. Role-filtered links match the workspace tabs; API authorization remains authoritative.

## Production Manager

Dashboard: bespoke workshop overview with fabrication progress, in-progress units, overdue pieces, open workshop non-conformities, and machine availability; priority actions; machine queue/in-progress counts; recent activity; overdue work; and persisted analytics. Trend panel: selectable server-validated production and quality activity for 7, 14, 30, or 90 days, with URL-persisted range, responsive line/breakdown charts, loading/error handling, and explicit no-activity/zero-denominator states. Machine capacity utilization is not shown because operating-time/capacity data is not collected.

Global shell: persisted light/dark/system theme toggle in the authenticated header, token-based dark surfaces for shared Shadcn components, readable legacy feature screens, and accessible labels.

Dashboard, Machine Resource Planning (Day/Week/Month), Offer Planning, Machine Planning, Schedule Create/Edit, Schedule Detail/Cancel, Unscheduled Bars, Pieces List, Create/Edit Piece, Piece Detail, Import, Import Preview, Profils à traiter / Façonnage preparation, Assignment Board, Reassignment, Machines List/Detail, Delayed Pieces, Production Monitor, History Search, Piece Timeline, Operator History, Machine History.

## Operator

Machine Selection, Operator Home, Current Machine, Assigned Queue, Production Detail, Start, Validate Unit, Finish, Recent Actions, Pending Offline Actions.

## Quality

The quality history now includes inspection-scoped defect categories and photos, role-guarded rework/remake/scrap/deviation controls, explicit administrator deviation approval, secure image upload/remove/streaming, and responsive mutation/error/empty states.

Pending Controls, Quality Detail, Conform/Non-conform, Quality History, Non-conforming List.

## Admin

Users List, Create/Edit/Detail, Disable/Reactivate, Machine Administration, Settings.

Implemented now: Users List with responsive desktop/mobile layouts, create/edit right-side Sheet, role assignment, password reset, search, status filtering, visible result counts, clear/reset controls, refresh feedback, loading/error/empty states, accessible table semantics, and disable/reactivate confirmation.

Implemented now: Machines List with responsive desktop/mobile layouts, create/edit right-side Sheet, status management, search, active bar counts, loading/error/empty states, and maintenance/reactivation confirmation.

Implemented now: Machines List status filtering, filtered result counts, clear/reset behavior, refresh feedback, and accessible machine-table captions.

Implemented now: Pieces workbench with the Tekla-aligned Repère/Profil/Qté/Qualité/Longueur/Poids/Pds Tot/Désignation table, unit progress, secure image indicators, search and profile/status/priority filters, accessible selection, client pagination, mobile horizontal scrolling, loading/error/empty states, and a next-step Façonnage action.

Implemented now: Manual piece creation/editing in a responsive shadcn Sheet with inline field validation, exact profile entry, editable catalog-backed kg/m, visible available raw lengths, total-weight calculation from kg/m × piece length × quantity, complementary priority/due-date fields, duplication as a new audited piece, and confirmation before archive (no hard delete).
The create sheet also supports multiple cut lengths for one profile, with per-length quantities and calculated weights; each row saves as a separate, uniquely referenced piece through one atomic batch request.

Implemented now: Assignment Board with responsive desktop/mobile layouts, pending-unit queue, active-machine filtering, right-side Sheets for unit assignment, reassignment, and reasoned removal, server-backed guards, search, loading/error/empty states, and role-aware management actions.

Implemented now: Assignment Board refresh controls, machine-scoped filtering, filtered result counts, clear/reset behavior, direct piece traceability links, and accessible assignment-table captions.

Implemented now: Operator Production Workspace with active machine selection, server-backed assigned queue, persisted start/completion actions, current-operation state, loading/error/empty states, responsive touch actions, and role-aware API guards.

Implemented now: Operator workflow refresh and status summaries, queue counts and priority visibility, direct piece traceability links, active-operation machine locking, explicit completion confirmation, mutation feedback, and coordinated cache refresh for dashboard/history/quality projections.

Implemented now: Quality Control with server-backed pending units and decision history, searchable responsive queue, right-side conform/non-conform inspection Sheet, mandatory non-conform comment, loading/error/empty states, and role-aware validation actions.

Implemented now: Quality workflow result counts, consultation-mode guidance, pending-unit and decision traceability links, clear-search behavior, result filtering, accessible queue captions, guarded dialog closing during submission, and coordinated cache refresh after validation.

Implemented now: History and Traceability with server-backed append-only events, event/entity/search filters, pagination, responsive desktop/mobile layouts, actor and context visibility, loading/error/empty states, and role-aware access.

Implemented now: History clear-search behavior, filter-state feedback, accessible table captions, and direct piece/machine context links derived from persisted event entities and metadata.

Implemented now: Dashboard with PostgreSQL-backed KPI metrics, machine load, recent activity, delayed pieces, active orders, responsive loading/error/empty states, and manager-only server authorization.

Implemented now: Dashboard shadcn-style Recharts visualizations for persisted machine load, piece status, unit lifecycle, and priority breakdown, with quality and delivery-risk summaries, responsive containers, text legends, and empty states.

Implemented now: Dashboard metric hierarchy focused on production progress, work in progress, deadlines, quality exceptions, and machine availability; removed duplicate metric tiles, misleading capacity-utilization percentages, and a fake refresh timestamp. Status/priority distributions use labeled proportional rows; event trends use unfilled lines; conformity is shown as unavailable until inspections provide a denominator.

Implemented now: Quality analytics with defect Pareto, treatment-decision breakdown, pending-deviation count, persisted API sourcing, and responsive chart empty states.

Implemented now: Production Planning / Ordonnancement MVP with a custom machine-row day/week timeline and month grid, paginated unscheduled assigned bars, Affaire/machine/operator/status filters, right-side shadcn create/edit/detail Sheets, cancel confirmation, responsive mobile event list, UTC persistence/Africa-Tunis display, permission-aware global/Offer/machine routes, and API conflict protection. Planned crew remains separate from live MachineSession membership and actual ProductionRun state.

Implemented now: Profile and password change with authenticated account context, server-side password validation, Argon2id persistence, session protection, password visibility toggles, confirmation matching, explicit password guidance, success/error feedback, and responsive layout.

Implemented now: Piece and Machine detail views with persisted unit traceability, active assignments, machine queues, Offer-linked bar lists, derived machine bar KPIs, scoped manager history, responsive tables/cards, and loading/error/empty/permission states. Maintenance detail includes an affected-bar filter, audited release action for not-yet-started bars, and clear handling for running/completed bars.

Implemented now: Offer workspace Barres and Affectations tabs, Offer-isolated bar list/detail pages, proportional cut visualization, persisted per-bar cutting proposals, partial validation with exact PieceUnit links, safe cancellation of only the unvalidated remainder, bulk bar-to-active-machine assignment with explicit confirmation, and responsive loading/error/empty states. Existing approved plans are migrated as fully validated proposals.

Implemented now: Piece Detail refresh and retry actions, copy-reference workflow, and accessible traceability table semantics.

Implemented now: CSV, Tekla HTML `.xls`, and `.xlsx` piece import with local selection/drag-and-drop, explicit three-step progress, server-returned source-column mapping, visible Surface-ignored state, row-level errors and non-blocking weight warnings, transactional commit, and responsive progress/error feedback. Replacing a selected file clears the previous preview so an invalid new file cannot leave an old import actionable.

Implemented now: import drag-and-drop, safe file replacement/removal, preview summary counters, accessible table caption, explicit busy states, warning visibility, and piece-list cache refresh after a committed transaction.

Implemented now: Profils à traiter with role-protected API data, strict IPE/HEA/UPN/L/ROND/OTHER grouping, exact search and family selection with an accessible indeterminate state, detected/selected/affected-row summaries, responsive selection controls, aggregated Façonnage requirements, loading/error/empty states, and append-only preparation history. The continuation stops at prepared profile/length/quantity requirements; it does not run cutting optimization.
Façonnage now guides users through distinct profile selection, raw-length configuration, and optimization review/validation stages. Families and profile forms collapse to reduce page length; after calculation, configuration is replaced by paginated bar selection, technical cut details are opt-in, validation actions remain sticky, and full validation links to assignments.

Implemented now: Piece Detail photo gallery with secure authenticated image streams, multiple-file selection, responsive preview/thumbnails, empty/loading/error states, role-aware upload/remove controls, 5 MB/10-image limits, and cache refresh after successful persistence. Piece rows also expose a cover thumbnail and photo count.

Implemented now: Settings and Notifications are authenticated, API-backed surfaces. Settings persist per-user density and unread-badge preferences and audit changes, expose dirty-state protection, reset and save confirmation; Notifications are a recipient-owned inbox separate from History, with persistent read/unread state, unread counts, event/search/unread filters, workflow links, pagination, refresh, and loading/error/empty states.

Implemented now: Login with server-backed credentials, inline validation/API error feedback, accessible password visibility control, loading state, secure-cookie session refresh, and responsive illustration/layout.

Implemented now: Illustration system uses the supplied login/security artwork on authentication, machine-maintenance artwork for machine/availability empty states, production-in-progress artwork for the active operator operation, and correctly dimensioned PWA icon metadata.

Implemented now: Protected-route session recovery with a distinct API/offline failure state, retry action, and login fallback; Unauthorized, not-found, and authenticated error states with safe navigation actions and incident references.

Implemented now: PWA foundation with a manifest, production service-worker registration for safe GET-only shell caching, cache-version cleanup, and an offline status banner that announces connection loss/recovery. Non-GET API requests are rejected at the shared client boundary while offline; no business write is queued or replayed.

Expected scope: roughly 25-35 distinct states with reusable layouts/components.

Operator screens: `/users?role=OPERATOR` (existing user directory with admin-managed username/password and role-gated tablet-access toggle; `/operators` redirects here), `/production/login` (username/password), `/production/tablet` (machine/team/session/bar queue), `/production/tablet/bars/:barId` (bar inspection/start confirmation), and `/production/tablet/runs/:runId` (running/finished state, right-side non-conformity report Sheet, start/finish confirmation). Admins use `/production` for the global monitor; managers enter via an Affaire in production. Offer Production, Quality, Dashboard, Machine detail, and Piece detail surface persisted operator-run/session/quality data. The tablet shell has no manager navigation and uses touch-sized controls.

# Client directory screens

`/clients` provides a searchable, paginated shared directory with visible sortable columns, server-side active/archived/all status filtering, and full-result Excel and print-to-PDF exports. It also has responsive create/edit/archive/restore controls. `/clients/:clientId` presents the client profile, image upload, contact details, and a print-ready A4 profile that can be saved as PDF. New and edited Affaires choose a registered client and can create a client inline. Client pages show loading, recoverable error, and contextual empty states.
