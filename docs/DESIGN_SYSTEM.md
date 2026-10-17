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

The current shell uses `Sheet` for mobile navigation, `DropdownMenu` and `Avatar` for the account menu, `Tooltip` for compact actions, and `AlertDialog` for destructive or irreversible operator confirmations. The dashboard uses responsive Card layouts with a mobile card view for production rows. Dashboard visualizations use the local shadcn-style `ChartContainer`, tooltip, and legend primitives around Recharts; charts must always have a text summary or legend and an empty state when no persisted data exists.

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

Typography: Geist or Inter. Page title 28-32 semibold; section 18-20; body 14-16; table 13-14; KPI 28-36.

Use shadcn/ui + Tailwind + Lucide. Prefer thin borders, whitespace, flat surfaces, subtle shadows, rounded-lg/xl. Avoid gradients, glassmorphism, huge round cards, decorative charts and photo-heavy admin screens.

Operator screen should show machine, current piece, progress, one dominant validation button and secondary pause/finish actions. Minimum touch target ~44-48px.

Phase 1 implements these tokens as Tailwind utilities and CSS variables. Manager views use a white/surface hierarchy; the sidebar uses `#111111`; `#E10600` is reserved for focus, primary actions, active accents and meaningful production warnings. The operator route is intentionally separated from the manager shell and uses 44–56px touch targets.
