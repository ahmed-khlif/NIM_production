# Deployment

Recommended host: `production.nim.com.tn`, separate from the public website.

Deploy reverse proxy + Next.js + NestJS + PostgreSQL over HTTPS, initially with Docker Compose. Keep `/health` as a process liveness probe and use `/health/ready` as the load-balancer/container readiness probe; readiness verifies the PostgreSQL connection without exposing connection details. Add restart policies, a persistent DB volume, scheduled backups and restore testing.

Store timestamps in UTC and display using Africa/Tunis. Provide `.env.example`; validate DATABASE_URL, APP_URL, API_URL, auth secrets, CORS origins and environment mode.

## Local verification

The supported local workflow uses PostgreSQL installed on the developer machine. Ensure PostgreSQL is running, copy `apps/api/.env.example` to `apps/api/.env`, then run `pnpm --filter @nim/api prisma:generate`, `pnpm --filter @nim/api exec prisma migrate deploy`, and `pnpm --filter @nim/api prisma:seed`. Docker Compose remains an optional PostgreSQL alternative.

Set `TRUST_PROXY=true` only when the API is behind a trusted reverse proxy that correctly forwards client IP headers. Swagger is available in development and disabled when `NODE_ENV=production`; publish it separately only behind authenticated internal access if needed.

For local workshop access over the LAN, open the web app at `http://192.168.1.149:3000`. The development Next.js config allows that hostname for internal assets, and the local API example includes it in `CORS_ORIGINS`. When `NEXT_PUBLIC_API_URL` is not set, the web client uses the current browser hostname on port `4000`, so a second device reaches the API host instead of its own `localhost`.

Before promoting a release, run the database migration command once from the deployment job, wait for `/health/ready` to return HTTP 200, then route traffic to the web service. Do not use `CORS_ORIGINS=*`; production configuration validation requires explicit HTTPS origins and rejects the placeholder auth secret.
