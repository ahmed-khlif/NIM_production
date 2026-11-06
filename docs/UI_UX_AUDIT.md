# NIM Platform UI/UX Audit and Gap Analysis

**Audit date:** 2026-10-15  
**Scope:** Manager web application, shared navigation and UI primitives, primary production workflows, API-backed lists, responsive behavior, and existing automated UI coverage.

## Executive summary

The platform has a coherent industrial visual direction and a useful domain flow: offers contain pieces, pieces become unit-level work, units are assigned to machines, production is executed, and quality/history preserve the result. The strongest UX risks are systemic rather than decorative: several operational lists load all rows (or stop at a fixed cap) instead of using a consistent server pagination contract; most filters live only in component state; and authenticated mobile/tablet coverage has been limited.

This audit applies a cross-platform interaction baseline to shared controls: buttons, inputs, selects, menu items, and tabs now meet the project's 44px minimum target; focus rings are more visible; and buttons provide restrained pressed feedback. The shared header's search icon opens a compact search field beneath it; submitting opens a dedicated results page across Affaires, pieces, machines, and production bars, with role-scoped results, loading/partial-error/empty feedback, pagination, and direct navigation to each match. Existing loading, empty, and error patterns are preserved.

## Phase 1 — Structural audit

### Navigation and workflow

- The app shell has role-aware navigation, a mobile navigation sheet, keyboard-accessible quick navigation, notification access, and account actions.
- The offer workspace organizes related sections (overview, pieces, faconnage, bars, assignments, production, and quality) under the selected offer. This keeps the domain context visible and is preferable to duplicating a separate operator directory: operator identities are existing `User` records with the `OPERATOR` role.
- The manager path is understandable, but the overall workflow does not yet communicate one persistent “next action” across every offer state. A future workflow/status panel should derive the next valid action from server state and permissions, rather than duplicating transition rules in React.
- Global search requests were previously limited to Affaires and retained their input after route changes. The header now submits to a dedicated full results page that searches multiple workspace entities through their existing paginated API queries.

### Lists, pagination, and data handling

| Area                            | Current behavior                                                                     | UX / scale impact                                                                                        | Priority |
| ------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------- |
| History                         | Validated server-side page and page-size contract                                    | Good baseline; reuse this contract                                                                       | —        |
| Pieces                          | API returns the full offer's pieces; UI filters and paginates in memory              | Payload and render cost grow with the offer; page controls do not reduce server work                     | P1       |
| Assignments                     | Active assignments and assignable units are fetched as full collections              | Large queues become slow and difficult to scan                                                           | P1       |
| Pending quality                 | All pending units returned; quality history capped to latest 100                     | Pending queue can grow without bound; older history is silently unavailable through this list            | P1       |
| Machines                        | Full machine directory returned                                                      | Usually a smaller collection, but has no consistent contract as installations grow                       | P2       |
| Cutting bars / bar assignments  | Offer-scoped collections returned without paging                                     | Large jobs can produce heavy responses and long tables                                                   | P1       |
| Offers                          | API applies search but returns at most 250 rows; client handles additional filtering | Results beyond the cap are inaccessible, with no page metadata explaining the limit                      | P1       |
| Notifications / recent activity | Previously projected activity rather than an owned inbox                             | Replaced on 2026-10-23 by recipient-targeted notifications, persistent read state, and a paginated inbox | Resolved |

**Required next step:** define one validated list response (`items`, `page`, `pageSize`, `total`, `totalPages`) and apply server-side filtering, stable sorting, and pagination. Start with pieces, pending quality, assignments/available units, and bars; then migrate offers and the remaining directories. Use cursor pagination for very large append-heavy histories if measurements justify it. Do not add only client-side pagination to a full response.

### Responsive and accessibility review

- The design uses responsive layouts and mobile-specific card/table treatments in key operational views; tables that remain tabular can scroll horizontally.
- Shared buttons, form controls, tabs, and menu actions now have at least 44px targets, improving touch use across phone and tablet sizes.
- Keyboard focus styling and reduced-motion CSS already exist. Button press feedback is deliberately subtle and should not be the only indication that an action succeeded.
- Existing browser tests checked primary desktop routes. A new browser test exercises primary authenticated routes at 375px and 768px and asserts no document-level horizontal overflow. This checks layout integrity, not every nested table's ideal reading experience.
- A complete keyboard-only and screen-reader audit, touch testing on physical devices, and screenshot comparison for all role-specific and data-heavy screens remain outstanding.

### Visual consistency and interaction behavior

- The shared shadcn-style component layer provides a good basis, but several screens still implement their own filter bars, tables, action menus, and mobile representations. The existing `DataTableShell` and `FilterBar` are not used consistently.
- Shared control sizing, focus treatment, and pressed state are now more consistent. Existing colors and page layouts were retained where no functional friction was demonstrated.
- Dark-mode compatibility exists, but a full token-driven theme and visual regression baseline are not established; verify all routes in both themes before claiming parity.
- Empty, loading, and error states are present in the application and should remain part of future list refactors. For long-running imports and production actions, retain explicit progress/success/failure feedback and prevent duplicate submissions.

## Phase 2 — Enhancements applied

- Raised shared button, input, select, tab, and dropdown-menu action targets to the 44px minimum.
- Improved keyboard focus ring visibility and added a small pressed-state response to buttons.
- Replaced the offer-only header field with a search form that opens a dedicated app-wide results page for Affaires, pieces, machines, and production bars. Results use existing authorized server search endpoints and navigate directly to the matching record; the submitted query is scoped to `/search` and does not carry into other pages.
- Added a shared component regression test for button, icon-button, and input touch-target sizing.
- Added browser viewport coverage for primary authenticated pages at common phone and tablet widths.

These are shared improvements applied across routes, not a claim that every individual page has been visually redesigned or that every domain sub-route has been exercised with every role and data state.

## Gap analysis

### 1. Critical missing user-facing capabilities

1. **True server-side pagination for operational lists.** In-memory pagination does not cap API payloads or database work, and fixed caps can hide records. This is the highest-impact gap for large production orders.
2. **Filter and sort state that survives navigation.** Many list filters are local component state rather than URL query state. Refresh, back/forward navigation, and sharing a filtered view can lose the user's context.
3. **Consistent list feedback and recovery.** As list APIs are migrated, every view needs a clear loading, empty, error/retry, and no-results state, plus an explicit indication when filters are active.
4. **Full authenticated responsive journey coverage.** Current viewport checks cover primary manager pages, but not every offer sub-route, tablet operator/production session, or permission-specific state.

### 2. Remaining technical and design bottlenecks

- Full-collection Prisma queries increase API memory, response size, and frontend rendering cost. Nested relation includes can multiply this cost.
- Fixed limits (for example, offer and quality history caps) are not communicated as pagination and can make older data appear missing.
- Filters and table implementations are repeated across features, creating inconsistent keyboard behavior, pagination affordances, and responsive handling.
- URL state is not yet the common source of truth for filters/search/sort/page.
- Dark-theme compatibility is not the same as verified dark-theme parity; there is no comprehensive screenshot/visual-regression suite.
- Automated viewport checks detect page-level overflow but cannot establish comfortable table scanning, modal reachability, or touch ergonomics on real devices.

### 3. Scalability recommendations

1. Adopt a shared, validated server list-query contract with bounded page sizes, allow-listed sorting, filters, stable tie-break ordering, and total counts (or cursor metadata where counts are too costly).
2. Move filters, search, sort, and page into URL query state; debounce text input and reset page when filters change.
3. Add database indexes based on measured query plans for frequently filtered/sorted fields; avoid speculative indexes and verify with production-shaped data.
4. Standardize a reusable accessible data-list pattern: desktop table, mobile cards, selection/actions, loading skeleton, empty/no-results/error states, and server-backed pagination.
5. Add E2E coverage for each role's primary task at phone/tablet/desktop widths, plus keyboard navigation and visual snapshots for light and dark themes.
6. Measure API response size, list query latency, and frontend render time before selecting page sizes or introducing virtualization. Virtualize only when paged results still need it.

## Verification record

### Table scanning consistency — 2026-10-29

- All manager data tables now expose a consistent neutral sort indicator in every column header, with sticky headers, clearer alignment, and improved hover contrast.
- Interactive sorting uses the shared shadcn/TanStack `DataTable`; server-paginated lists do not pretend to sort only the current page.
- Material-profile catalogue and import preview tables now use the same data-table treatment as operational lists.

The shared UI component tests and targeted browser tests are run for this audit. Full lint, typecheck, test, E2E typecheck/lint, and production build results are recorded at handoff; browser coverage is limited to the route and viewport set described above.

## Browser walkthrough follow-up — 2026-10-16

- Logged in through the real UI and reviewed rendered desktop screens for Dashboard, Offers, Offer overview and workflow tabs, Machines, Quality, History, Users, Operators, Settings, Notifications, Profile, Planning, and the operator login. The Offer detail view confirmed that piece, import, façonnage, bars, assignments, production, quality, and history belong to an Offer context.
- The legacy top-level `/pieces`, `/pieces/import`, and `/pieces/faconnage` routes intentionally redirect to `/offers`; use an Offer’s tabs for that work. This is expected routing, not a missing page.
- The machine-detail screen returned a generic internal-server error when a machine had assigned bars. `MachinesService.getMachine` passed a Prisma `select` object as `include` for the nested CuttingBar; changing it to `select` restored the detail response and its persisted bar list. A service regression test and authenticated browser/API test now cover this case.
- Inspection also found machine activity entries showing raw English event identifiers in an otherwise French interface. History labels now live in one shared mapping and cover machine/bar lifecycle events and other newer event types. Machine summary cards use a two-column phone layout, and the offer-search hint is shortened so it is legible in the narrow header.
- Verified the repaired machine detail with active bars at desktop and 390px, with no page-level horizontal overflow. This is targeted responsive coverage, not a claim that every role-specific screen or every empty/error state has been visually certified.

### Still prioritized

1. Complete per-role visual journeys for Offer sub-routes and the authenticated operator tablet, with real data and empty/error states.
2. Server-side pagination and URL-backed filter/search state for large lists, as described above.
3. Reduce the dashboard’s long-page cognitive load by making its priority actions and key exceptions easier to scan before secondary charts.
4. Verify dark-theme parity, keyboard navigation, and touch behavior across all route families.

## Audit follow-up — 2026-10-16

- The authenticated primary-page viewport journey passed at 375px and 768px before the latest shared-button sizing change. A follow-up rerun after that change did not reach the viewport assertions: the login submit remained busy until the 180-second E2E timeout. API readiness and the web login page returned HTTP 200 during follow-up checks, so the browser login/API interaction needs a separate diagnosis before claiming a post-change E2E pass.
- Closed a shared touch-target gap: local width overrides could shrink icon buttons below the design-system minimum even though their height remained 44px. Shared buttons now enforce a 44px minimum in both dimensions, and the sidebar logout control follows the same rule.
- Focused touch-target regression test, web lint, typecheck, and production build pass. The full web UI suite currently has 11 failures, including missing `TooltipProvider` in sidebar tests, a duplicate planning-calendar test ID, and stale machine/quality assertions.
- Confirmed this is a cross-page fix through the shared component layer; it does not change business rules or API behavior.
- Remaining whole-platform work is still substantive: server-side pagination for large operational lists, URL-persisted filters, verified dark-mode parity, and visual/keyboard review of offer sub-routes and operator tablet states. Passing viewport checks establish no page-level horizontal overflow, not a complete visual or accessibility certification.

## Final browser and build verification — 2026-10-16

- Authenticated browser tests directly opened all nine Offer workspace routes at desktop width and verified the active tab and successful page response. Four key Offer workspaces (pieces, façonnage, assignments, production) also passed 390px overflow checks. Screenshots are stored under `test-results/ui-audit/`.
- The machine-detail API/UI regression journey and the primary manager-route journey passed. E2E lint and typecheck passed.
- Production build passed for the web and API packages. The development web and API endpoints remained available afterward (HTTP 200).
- The full web component suite still has 11 known failing assertions documented above; this audit's targeted regression and browser checks pass, but the entire test suite is not green.

## Pieces-list scalability follow-up — 2026-10-16

- Replaced browser-only filtering/pagination in the Pieces workbench with validated API filtering and bounded database pagination (`pageSize` max 100). The API returns total counts and profile options scoped to the current Offer; the current page is the only set of piece/unit summaries rendered by the workbench.
- Search, exact profile, page, and page size are synchronized with the URL. Search requests are debounced; changing a filter resets the page. Empty filtered results are distinguished from a genuinely empty Offer.
- The Planning calendar explicitly fetches all API pages because it displays due dates across the entire portfolio; it no longer accidentally sees only the first default page.
- Added validation/service tests and an authenticated API E2E check for bounded page size and exact profile filtering. Recheck query plans and response latency with production-sized data before selecting indexes or claiming a measured performance target.
- The live E2E check passed after restarting the Next.js development server: production builds replace the shared `.next` output and can leave the already-running dev server unresponsive. The web and API health endpoints both returned HTTP 200 after restart.

### Test-suite reconciliation - 2026-10-16

- The earlier 11 web-test failures were subsequently resolved: sidebar tests now mount with their required tooltip context, the planning mock no longer duplicates a test ID, and machine/quality assertions match the current UI workflow.
- The Pieces pagination fixture now returns the complete server-paged response shape. The Quality workflow test returns to the pending-inspection tab before opening an inspection dialog; it had previously attempted that action while the History tab was active.
- Current full web suite result at this audit checkpoint: 51 tests passed across 3 files. Later additions extend the suite; this clears those known failures but does not constitute whole-platform visual/accessibility certification or complete the remaining list-pagination roadmap.

### Dashboard action hierarchy - 2026-10-16

- Added an API-derived “À traiter en priorité” section before the dashboard KPI wall. It links overdue pieces, workshop non-conformities, pending quality checks, and maintenance machines to their existing workspaces, and gives a calm all-clear state when no exceptions are present.
- This is a presentation of persisted summary counts only; it does not introduce client-side production rules or replace detailed workflow queues. A component regression test verifies the links and exception list.
- Updated two outdated browser assertions to match current product behavior: production managers may list operator accounts (the API scopes the response to OPERATOR users), and the deprecated global unit-assignment route redirects to the Offer-based bar-assignment workflow.
- The full Playwright suite now passes 13/13, including authenticated role boundaries, primary routes, Offer workspace routes, server pagination, phone/tablet overflow checks, and non-mutating management-dialog journeys.

### Login controls - 2026-10-16

- Removed the submit button's hydration-only disabled state. It is disabled only while the login request is actually submitting, and the existing submitting/error feedback remains in place.
- Added a regression test that toggles password visibility on and off and submits valid credentials through the login request mock.

### Offer detail and LCP follow-up - 2026-10-17

- The reported LCP node is the Offer-status guidance banner in the Pieces workbench. It only renders after the Offer query resolves, so it is a client-data-dependent LCP candidate; a local development-mode measurement alone does not establish production LCP.
- Reduced Offer detail summary work: piece counts/quantities/profiles now use database aggregation, manufactured units use a count query, and plan summaries are bounded to five recent rows. This avoids loading every PieceUnit solely to calculate the summary while preserving plan precedence and normalized profile counting.
- No numeric LCP improvement is claimed until measured against a production build with a repeatable browser trace and representative Offer data. The authenticated page walkthrough should confirm the Offer detail and Pieces paths still render correctly.
- Faconnage optimization still solves before opening its write transaction. Its atomic availability check, plan/proposal writes, and audit event now use a 30-second Prisma transaction timeout (10-second acquisition wait), addressing the reported expiry at approximately 5 seconds without moving solver work into the transaction.

### Database pagination and durable list context — 2026-10-17

- Main operational directories now use server-side filtering and bounded database pagination, including Offers, pieces, bars, assignments, notifications/history, users, machines, quality queues, the tablet queue, planning's visible date range, and production monitoring. Machine detail bars and its unit queue were also bounded; machine-wide metrics and the currently running job stay independent of the selected page.
- Offers, Machines, Users, Activity, Offer bars/assignments/production monitoring, Quality queues/history, the operator tablet queue, and the global History list now keep their relevant search/filter/page/page-size state in the URL. Refresh and shared links restore list context, browser back/forward updates controls, and unrelated query parameters are preserved. Temporary selections and dialog state remain local.
- Added regression tests for the shared URL-state helper and prior machine/notification pagination changes. Current full-suite counts: API 120 tests and web 55 tests; no production-sized latency or LCP claim is made without representative data and a browser trace.
- Remaining: exercise complete operator/quality role journeys at phone/tablet sizes; measure real PostgreSQL query plans and response/render times before adding speculative indexes or virtualization; verify light/dark and keyboard behavior across route families.

### Dashboard metric hierarchy and analytics clarity — 2026-10-17

- Reframed the dashboard around five workshop decisions: fabrication progress, units currently in progress, overdue pieces, open workshop non-conformities, and active/maintenance machine counts. Removed the repeated KPI wall and the secondary “day context” card so priority actions, active flow, exceptions, and analytics are easier to scan.
- Removed the so-called machine utilization metric from the API contract and UI. It divided queued/in-progress counts and was not time- or capacity-based; the dashboard now reports those actual counts explicitly. A service regression assertion protects the contract from reintroducing that misleading field.
- Replaced generic status/priority donuts with labeled proportional breakdowns and overlapping filled activity areas with daily line trends. Quality conformity and its progress bar are both withheld when there are no completed inspections rather than showing a false 0%; chart gridlines follow the light/dark design tokens.
- Dashboard trend range is retained in the URL; the displayed update time comes from the query timestamp rather than rendering the current clock as if it were a refresh. Responsive shadcn surfaces and existing API-backed sources are retained.
- Remaining data opportunity: true machine utilization needs rated capacity, shift calendars/downtime, and persisted operating intervals. Until those data exist, counts are honest and actionable; no utilization KPI or performance improvement is claimed.

### Shared shadcn interaction baseline — 2026-10-19

- Refined the shared page heading used across manager screens: neutral uppercase context label, consistent token-based title/description colors, constrained readable description width, and grouped responsive page actions. NIM red remains reserved for meaningful actions and states rather than repeating as decorative heading color.
- Updated shared semantic status badges with matching dark-theme surfaces and text contrast without changing status meaning.
- Made the shared page-size control a 44px touch target and exposed pagination as a named navigation landmark.
- Added focused component tests for page-heading hierarchy/actions, pagination semantics/touch sizing, and dark-mode status colors. These shared changes improve consistency but do not certify every page visually; role-specific browser review and full light/dark accessibility coverage remain outstanding.

### Layout rhythm and table-style scoping — 2026-10-20

- Adjusted the shared authenticated content gutter to use a consistent 16px phone inset, 24px tablet inset, and 32px wide-screen inset while preserving the 1600px workspace bound.
- Updated shared page headings so long titles wrap safely and action groups use the available width on phones before returning to content-sized alignment on larger screens.
- Scoped global zebra rows, hover, cell rhythm, and compact-density rules to explicitly marked operational data tables. This prevents list-table styles from changing nested/preview tables; main data-table screens now opt into `nim-data-table` explicitly.
- This is a shared structural correction, not a certification that every route has been visually reviewed. Re-run authenticated role journeys and light/dark device screenshots after the current session/login changes settle.

### Application read/cache performance — 2026-10-22

- React Query now uses freshness by domain (short for production/assignment queues, moderate for lists/dashboard, and longer for reference catalogs) and retains inactive route data for ten minutes. Realtime events invalidate affected data families plus shared history/notifications, rather than every active query.
- Piece facets are served from a separate scoped API route and fetched only when the profile filter or piece form is opened; normal paginated list requests no longer scan distinct values across an entire affair.
- Dashboard status/due-date/quality/trend aggregates are consolidated into one parameterized PostgreSQL query. The aggregate snapshot is coalesced and cached for at most three seconds, then invalidated by post-commit domain events; piece progress and machine queue fields use counts instead of loading all related rows/IDs.
- Piece/import and machine mutations publish cache-invalidating realtime events only after their write transactions complete. This also keeps connected clients' React Query views current.
- Façonnage now assigns generated unit IDs with linear-time pools and performs CPU-heavy optimization in a bounded worker-thread executor, keeping synchronous solver work off the API event loop.
- Regression tests cover lazy facet query behavior and offer scoping, dashboard aggregation/caching/invalidation, domain-specific client invalidation, and per-domain query freshness. These are code-level improvements, not a claim of measured end-to-end latency gains: capture production-build browser traces and run PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)`/load tests against a representative database before setting performance SLOs or adding more indexes. Dashboard cache/event invalidation is currently per API process; a multi-instance deployment needs shared cache/event infrastructure.
- `NEXT_DIST_DIR` may point a production build at a separate output directory, allowing build verification without replacing `.next` while a local development server is running.

### Consistent settings controls and touch targets — 2026-10-23

- Replaced the remaining native activity-preference checkbox with the same accessible shadcn-style switch used by the material-profile editor and import-overwrite control. The reusable switch has a clear on/off semantic state, visible keyboard focus, and a minimum 44px hit area.
- Kept multi-select controls as checkboxes (their semantics are correct) while increasing the family/group selection hit areas in the Façonnage workflows. Individual selection cards already provide a larger label target.
- The Material Profiles editor remains sticky only in its split desktop catalog layout; dialogs and short single-column forms remain non-sticky to avoid trapping content or obscuring the page. Other list filter bars already use the shared sticky-table pattern.
- Added a regression test for switch semantics, keyboard-focusable button behavior, and touch sizing. This targeted consistency pass is not a visual certification of every route or role.

### Real notifications, separate from audit history — 2026-10-23

- Added a persisted `Notification` inbox with recipient ownership, source-history linkage, saved French copy/workflow destination, and per-user `readAt`. Notification rows are inserted inside the same transaction as their source business change and are deduplicated by source event and recipient. Existing audit history is intentionally not backfilled.
- Delivery targets admins and production managers for relevant cross-affaire events (the current model has no manager-to-Affaire assignment), quality controllers for inspection/NC milestones, and operators in the affected active machine session. Account creation and tablet-access changes target the operator directly. Operators remain session-scoped, never permanently attached to a machine.
- Replaced the previous HistoryEvent projection with recipient-scoped inbox endpoints, unread count, mark-one-read, mark-all-read, server-side search/type/unread filters, and ownership checks. The unread count is independent of filters and always restricted to the authenticated user.
- The header bell now shows an unread count and actionable recent items; the inbox provides an unread filter, individual acknowledgement, bulk acknowledgement, pagination, retry/loading/empty states, and contextual links. The settings switch only hides/shows the badge; it never opts the user out of delivery.
- History remains the all-time, append-only audit journal. The new inbox is a task-oriented delivery surface, not another activity timeline. Role/destination pages continue enforcing their own guards.
- API regression coverage checks targeted fan-out, self-notification suppression, active session scoping, recipient isolation, unread count, and read acknowledgements. Run the new Prisma migration before the updated API starts; live database/browser verification remains required after migration because the local development API currently holds Prisma’s Windows query-engine DLL open.

# Client and Affaire linking

The Affaire form previously accepted unrelated free-typed client names, which fragmented filtering and made client contact data impossible to maintain. It now uses the paginated client directory and offers a small inline create path. Full contact and photo management stays on the dedicated client detail screen. Search, archive state, selected-client persistence, and audit links are server-backed; the profile's print stylesheet supports Save as PDF without exposing internal IDs.

### Shared responsive pass — 2026-11-02

- Reduced horizontal overflow risk in the shared application shell by allowing the main content region to shrink inside the sidebar layout.
- Right-side form sheets now use nearly the full phone width while retaining a bounded desktop width; left navigation sheets remain narrower. Centered dialogs keep a consistent 16px viewport gutter on phones.
- Shared sheet and dialog tests cover these responsive width contracts. Existing route-level browser coverage checks the primary authenticated pages at 375px and 768px; offer-specific workflows and operator tablet states still need separate visual walkthroughs.
- Browser verification now walks the primary authenticated pages—including clients, global search, profile catalogue, and a machine detail—at 375px and 768px. The Offer workspace checks all nine tabs at both widths. The walkthrough exposed a login illustration overlay that intercepted the submit click; the decorative panel is now pointer-inert and covered by a regression test. E2E navigation labels were updated to the current Affaire terminology.
- Updated the piece-list and Tekla-import labels from “Offre” to “Affaire” so the screen copy matches the workspace navigation and current business terminology.
