# NIM Design System

## Shared UI foundation

The web app follows shadcn/ui conventions without coupling domain screens to a component vendor: primitives live in `apps/web/components/ui`, use Tailwind classes, and compose through `class-variance-authority` and the shared `cn` helper.

- `Button` provides default, secondary, outline, ghost, danger and link variants with `sm`, default, `lg` and icon sizes.
- `Card` provides the standard border, surface, header, content and footer structure for manager panels.
- `Skeleton` is used for route-level loading states instead of blank content.
- The authenticated shell uses shadcn Command/Dialog primitives for quick navigation, with role-filtered destinations and `Ctrl+K`/`⌘K` keyboard access. Notification badges are rendered from persisted API data rather than decorative state.
- `Progress` exposes progressbar semantics and clamps values to 0-100.
- Inputs and controls keep a minimum 44px touch target and a visible NIM-red focus ring.

Prefer these primitives for new screens. Use red sparingly for the primary action or a meaningful production warning; do not turn an entire panel or page into a red surface.

The current shell uses `Sheet` for mobile navigation, `DropdownMenu` and `Avatar` for the account menu, `Tooltip` for compact actions, and `AlertDialog` for destructive or irreversible operator confirmations. The mobile menu trigger stays above the sticky header and uses a minimum 44px touch target. The dashboard uses responsive Card layouts with a mobile card view for production rows. Dashboard visualizations use the local shadcn-style `ChartContainer`, tooltip, and legend primitives around Recharts; charts must always have a text summary or legend and an empty state when no persisted data exists.

Use a right-side `Sheet` for substantial create/edit, configuration, and structured report/inspection workflows (Affaire, Pièce, User, Machine, Assignment, Quality, and operator non-conformity forms). Keep short, consequential confirmation dialogs and quick navigation centered. Sheets should have a fixed header and action footer with an independently scrollable body, fit the viewport on mobile, and block dismissal while a save is in progress where applicable. The favicon and PWA icon use the compact NIM monogram; never use the wide wordmark or an illustration as an app icon.

## Brand colors

- Red #E10600
- Black #000000
- Dark #111111
- Graphite #171717
- Panel #1B1B1B
- White #FFFFFF
- Border #E5E7EB
- Metal gray #CFCFCF
- Light gray #D9D9D9
- Muted #64748B

Use ~90-95% neutral UI and only ~5-10% NIM red. Red is an accent/primary action color, not the background of every component.

Semantic colors remain meaningful: green success/conform, amber warning/maintenance, red danger/delay/non-conform, blue/neutral info/assigned.

Badges follow a shared hierarchy. `RoleBadge` is the only role identity treatment across user administration, profile, and activity feeds: Admin is NIM red, Production Manager blue, Operator violet, and Quality Controller emerald. `StatusBadge` is reserved for state and uses the same semantic palette everywhere. `PieceProductionStatusBadge` is the shared mapping for piece/bar production: pending is neutral, shaped is blue, assigned is violet, in progress is amber, fabricated is green; non-conformity is red. A production run that has not started is neutral, and zero open non-conformities is green to make a clear quality state scannable. Offer lifecycle badges map draft/archived to neutral, ready to info, in-production to warning, and completed to success. `PriorityBadge` means urgency (high red, normal blue, low neutral); `CategoryBadge` distinguishes entity domains in History and other categorical metadata without implying state. Keep labels visible so color is never the only signal. Account activity uses success for active and neutral for disabled. There is no persisted achievement attribute or invitation lifecycle in the current product, so no achievement/invitation badges are fabricated; add a category only alongside a real domain field and workflow.

Typography: Geist or Inter. Page title 28-32 semibold; section 18-20; body 14-16; table 13-14; KPI 28-36.
Motion is brief and purposeful: use CSS transforms/opacity for entry and feedback, avoid layout-affecting animation and JS animation dependencies, and respect `prefers-reduced-motion`. Keep primary page content visible during entrance motion to avoid delaying perceived load.

Use shadcn/ui + Tailwind + Lucide. Prefer thin borders, whitespace, flat surfaces, subtle shadows, rounded-lg/xl. Avoid gradients, glassmorphism, huge round cards, decorative charts and photo-heavy admin screens.

Data tables use the shared shadcn-style `Table` primitives and the TanStack-backed `DataTable` when rows are locally sortable. Each sortable data column shows a compact neutral up/down indicator and exposes keyboard-accessible ascending/descending states. Server-paginated views keep sorting authoritative on the API rather than reordering only the visible page.

Operator screen should show machine, current piece, progress, one dominant validation button and secondary pause/finish actions. Minimum touch target ~44-48px.

Phase 1 implements these tokens as Tailwind utilities and CSS variables. Manager views use a white/surface hierarchy; the sidebar uses `#111111`; `#E10600` is reserved for focus, primary actions, active accents and meaningful production warnings. The operator route is intentionally separated from the manager shell and uses 44–56px touch targets.
