# Open Questions for NIM

1. Does quantity 10 always mean 10 identical physical exemplars?
2. Is quality control unit-by-unit or lot-level?
3. Will Quality Controller definitely exist, or can operators self-control?
4. What is the workflow after NON_CONFORM: rework, scrap, remake, deviation?
5. Can a lot be split across multiple machines?
6. Can in-progress work be reassigned?
7. Can one machine process multiple pieces simultaneously?
8. Is dueDate enough or do we need planned start/end times?
9. Is pause/resume required? Do we track downtime/setup/changeover?
10. Are exports (Excel/PDF) required?
11. Are QR codes planned?
12. How many machines/operators/pieces per day?
13. How stable is workshop Wi-Fi?
14. Factory-only access or remote access too?
15. Are there production orders (OF) grouping pieces?
16. Do pieces need client/project/order references?
17. Are quality defect photos required?
18. Who may set maintenance state?
19. Can Admin also act operationally as Production Manager?

## Implementation decision for the current phase

Assignments are implemented at PieceUnit level. This supports splitting a quantity across multiple machines while preserving exact machine and transition history for every physical unit. The later production phase still needs the business decision for whether in-progress units may be reassigned.

Quality is implemented for the current phase as one inspection per PieceUnit, performed by `QUALITY_CONTROLLER` or `ADMIN`. `NON_CONFORM` requires a comment and moves the unit to `REJECTED`; rework, scrap, remake, deviation, and defect-photo behavior remain explicitly unresolved rather than being silently invented.
