# Offline Strategy

Implement only after online workflows are stable.

Use PWA + IndexedDB + local command queue. States: PENDING, SYNCING, SYNCED, FAILED, CONFLICT.

Queued actions need an idempotency key. UI must show offline/pending state. The server revalidates all commands when syncing. Conflicts are surfaced, never silently overwritten.
