# Operator account access and production roles

## Sign-in and account ownership

Operators sign into the workshop tablet with the username/identifier and password on their existing `User` account. The tablet still has its own short-lived, HttpOnly session cookie; it does not create a second account. The same username and password are used for the regular app and the tablet.

Operators cannot change their username or password themselves. The API rejects operator self-service password changes, and the profile page explains that an administrator manages these credentials. Administrators can edit an operator's account details and reset the existing account password in Users. Resetting the password revokes all active application and tablet sessions. Production managers can enable or disable tablet access, but cannot reset credentials.

The old one-time tablet connection key and its stored key hashes are removed. The migrations preserve User identities, tablet sessions, machine sessions, production runs, and audit history; they drop obsolete connection-key columns and the unused email column. Existing passwords remain password hashes and are not migrated or exposed.

## Production visibility

- Administrators open `/production` for the global, paginated production monitor.
- Production managers open Affaires filtered to `IN_PRODUCTION`; the monitor is reached from an individual Affaire's Production tab. The monitor endpoint rejects an unscoped production-manager request.
- Operators use the shared `/login` page; successful sign-in establishes the tablet session and opens `/production/tablet`. Disconnect revokes both sessions and returns to `/login`. The legacy `/production/login` URL redirects to the shared sign-in page.
- The Affaire workspace remains the manager's contextual scope. There is no manager-owner assignment field in the current data model, so this flow does not claim that an Affaire is assigned to one particular manager.

The global admin monitor supports server-side search, status filtering, pagination, refresh, and 15-second polling. It links each bar to its Affaire production view and shows the persisted machine/team, run state, and open non-conformities. API role guards remain authoritative; navigation visibility is not a security control.

The machine-session team picker lists only active, tablet-enabled operators who are not already in another active machine session, excluding the signed-in lead. Busy or disabled accounts are not shown. Offline operators remain selectable when eligible. Operators can search the list and select or clear all matching results. The API rechecks account status and session membership in a transaction when a session starts, so availability cannot be bypassed with a stale tablet list. If a conflict occurs, the list refreshes and removes newly unavailable selections.

After the team starts its machine session, the tablet first shows the Affaires with assigned bars. Selecting an Affaire opens only that Affaire’s queue, grouped by profile; “Toutes les affaires” returns to the Affaire chooser. The bar queue remains paginated and searchable.

The active session lead can manage assistants from the session team panel. They may add or remove eligible operators at any time, except that an assistant who started a currently running bar cannot be removed until that bar is completed or cancelled. This preserves that operator’s authority to finish or cancel their run. Team changes are server-authorized to the lead, revalidate operator eligibility and other active sessions, and write an append-only history event. Removed memberships remain as inactive history. New assistants receive a user-scoped notification, and session updates publish realtime only after commit.

Administrators can review active machine sessions beside operator accounts in **Utilisateurs**. The page refreshes session status periodically and updates immediately after realtime session changes. An administrator may end a machine session only when no production run is active; a running bar must be completed first. Ending the machine session preserves its records, ends all team memberships, writes an audit event, and notifies the team. It does not sign the user out of the NIM account.

## Verification

The API validates the username and password, hashes passwords with Argon2id, checks account status and tablet-access permission, rate-limits failed tablet login attempts, and writes login failures/successes to history. User creation/update and password-reset actions are administrator-authorized and audited.
