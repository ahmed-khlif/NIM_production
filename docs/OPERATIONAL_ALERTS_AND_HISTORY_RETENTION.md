# Operational alerts and history retention

## User-facing alerts delivered in this phase

- A successful Tekla import preview that contains a `Jarret` designation opens a blocking red alert. The user must acknowledge the quantity, length, and weight check before the import action becomes available. The warning remains visible in the preview.
- Moving a machine into maintenance displays a red confirmation warning and, after the save succeeds, a red result dialog with the machine name and the number of bars still assigned. The dialog directs staff to remove those assignments from the relevant Affaire bar list.
- Affaire forms provide suggestions from registered client records. Selecting a suggestion stores its client ID; free text alone does not associate a client.

These are interface alerts for the person carrying out the action. If the business requires alerts to reach other roles or remain unread until acknowledged, implement them through the existing recipient-specific notification inbox with explicit recipient rules and read state.

## History retention recommendation

The activity history is append-only and is used for traceability. Do not automatically delete old events to keep only the latest two weeks. Instead:

1. Keep history searchable in the application with its existing server-side pagination and filters.
2. Produce a scheduled, immutable archive export (XLSX/CSV plus a manifest containing export range, row count, generation time, and checksum) to configured durable storage.
3. Keep archive files available in the application through an authorized archive index, with download and restore/read access.
4. Add retention, encryption, access control, restore drills, and storage-cost monitoring before considering database partitioning or cold storage. Any future compaction must preserve audit integrity and must never silently discard the only copy of an event.

There is no archive destination configured by this change, so scheduled exports and retention automation remain a separate infrastructure task.
