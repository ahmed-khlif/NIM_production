# Roadmap

## Completed lifecycle phase

Quality control now includes immutable multi-cycle inspections, defect categories and photos, rework, remake, scrap, rejected-unit return to production, and administrator-approved deviations.

The dashboard now includes persisted defect-category Pareto, disposition breakdown, and pending-deviation analytics.

0. Discovery/docs/design
1. Monorepo foundation
2. Authentication + RBAC
3. Machines
4. Pieces + PieceUnit — implemented
5. Assignments/reassignment/priority — implemented at PieceUnit level
6. Excel/CSV import — CSV, Tekla HTML `.xls`, and binary `.xls`/`.xlsx` preview/commit with normalized Piece fields, discrepancy warnings, per-piece audit events, and in-memory parsing; source files and import-batch metadata are not retained
   6.5. Façonnage demand and cutting estimate — exact profile catalog; eligible outstanding PieceUnit demand; remake/rework distinction; server-authoritative recalculation; profile-specific candidate bar lengths and measured kerf; cutting optimization and audited bar-need estimate implemented. On-hand stock accounting, reservation, saved/released bar orders, and machine dispatch remain separate future work.
7. Operator production workflow + concurrency — implemented at PieceUnit level with optimistic completion checks
8. Quality control lifecycle — implemented at PieceUnit level with immutable multi-cycle inspections, defect categories/photos, rework, remake, scrap, rejected-unit return to production, and administrator-approved deviations
9. Traceability/history — implemented with secured paginated/filterable reads and responsive UI
10. Real metrics dashboard — implemented through `/dashboard/overview`, including shadcn-style machine, status, unit-lifecycle, and priority visualizations plus quality and delivery-risk summaries
    10.5. Planning calendar — authenticated Big Calendar view backed by persisted piece due dates
11. WebSocket realtime — authenticated Socket.IO namespace and post-commit query invalidation implemented; external broker remains required for horizontal scaling
12. Responsive/PWA polish — manifest, safe GET-only service-worker shell cache, and offline banner implemented
13. IndexedDB offline sync/conflicts
14. Piece and defect media traceability — implemented: authenticated multi-photo piece gallery and inspection-scoped defect-photo gallery, filesystem-backed media metadata, signature/size/count validation, role guards, append-only add/remove history, responsive thumbnails, and API/UI tests.
15. Security/performance/accessibility/E2E/deployment hardening — implemented role-specific manager/operator/quality lifecycle coverage, explicit production environment validation, and `/health/ready` database readiness checks. Remaining hardening is operational: reverse-proxy setup, backup/restore, monitoring and load testing.

16. Recipient notifications — implemented as a persisted, deduplicated inbox separate from append-only History. Business events create notifications in the same transaction; recipients are selected by current role, quality responsibility, active machine session, or explicit account target. Read/unread state is personal, and the header preview links directly to the relevant workflow. Delivery remains in-app only; email/push channels and per-Affaire manager ownership are not configured product capabilities.

Do not skip foundational phases to rush to dashboard UI.

# Shared client directory

Implemented: legacy Affaire names migrated to reusable client records, unique normalized identity, contact details, authorized editing and reversible archival, validated image storage, Affaire selection, and print-to-PDF client profiles.
