# Architecture

```text
Next.js PWA
  | REST + WebSocket
NestJS modular monolith
  | Prisma
PostgreSQL
```

## Monorepo
```text
apps/web
apps/api
packages/ui
packages/types
packages/validation
packages/eslint-config
packages/tsconfig
docs
```

## Backend modules
auth, users, machines, pieces, assignments, production, quality, history, imports, dashboard, notifications, realtime.

Prefer domain/application/infrastructure/presentation separation where valuable. Controllers stay thin.

## Frontend
Feature-based organization. TanStack Query owns server state. URL params hold shareable filters. React local state handles temporary UI.
