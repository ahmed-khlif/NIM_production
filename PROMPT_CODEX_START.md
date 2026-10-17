# Prompt to give Codex — Start NIM Production

You are a senior software architect, senior TypeScript full-stack engineer, and product UI engineer.

You are starting the **NIM Production** project for **La Nouvelle Industrie Des Métaux (NIM)**.

Your task in this run is to implement **ONLY Phase 1 — Foundation + NIM UI foundation**. Do not implement the whole business application yet.

## 1. Read before touching code

Read, in this exact order:

1. `README.md`
2. `AGENTS.md`
3. every file under `/docs`
4. `assets/README.md`
5. inspect `assets/brand`, `assets/illustrations`, and `assets/references`
6. inspect the complete repository tree

Treat `/docs` as the source of truth for requirements and architecture.

The images in `assets/references` are **visual references only**. Do not copy fake data, invented machine names, incorrect text, or AI-generated artifacts from those images.

Use the real supplied NIM logo in `assets/brand/nim-logo.png` without redesigning it.

## 2. Target architecture

Create a pnpm monorepo:

```text
apps/
  web/       Next.js
  api/       NestJS
packages/
  ui/
  types/
  validation/
docs/
assets/
```

Use a **modular monolith**, not microservices.

Frontend:

- Next.js App Router
- React
- strict TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide icons
- TanStack Query
- TanStack Table
- React Hook Form
- Zod
- Sonner
- next-themes

Backend:

- NestJS
- strict TypeScript
- Prisma
- PostgreSQL
- OpenAPI/Swagger foundation
- WebSocket foundation only; do not build realtime business flows yet

Tooling:

- pnpm workspaces
- ESLint
- Prettier
- environment validation
- test foundations
- Docker Compose with PostgreSQL

## 3. Phase 1 scope

Implement only the following.

### A. Monorepo foundation

- root `package.json`
- `pnpm-workspace.yaml`
- shared TypeScript configuration
- shared lint configuration if useful
- consistent scripts for:
  - dev
  - build
  - lint
  - typecheck
  - test

### B. Web application foundation

Initialize `apps/web` with Next.js.

Configure:

- strict TypeScript
- Tailwind
- shadcn/ui
- Geist or Inter
- Lucide
- TanStack Query provider
- theme provider
- Sonner
- accessible global styles

### C. NIM design tokens

Implement the real NIM visual language:

```text
Brand red        #E10600
Black            #000000
Dark             #111111
Graphite         #171717
Panel dark       #1B1B1B
White            #FFFFFF
Border           #E5E7EB
Metal gray       #CFCFCF
Light gray       #D9D9D9
Muted            #64748B
```

Design principle:

- 90–95% neutral
- 5–10% NIM red
- no gradients unless exceptionally justified
- no glassmorphism
- no giant rounded cards
- no heavy shadows
- no generic colorful admin-template look

Red is an accent, not the whole UI.

### D. Shared UI primitives

Build reusable components, not one-off dashboard markup:

- `NimLogo`
- `AppSidebar`
- `AppHeader`
- `PageHeader`
- `StatusBadge`
- `KpiCard`
- `DataTableShell`
- `EmptyState`
- `SearchField`
- `FilterBar`
- `ProductionProgress`
- `MachineStatus`
- `TimelineItem`
- `ConfirmDialog`

Use shadcn primitives wherever appropriate.

### E. Responsive App Shell

Build the authenticated shell visually:

Desktop:

```text
NIM sidebar | top header + page content
```

Navigation:

- Tableau de bord
- Production
- Pièces
- Machines
- Qualité
- Historique

Administration section:

- Utilisateurs
- Paramètres

Requirements:

- dark `#111111` sidebar
- restrained active state with NIM-red accent
- responsive tablet/mobile navigation
- keyboard accessible
- good focus states
- minimum touch target around 44–48px on touch-oriented controls

### F. Login page

Create the polished NIM login page.

Use `assets/illustrations/login-security.png` or a restrained composition from the supplied assets.

Desktop layout may be split screen:

- NIM visual/illustration area
- login form area

Fields:

- Identifiant
- Mot de passe
- Connexion

At this phase, auth may be mocked visually if backend auth is not yet implemented, but structure code so real auth replaces it cleanly in Phase 2.

Do not invent SSO or social login.

### G. Dashboard UI prototype

Create the **Production Manager dashboard UI using mock typed fixture data only**.

It is a visual foundation, not final backend-connected business logic yet.

Keep it minimalist.

Top information:

- Avancement global
- Pièces en fabrication
- Pièces en retard
- Machines actives
- Machines en maintenance

Main content:

- Charge des machines
- Activité récente
- Pièces en cours
- Pièces en retard
- Machines en maintenance

Do NOT create a giant colorful dashboard.
Do NOT add charts that have no clear production value.
Do NOT use all illustrations on the dashboard.

Use `assets/references/home-dashboard-reference.png` for design direction only.

### H. Operator tablet UI prototype

Create a responsive operator screen with mock data:

```text
CNC-03                     Active

P-204
HEA 200 · 4300 mm

8 / 10
progress

[ Valider la prochaine pièce ]

[ Pause ]         [ Terminer ]
```

This screen must be intentionally simple and touch-first.

No desktop admin clutter.

### I. Backend foundation

Initialize `apps/api` with NestJS.

Add:

- configuration module
- environment validation
- health endpoint
- Prisma module/foundation
- Swagger/OpenAPI foundation
- global validation/error handling foundation

Do NOT implement Users/Machines/Pieces business modules yet beyond skeletons needed by architecture.

### J. PostgreSQL + Prisma foundation

- Docker Compose PostgreSQL
- Prisma configured
- initial connection verified
- no premature giant schema if Phase 2/3 domain is not being implemented yet

If you add foundational models, keep them minimal and justified by docs.

### K. Asset organization

Copy/use relevant assets from `/assets` into the web public assets using clean production names.

Do not use every illustration everywhere.

Keep an asset mapping document or update `assets/README.md` if paths change.

## 4. UX quality requirements

The UI must feel like:

**premium industrial software + minimalist shadcn + NIM identity**.

Avoid the previous undesirable direction:

- generic ERP template
- excessive cards
- excessive red
- excessive colored badges
- cramped layouts
- decorative charts
- illustration overload

Prefer:

- generous whitespace
- strong hierarchy
- flat surfaces
- thin borders
- restrained radius
- excellent tables
- clear typography
- concise information

## 5. Language

Initial product UI is French.

Do not scatter strings carelessly. Keep copy organized so future English/Arabic localization is possible.

## 6. Do not implement yet

Do NOT implement in this run:

- production business workflow
- real authentication/RBAC unless required only as harmless foundation
- machine CRUD
- piece CRUD
- Excel import logic
- assignments
- quality workflow
- traceability persistence
- realtime production events
- offline sync

Those belong to later phases.

## 7. Testing for this phase

At minimum add tests for meaningful foundation behavior/components where appropriate.

Verify:

- app shell renders
- navigation responsive behavior where testable
- login form validation structure
- key shared components
- API health endpoint
- environment validation

## 8. Required checks before finishing

Run and fix until green:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Also verify Docker/PostgreSQL startup instructions.

## 9. Documentation updates

Update:

- `README.md`
- architecture/setup docs if actual implementation differs from planning
- design system if tokens/component decisions change
- deployment/dev instructions

Do not rewrite requirements just to match implementation mistakes.

## 10. Final report

When finished, report:

1. what was created;
2. repository structure;
3. key technical decisions;
4. UI components created;
5. routes created;
6. commands to install/run;
7. tests/build status;
8. screenshots or concise description of implemented UI if supported;
9. any assumptions or blockers;
10. recommended next phase.

STOP after Phase 1.
Do not automatically begin Phase 2.
