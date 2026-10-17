# Security

## Implemented controls

- Passwords are hashed with Argon2id and are never persisted or logged in plaintext.
- Session rows contain a SHA-256 hash of a random token, not the browser token itself.
- Sessions expire after eight hours, use HttpOnly/SameSite cookies, and are revoked on logout or password change.
- Login attempts are rate-limited per IP and username in the API process.
- Authentication events and failed login attempts are persisted as history events.
- The API has server-side guards for authentication and role checks; the frontend cannot grant access.
- User history is preserved when an actor is removed by using a nullable `SetNull` audit relation.
- The API disables `X-Powered-By`, applies Helmet security headers, validates mutating request origins when a browser sends an `Origin`, and exposes Swagger only outside production.
- Production cookie deletion preserves the `Secure` attribute, malformed session cookies fail closed, and proxy-derived client IPs are trusted only when `TRUST_PROXY=true`.

- Argon2id or equivalent password hashing; never plaintext/reversible passwords.
- Disabled accounts cannot authenticate.
- Backend guards enforce roles/permissions.
- Validate all IDs, quantities, dimensions, states, transitions, machine availability and workflow rules server-side.
- Restrictive CORS, Helmet security headers, origin-based CSRF mitigation for browser mutations, and HttpOnly/Secure/SameSite cookies where appropriate.
- Rate-limit login and sensitive endpoints.
- Validate upload type/content/size/row count.
- Environment variables validated at startup; no secrets committed.
- Stable production errors; no raw stack traces or framework-specific error envelopes.
- Structured audit logs without credentials/tokens.
