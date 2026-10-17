# Realtime

Use WebSocket for push events; REST remains authoritative for commands/queries.

Events: piece.assigned, piece.reassigned, production.started, production.unitCompleted, production.completed, quality.validated, quality.rejected, machine.statusChanged.

Flow: command -> validate -> DB transaction -> update state -> write history -> COMMIT -> publish WebSocket event -> clients update/invalidate TanStack Query cache.

Never publish before commit.

The current implementation uses an authenticated Socket.IO namespace at `/realtime`. Production start/complete, assignment, and quality transitions publish compact event envelopes only after their Prisma transaction resolves; the web client invalidates its REST queries and keeps REST authoritative. This in-memory publisher is suitable for the current single API process; a broker is required before horizontal API scaling.

Operator/tablet events include `machine-session.started`, `machine-session.ended`, `production.started`, `production.completed`, `bar.production.finished`, and `quality.nonConformityReported`. They are published after their persistence transaction resolves. Existing manager Socket.IO listeners invalidate REST queries; tablet pages also poll session/run state and manager projections poll every 15 seconds as a fallback. REST remains authoritative.
