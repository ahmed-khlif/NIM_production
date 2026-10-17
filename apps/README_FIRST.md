# NIM — Offer Workspace — Installation rapide

Cette archive contient :

- `apps/api`
- `apps/web`
- migration Prisma Offer isolation
- documentation détaillée `UPDATE_OFFERS_WORKSPACE.md`

## Installation

1. **Sauvegarder PostgreSQL avant la migration.**
2. Remplacer les dossiers `apps/api` et `apps/web` de votre monorepo par ceux de cette archive.
3. Depuis la racine du monorepo NIM :

```bash
pnpm install
pnpm --filter @nim/api prisma:generate
pnpm --filter @nim/api exec prisma migrate deploy

pnpm --filter @nim/api typecheck
pnpm --filter @nim/api test
pnpm --filter @nim/api build

pnpm --filter @nim/web typecheck
pnpm --filter @nim/web test
pnpm --filter @nim/web build
```

Pour une base de développement uniquement, `prisma migrate dev` peut remplacer `migrate deploy`.

## Parcours de test conseillé

1. créer Offre A et Offre B
2. ajouter/importer des pièces différentes dans chaque offre
3. vérifier l'isolation des listes de pièces
4. calculer puis approuver un plan de mise en barres dans Offre A
5. vérifier `DRAFT → READY`
6. affecter une unité, démarrer la production et vérifier `READY → IN_PRODUCTION`
7. terminer production + qualité
8. terminer l'offre uniquement lorsque toutes les unités sont `ACCEPTED` ou `SCRAPPED`
9. vérifier l'historique propre à chaque offre

## Sécurité / packaging

Les fichiers `.env`, `.env.local`, `dist`, `.next`, `node_modules` et caches ne sont pas inclus dans cette archive. Configurez les secrets dans l'environnement cible.
