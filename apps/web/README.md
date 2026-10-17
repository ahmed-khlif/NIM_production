# NIM web application

Next.js + TypeScript + Tailwind CSS + shadcn-style UI primitives + Lucide, Recharts, and `react-big-calendar`.

`components.json` keeps the project compatible with the shadcn component workflow. Components are copied into the repository and remain owned by NIM, so domain-specific production rules never depend on a UI package runtime.

Piece and machine detail screens are linked from their lists and include responsive unit/queue views, loading/error/empty states, and scoped history for authorized managers. The Tekla import screen supports XLS/XLSX (and legacy CSV compatibility), sends the local file to the API for server validation and preview, ignores Surface intentionally, and keeps commit disabled until every row is valid.

Settings and Notifications are API-backed. The web client also connects to the authenticated Socket.IO realtime namespace and invalidates authoritative REST queries after committed domain events. The manager dashboard uses Recharts with persisted machine/status metrics, and `/planning` uses `react-big-calendar` with persisted piece due dates. The PWA foundation includes a manifest, production-only service-worker registration, GET-only shell caching, and an offline banner; no production write is cached or replayed without a future conflict protocol.

To add another official shadcn component from the repository root:

```powershell
pnpm dlx shadcn@latest add <component> -c apps/web
```

The current setup includes the official `button`, `card`, `input`, `badge`, `separator`, `skeleton`, `label`, `avatar`, `dropdown-menu`, `sheet`, `tooltip`, `tabs`, `scroll-area`, `dialog`, `alert-dialog`, `command` and `select` components. Recharts and Big Calendar are domain visualization libraries composed inside these shadcn-style surfaces; they do not replace the shared UI primitives.

## UI conventions

Reusable primitives live in `components/ui`. Build new screens from `Button`, `Card`, `Input`, `StatusBadge`, `Progress` and `Skeleton` before adding page-specific styles. Keep manager screens responsive, use a minimum 44px touch target, and reserve NIM red for primary actions and meaningful warnings.

The dashboard, Profile, operator, Quality, and History screens are connected to persisted APIs. Authentication, admin Users, Machines, Pieces, Assignments, unit-level Production, unit-level Quality, History, and dashboard metrics are server-backed through PostgreSQL. Administrators can manage accounts; administrators and production managers can manage machines, piece planning, unit assignments, dashboard metrics, and traceability; operators can start and complete their assigned units; quality controllers can validate manufactured units; all authenticated roles can read planning data.

## Piece / Façonnage preparation workflow

`/pieces` now uses the Tekla business columns Repère, Profil, Qté, Qualité, Longueur, Poids, Pds Tot and Désignation. Managers can add a Piece manually through the right-side form or import a Tekla file. `/pieces/faconnage` detects exact detailed profiles, groups them by family (IPE, HEA, UPN, L, ROND, OTHER), and prepares aggregated `profil + longueur + quantité` requirements for the future mise en barres optimizer.

The responsive app sidebar groups Liste des pièces, Importer Tekla, and Profils à traiter under an accessible Pièces disclosure. It opens on Pièces routes; import and preparation links are shown only to administrators and production managers, with server authorization continuing to enforce access.
