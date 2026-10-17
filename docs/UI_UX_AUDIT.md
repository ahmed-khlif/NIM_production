# NIM Platform UI/UX Audit and Gap Analysis

**Audit date:** 2026-10-15  
**Scope:** Manager web application, shared navigation and UI primitives, primary production workflows, API-backed lists, responsive behavior, and existing automated UI coverage.

## Executive summary

The platform has a coherent industrial visual direction and a useful domain flow: offers contain pieces, pieces become unit-level work, units are assigned to machines, production is executed, and quality/history preserve the result. The strongest UX risks are systemic rather than decorative: several operational lists load all rows (or stop at a fixed cap) instead of using a consistent server pagination contract; most filters live only in component state; and authenticated mobile/tablet coverage has been limited.

This audit applies a cross-platform interaction baseline to shared controls: buttons, inputs, selects, menu items, and tabs now meet the project's 44px minimum target; focus rings are more visible; buttons provide restrained pressed feedback; and the global-search label now accurately says that it searches offers. Existing loading, empty, and error patterns are preserved. The changes deliberately avoid page-by-page restyling without evidence of a workflow defect.

## Phase 1 — Structural audit

### Navigation and workflow

- The app shell has role-aware navigation, a mobile navigation sheet, keyboard-accessible quick navigation, notification access, and account actions.
- The offer workspace organizes related sections (overview, pieces, faconnage, bars, assignments, production, and quality) under the selected offer. This keeps the domain context visible and is preferable to duplicating a separate operator directory: operator identities are existing `User` records with the `OPERATOR` role.
- The manager path is understandable, but the overall workflow does not yet communicate one persistent “next action” across every offer state. A future workflow/status panel should derive the next valid action from server state and permissions, rather than duplicating transition rules in React.
- Search in the shared header is offer search, not universal search. The accessible label has been corrected to avoid promising more than it does.

### Lists, pagination, and data handling

| Area                            | Current behavior                                                                     | UX / scale impact                                                                             | Priority |
| ------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------- |
| History                         | Validated server-side page and page-size contract                                    | Good baseline; reuse this contract                                                            | —        |
| Pieces                          | API returns the full offer's pieces; UI filters and paginates in memory              | Payload and render cost grow with the offer; page controls do not reduce server work          | P1       |
| Assignments                     | Active assignments and assignable units are fetched as full collections              | Large queues become slow and difficult to scan                                                | P1       |
| Pending quality                 | All pending units returned; quality history capped to latest 100                     | Pending queue can grow without bound; older history is silently unavailable through this list | P1       |
| Machines                        | Full machine directory returned                                                      | Usually a smaller collection, but has no consistent contract as installations grow            | P2       |
| Cutting bars / bar assignments  | Offer-scoped collections returned without paging                                     | Large jobs can produce heavy responses and long tables                                        | P1       |
| Offers                          | API applies search but returns at most 250 rows; client handles additional filtering | Results beyond the cap are inaccessible, with no page metadata explaining the limit           | P1       |
| Notifications / recent activity | Fixed recent-event limits                                                            | Suitable for previews, but should link to complete paginated history                          | P2       |

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
- Corrected the app-header search accessible name to match its offer-search behavior.
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
