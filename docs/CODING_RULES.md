# Coding Rules

- TypeScript strict; avoid casual any.
- Thin controllers; centralized domain rules; transactions for consistent mutations.
- Feature-based frontend organization.
- TanStack Query for server state; React Hook Form + Zod for forms.
- Prisma migrations committed; no normal manual production DB editing.
- Stable error codes: MACHINE_IN_MAINTENANCE, INVALID_STATE_TRANSITION, UNIT_ALREADY_COMPLETED, ACCOUNT_DISABLED, PERMISSION_DENIED.
- Every page/action has loading, empty, error and visible feedback states.
- French is initial UI language; keep copy organized for future i18n.
- Maintain NIM minimalist visual system and accessible focus/reduced-motion behavior.
