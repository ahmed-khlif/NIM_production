# NIM — Offre comme racine métier — Implémentation complète

## Résumé

Cette version transforme **Offre** en racine métier de l'application. Une pièce, un import Tekla, un plan de mise en barres et le suivi de production sont désormais rattachés à une offre précise.

Flux principal :

`Offres → Offre → Pièces → Profils/Façonnage → Plan validé → Affectations → Production → Qualité → Historique`

L'objectif principal est l'**isolation forte par offre** : les pièces et plans d'une offre ne sont jamais mélangés avec ceux d'une autre offre dans les workflows métier.

---

## 1. Domaine Offre

Nouvelle entité `Offer` :

- `reference` unique
- `revision`
- `name`
- `clientName`
- `site`
- `description`
- `status`
- `version`
- `materialRevision`
- auteur + timestamps

Cycle de vie :

- `DRAFT`
- `READY`
- `IN_PRODUCTION`
- `COMPLETED`
- `ARCHIVED`

Règles principales :

- Une nouvelle offre commence en `DRAFT`.
- Les pièces/imports ne peuvent être modifiés que pendant `DRAFT`.
- La validation d'un plan de coupe fait passer l'offre à `READY`.
- Le premier démarrage d'une unité fait passer automatiquement l'offre à `IN_PRODUCTION`.
- Une offre ne peut être `COMPLETED` que lorsque toutes les unités non archivées sont résolues côté qualité (`ACCEPTED` ou `SCRAPPED`) et qu'aucune opération n'est en cours.
- Une offre en production ne peut pas être archivée.
- Restaurer une offre archivée la remet en `DRAFT` et archive l'ancien plan approuvé afin d'obliger un nouveau calcul/une nouvelle validation.
- La suppression physique est réservée à une offre `DRAFT` totalement vide. Pour une offre ayant de l'historique, on archive.

---

## 2. Isolation des Pièces

`Piece` possède maintenant un `offerId` obligatoire.

La référence d'une pièce est unique **dans une offre** :

`@@unique([offerId, reference])`

Deux offres différentes peuvent donc avoir chacune une pièce `P-001` sans conflit.

Nouveaux endpoints contextualisés :

- `GET /offers/:offerId/pieces`
- `GET /offers/:offerId/pieces/:id`
- `POST /offers/:offerId/pieces`
- `PATCH /offers/:offerId/pieces/:id`
- `POST /offers/:offerId/pieces/:id/archive`
- images de pièce contextualisées par offre
- import Tekla contextualisé par offre
- profils détectés contextualisés par offre
- préparation Façonnage contextualisée par offre

Les anciens endpoints globaux sont conservés uniquement pour compatibilité technique, mais le nouveau frontend métier passe par les routes `/offers/:offerId/...`.

---

## 3. Imports Tekla isolés

`ImportBatch` possède maintenant un `offerId` obligatoire.

Un fichier Excel/Tekla est toujours importé **dans l'offre actuellement ouverte**. Les contrôles de doublons utilisent donc la portée de l'offre.

Le workflow Piece déjà développé reste intact :

- saisie manuelle
- import Excel/Tekla
- aperçu avant import
- `Surface` ignorée
- conservation de `Repère, Profil, Qté, Qualité, Longueur, Poids, Pds Tot, Désignation`
- préparation des profils détaillés

Toute modification matière incrémente `Offer.materialRevision` et invalide les plans brouillons précédemment calculés.

---

## 4. Façonnage et plans persistés

Nouvelle entité `CuttingPlan`, obligatoirement liée à une offre.

Un calcul Façonnage crée un plan `DRAFT` persistant avec :

- référence
- données d'entrée
- résultat complet du solveur
- nombre de profils
- nombre de barres
- longueurs brute/utilisée
- chute totale
- rendement
- `sourceRevision`
- auteur et timestamps

Endpoints :

- `GET /offers/:offerId/faconnage/plans`
- `GET /offers/:offerId/faconnage/plans/:planId`
- `POST /offers/:offerId/faconnage/optimize`
- `POST /offers/:offerId/faconnage/plans/:planId/validate` avec les identifiants des barres proposées
- `POST /offers/:offerId/faconnage/plans/:planId/cancel` pour annuler uniquement le reliquat non validé

Protection contre les plans obsolètes :

`sourceRevision` doit être égal à `Offer.materialRevision` au moment de la validation partielle.

Toute modification/import/archivage de pièce rend donc impossible la validation accidentelle d'un ancien calcul.

Chaque barre proposée conserve ses propres pièces et son état (`PROPOSED`, `VALIDATED`, `CANCELLED`). Une validation partielle matérialise uniquement la sélection dans une transaction verrouillée; les pièces restantes demeurent en attente. Les anciennes offres `APPROVED` sont migrées comme plans `VALIDATED`.

---

## 5. Solveur de mise en barres conservé

Le moteur avancé déjà développé est conservé :

1. BFD déterministe comme baseline/fallback
2. génération de patterns
3. HiGHS MILP avec univers complet lorsque possible
4. Column Generation pour les espaces plus grands
5. pricing bounded-knapsack
6. master integer final
7. fallback exact interne pour cas bornés
8. fallback BFD

Les longueurs brutes restent entièrement dynamiques. Aucune longueur 6 m / 12 m / 15 m n'est codée en dur.

Statuts solveur :

- `OPTIMAL` uniquement lorsqu'un optimum global est réellement prouvé
- `FEASIBLE` pour Column Generation + MIP sans fausse preuve d'optimalité globale entière
- `HEURISTIC` pour le fallback

Le scope reste volontairement sans stock, kerf, chutes réutilisables, fournisseur ou contraintes machine.

---

## 6. Affectations liées au cycle Offre

Les affectations acceptent un filtre `offerId`.

Une unité ne peut être affectée que si son offre est :

- `READY`
- ou `IN_PRODUCTION`

Les unités d'offres `DRAFT`, `COMPLETED` ou `ARCHIVED` ne sont pas proposées dans la file disponible.

Les événements d'affectation incluent l'identifiant de l'offre dans leurs métadonnées pour la traçabilité.

---

## 7. Production liée à l'Offre

Le contexte `offerId` est propagé jusqu'aux écrans opérateur/production.

Au premier démarrage :

`READY → IN_PRODUCTION`

L'événement `OFFER_PRODUCTION_STARTED` est enregistré dans la même transaction que le démarrage de production.

Les événements `PRODUCTION_STARTED` / `PRODUCTION_COMPLETED` incluent également `offerId`.

---

## 8. Qualité contextualisée

Endpoints qualité filtrables par offre :

- `GET /quality/pending?offerId=...`
- `GET /quality/history?offerId=...`

La page `/offers/:offerId/quality` affiche uniquement les unités et contrôles appartenant à cette offre.

Les liens des unités retournent vers la pièce dans son workspace Offre.

---

## 9. Historique contextualisé

Nouvel endpoint :

`GET /history/offers/:offerId`

Nouvelle page :

`/offers/:offerId/history`

L'historique agrège les événements ayant `metadata.offerId = :offerId` ainsi que les événements de l'offre elle-même.

Événements Offre/plan pris en charge :

- `OFFER_CREATED`
- `OFFER_UPDATED`
- `OFFER_ARCHIVED`
- `OFFER_RESTORED`
- `OFFER_PRODUCTION_STARTED`
- `FACONNAGE_OPTIMIZATION_EXECUTED`
- `CUTTING_PLAN_APPROVED`

---

## 10. Frontend — Workspace Offre

Nouvelles routes :

- `/offers`
- `/offers/:offerId`
- `/offers/:offerId/pieces`
- `/offers/:offerId/pieces/import`
- `/offers/:offerId/pieces/:pieceId`
- `/offers/:offerId/faconnage`
- `/offers/:offerId/production`
- `/offers/:offerId/quality`
- `/offers/:offerId/history`

Onglets du workspace :

- Vue générale
- Pièces
- Façonnage
- Production
- Qualité
- Historique

Les onglets sont filtrés par rôle afin de ne pas afficher une zone interdite à un utilisateur.

Le menu principal utilise maintenant **Offres** comme racine du workflow. Les anciens écrans frontend globaux Pièces redirigent vers `/offers`.

---

## 11. Liste et création des Offres

Écran `/offers` :

- recherche référence / nom / client / site
- filtre statut
- filtre client
- filtre site
- option d'inclusion des archives
- métriques calculées : pièces/unités, profils, barres planifiées, avancement
- création d'une offre
- modification des métadonnées
- archivage/restauration
- suppression stricte d'un brouillon vide

La création ne mélange plus l'import de pièces :

1. créer l'offre
2. ouvrir son workspace
3. ajouter/importer les pièces

Cette séparation évite les créations partielles et garde la responsabilité de chaque étape claire.

---

## 12. Vue générale Offre

L'overview présente :

- informations principales de l'offre
- statut
- pièces
- profils
- barres planifiées/fabriquées
- progression
- derniers imports
- derniers plans
- prochaine action métier

La prochaine action dépend de l'état :

- pas de pièces → Pièces
- DRAFT + pièces → Façonnage
- READY → Affectations
- IN_PRODUCTION → Production
- COMPLETED → Bilan/Qualité
- ARCHIVED → consultation

Les transitions de statut ne sont pas éditables via un simple select : elles sont déclenchées par de vraies actions métier.

---

## 13. Style NIM

Le nouveau workflow respecte le template fourni :

- sidebar charbon/noir
- surfaces blanches/gris très clair
- accent principal rouge NIM (`nim-red`, visuellement aligné sur #E10600)
- bordures grises discrètes
- pas de bleu/vert utilisé comme couleur de marque dans les écrans Offre
- états dangereux/attention conservés avec couleurs sémantiques lorsqu'elles sont nécessaires

---

## 14. Migration des données existantes

Migration :

`api/prisma/migrations/20261014170000_offers_isolation/migration.sql`

Elle :

1. crée `OfferStatus`, `CuttingPlanStatus`, `Offer`, `CuttingPlan`
2. ajoute `offerId` à `Piece` et `ImportBatch`
3. crée une offre `LEGACY-2026` si des données existantes sont présentes
4. rattache les anciennes pièces/imports à cette offre
5. remplace l'unicité globale de `Piece.reference` par `(offerId, reference)`
6. ajoute FKs/indexes
7. conserve la continuité de production : si les anciennes données montrent déjà une production/affectation active, l'offre legacy passe à `IN_PRODUCTION`
8. garantit une seule version `APPROVED` de CuttingPlan par offre

Aucune donnée Piece/Import existante n'est supprimée par cette migration.

### Important avant production

Faire un backup PostgreSQL avant migration.

---

## 15. Tests/hardening ajoutés

Couverture ajoutée/renforcée sur :

- métriques isolées entre offres
- références d'offres dupliquées
- impossibilité de READY sans plan approuvé
- impossibilité de terminer tant que qualité non résolue
- impossibilité d'archiver pendant la production
- restauration vers DRAFT + invalidation du plan approuvé
- démarrage de production : transition automatique de l'offre vers IN_PRODUCTION
- scoping des affectations/production
- Façonnage/plan et isolation par offre

---

## 16. Validation réalisable dans cet environnement

L'archive fournie contient uniquement `apps/api` et `apps/web`, sans les packages workspace racine :

- `@nim/types`
- `@nim/validation`
- `@nim/ui`
- `tsconfig.base.json`
- lockfile/workspace root

Il n'est donc pas possible d'exécuter honnêtement ici le typecheck/build/test complet du monorepo.

Validation effectuée sur la version finale :

- transpilation/syntaxe TypeScript/TSX de tous les fichiers `api/src`, `api/test`, `web/app`, `web/components`, `web/features`, `web/test`
- **183 fichiers contrôlés, 0 erreur syntaxique**
- archive finale vérifiée avec `unzip -t`

Le build et les tests complets doivent être exécutés une fois les apps replacées dans le workspace NIM complet.

---

## 17. Commandes après remplacement dans le monorepo complet

Depuis la racine NIM :

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

En environnement de développement, si vous gérez les migrations localement :

```bash
pnpm --filter @nim/api exec prisma migrate dev
```

Ne lancez pas `migrate dev` sur la base de production.

---

## 18. Checklist de vérification fonctionnelle

Après migration :

1. créer Offre A
2. créer Offre B
3. importer/créer des pièces dans A
4. importer/créer des pièces dans B
5. confirmer que `/offers/A/pieces` ne montre jamais B
6. sélectionner les profils de A
7. optimiser A
8. valider le plan A → Offre A devient READY
9. vérifier qu'une modification Piece est maintenant bloquée
10. affecter une unité de A
11. démarrer production → A devient IN_PRODUCTION
12. terminer production puis qualité
13. terminer A seulement lorsque toutes les unités sont ACCEPTED/SCRAPPED
14. vérifier l'historique de A
15. vérifier que les événements de B n'apparaissent pas dans A

---

## 19. Fichiers de build/secrets

La ZIP finale de handoff exclut volontairement :

- `api/.env`
- `web/.env.local`
- `api/dist/`
- `web/.next/`
- `node_modules/`
- `web/tsconfig.tsbuildinfo`

Les `.env.example` restent disponibles. Les secrets doivent être configurés dans l'environnement cible, pas distribués dans l'archive source.

---

## 20. Optimisation des lectures Offre — 17/10/2026

- La liste `/offers` calcule les unités fabriquées et les barres validées avec des agrégations groupées par pièce/plan. Elle ne charge plus chaque PieceUnit ni chaque proposition de façonnage pour produire ses indicateurs.
- La vue générale d'une Offre utilise `GET /offers/:offerId/bar-summary` pour afficher les compteurs de barres. Les détails et memberships des barres ne sont chargés que dans la page Barres/Affectations.
- Les compteurs de la synthèse sont des requêtes d'agrégation PostgreSQL; les autorisations et le périmètre d'Offer sont conservés côté API.
- Vérifiés avec lint, typecheck, tests et build de production. Aucun chiffre de LCP ou de latence n'est revendiqué : une mesure représentative exige un navigateur de production et un jeu de données volumineux comparable à l'atelier.

À traiter avant déploiement à très grande échelle : pagination API des files d'affectation disponibles, de la file qualité, des utilisateurs/machines si ces répertoires grossissent, des barres affectées, et des lignes « Avancement par pièce ». Les listes de pièces, historique et plans de façonnage possèdent déjà une pagination API. Mesurer les requêtes avec des données réalistes et ajouter les index seulement après validation par `EXPLAIN ANALYZE`.
