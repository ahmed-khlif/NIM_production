# Screen Inventory

## Common

Login, Profile, Change Password, Notifications, Unauthorized, Error, Offline state.

The authenticated desktop sidebar and mobile Sheet include an accessible, route-aware Pièces disclosure for the piece list, Tekla import, and Profils à traiter. Manager-only destinations are hidden from other roles in navigation and remain protected by API authorization.

## Production Manager

Dashboard trend panel: selectable server-validated production and quality activity for 7, 14, 30, or 90 days, with responsive chart, loading/error handling, and an explicit no-activity state.

Global shell: persisted light/dark/system theme toggle in the authenticated header, token-based dark surfaces for shared Shadcn components, readable legacy feature screens, and accessible labels.

Dashboard, Planning Calendar, Pieces List, Create/Edit Piece, Piece Detail, Import, Import Preview, Profils à traiter / Façonnage preparation, Assignment Board, Reassignment, Machines List/Detail, Delayed Pieces, Production Monitor, History Search, Piece Timeline, Operator History, Machine History.

## Operator

Machine Selection, Operator Home, Current Machine, Assigned Queue, Production Detail, Start, Validate Unit, Finish, Recent Actions, Pending Offline Actions.

## Quality

The quality history now includes inspection-scoped defect categories and photos, role-guarded rework/remake/scrap/deviation controls, explicit administrator deviation approval, secure image upload/remove/streaming, and responsive mutation/error/empty states.

Pending Controls, Quality Detail, Conform/Non-conform, Quality History, Non-conforming List.

## Admin

Users List, Create/Edit/Detail, Disable/Reactivate, Machine Administration, Settings.

Implemented now: Users List with responsive desktop/mobile layouts, create/edit dialog, role assignment, password reset, search, status filtering, visible result counts, clear/reset controls, refresh feedback, loading/error/empty states, accessible table semantics, and disable/reactivate confirmation.

Implemented now: Machines List with responsive desktop/mobile layouts, create/edit dialog, status management, search, active bar counts, loading/error/empty states, and maintenance/reactivation confirmation.

Implemented now: Machines List status filtering, filtered result counts, clear/reset behavior, refresh feedback, and accessible machine-table captions.

Implemented now: Pieces workbench with the Tekla-aligned Repère/Profil/Qté/Qualité/Longueur/Poids/Pds Tot/Désignation table, unit progress, secure image indicators, search and profile/status/priority filters, accessible selection, client pagination, mobile horizontal scrolling, loading/error/empty states, and a next-step Façonnage action.

Implemented now: Manual piece creation/editing in a responsive shadcn Sheet with inline field validation, exact profile entry, read-only server-consistent total-weight calculation, complementary priority/due-date fields, duplication as a new audited piece, and confirmation before archive (no hard delete).

Implemented now: Assignment Board with responsive desktop/mobile layouts, pending-unit queue, active-machine filtering, unit-level assignment, reassignment and removal dialogs, server-backed guards, search, loading/error/empty states, and role-aware management actions.

Implemented now: Assignment Board refresh controls, machine-scoped filtering, filtered result counts, clear/reset behavior, direct piece traceability links, and accessible assignment-table captions.

Implemented now: Operator Production Workspace with active machine selection, server-backed assigned queue, persisted start/completion actions, current-operation state, loading/error/empty states, responsive touch actions, and role-aware API guards.

Implemented now: Operator workflow refresh and status summaries, queue counts and priority visibility, direct piece traceability links, active-operation machine locking, explicit completion confirmation, mutation feedback, and coordinated cache refresh for dashboard/history/quality projections.

Implemented now: Quality Control with server-backed pending units and decision history, searchable responsive queue, conform/non-conform dialog, mandatory non-conform comment, loading/error/empty states, and role-aware validation actions.

Implemented now: Quality workflow result counts, consultation-mode guidance, pending-unit and decision traceability links, clear-search behavior, result filtering, accessible queue captions, guarded dialog closing during submission, and coordinated cache refresh after validation.

Implemented now: History and Traceability with server-backed append-only events, event/entity/search filters, pagination, responsive desktop/mobile layouts, actor and context visibility, loading/error/empty states, and role-aware access.

Implemented now: History clear-search behavior, filter-state feedback, accessible table captions, and direct piece/machine context links derived from persisted event entities and metadata.

Implemented now: Dashboard with PostgreSQL-backed KPI metrics, machine load, recent activity, delayed pieces, active orders, responsive loading/error/empty states, and manager-only server authorization.

Implemented now: Dashboard shadcn-style Recharts visualizations for persisted machine load, piece status, unit lifecycle, and priority breakdown, with quality and delivery-risk summaries, responsive containers, text legends, and empty states.

Implemented now: Quality analytics with defect Pareto, treatment-decision breakdown, pending-deviation count, persisted API sourcing, and responsive chart empty states.

Implemented now: Planning Calendar using `react-big-calendar`, authenticated persisted piece due dates, priority/delay event styling, piece-detail navigation, and responsive agenda/month views.

Implemented now: Profile and password change with authenticated account context, server-side password validation, Argon2id persistence, session protection, password visibility toggles, confirmation matching, explicit password guidance, success/error feedback, and responsive layout.

Implemented now: Piece and Machine detail views with persisted unit traceability, active assignments, machine queues, Offer-linked bar lists, derived machine bar KPIs, scoped manager history, responsive tables/cards, and loading/error/empty/permission states.

Implemented now: Offer workspace Barres and Affectations tabs, Offer-isolated bar list/detail pages, proportional cut visualization, persisted per-bar cutting proposals, partial validation with exact PieceUnit links, safe cancellation of only the unvalidated remainder, bulk bar-to-active-machine assignment with explicit confirmation, and responsive loading/error/empty states. Existing approved plans are migrated as fully validated proposals.

Implemented now: Piece Detail refresh and retry actions, copy-reference workflow, and accessible traceability table semantics.

Implemented now: CSV, Tekla HTML `.xls`, and `.xlsx` piece import with local selection/drag-and-drop, explicit three-step progress, server-returned source-column mapping, visible Surface-ignored state, row-level errors and non-blocking weight warnings, transactional commit, and responsive progress/error feedback. Replacing a selected file clears the previous preview so an invalid new file cannot leave an old import actionable.

Implemented now: import drag-and-drop, safe file replacement/removal, preview summary counters, accessible table caption, explicit busy states, warning visibility, and piece-list cache refresh after a committed transaction.

Implemented now: Profils à traiter with role-protected API data, strict IPE/HEA/UPN/L/ROND/OTHER grouping, exact search and family selection with an accessible indeterminate state, detected/selected/affected-row summaries, responsive selection controls, aggregated Façonnage requirements, loading/error/empty states, and append-only preparation history. The continuation stops at prepared profile/length/quantity requirements; it does not run cutting optimization.

Implemented now: Piece Detail photo gallery with secure authenticated image streams, multiple-file selection, responsive preview/thumbnails, empty/loading/error states, role-aware upload/remove controls, 5 MB/10-image limits, and cache refresh after successful persistence. Piece rows also expose a cover thumbnail and photo count.

Implemented now: Settings and Notifications are authenticated, API-backed surfaces. Settings persist per-user density/activity preferences and audit changes, expose dirty-state protection, reset and save confirmation; Notifications show role-scoped recent history activity with search/type filters, result feedback, refresh, loading/error/empty states, and explicit append-only semantics.

Implemented now: Login with server-backed credentials, inline validation/API error feedback, accessible password visibility control, loading state, secure-cookie session refresh, and responsive illustration/layout.

Implemented now: Illustration system uses the supplied login/security artwork on authentication, machine-maintenance artwork for machine/availability empty states, production-in-progress artwork for the active operator operation, and correctly dimensioned PWA icon metadata.

Implemented now: Protected-route session recovery with a distinct API/offline failure state, retry action, and login fallback; Unauthorized, not-found, and authenticated error states with safe navigation actions and incident references.

Implemented now: PWA foundation with a manifest, production service-worker registration for safe GET-only shell caching, cache-version cleanup, and an offline status banner that announces connection loss/recovery. Non-GET API requests are rejected at the shared client boundary while offline; no business write is queued or replayed.

Expected scope: roughly 25-35 distinct states with reusable layouts/components.

Phase 2 operator screens: `/users?role=OPERATOR` (existing user directory with role-gated tablet-key management; `/operators` redirects here), `/production/login`, `/production/tablet` (machine/team/session/bar queue), `/production/tablet/bars/:barId` (bar inspection/start confirmation), and `/production/tablet/runs/:runId` (running/finished state, NC capture, finish confirmation). Offer Production, Quality, Dashboard, Machine detail, and Piece detail surface persisted operator-run/session/quality data. The tablet shell has no manager navigation and uses touch-sized controls.
