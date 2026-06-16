# CRM Monorepo

A microservices CRM system built with Next.js 15, Fastify, PostgreSQL, and pnpm workspaces / Turborepo.

## Quick start

```bash
# 1. Copy env file and fill in secrets
cp .env.example .env

# 2. Start Postgres (Docker)
make dev-infra

# 3. Apply schema + lookup data
psql $DATABASE_URL_SERVICE -f db_scripts/init-db.sql

# 4. (Optional) Load demo data — password for all accounts: Admin@1234
psql $DATABASE_URL_SERVICE -f db_scripts/init-seed.sql

# 5. Start all services and the web app
make dev
```

Open [http://localhost:3000](http://localhost:3000) and log in (`root.user@root.com` / `Admin@1234` if demo data was loaded).

## Architecture

```
crm_monorepo/
├── apps/
│   └── web/               # Next.js 15 App Router frontend (port 3000)
├── packages/
│   ├── types/             # Shared TypeScript types
│   ├── auth-constants/    # JWT config, ROLES, AUTH_COOKIE_NAME
│   ├── permissions/       # RANKS constants
│   ├── db/                # postgres.js pools + transaction helpers
│   ├── validation/        # zod schemas
│   └── internal-client/   # Typed fetch client for inter-service calls
└── services/
    ├── api-gateway/       # JWT validation + reverse proxy (port 4000)
    ├── auth-service/      # Login, logout, /me, change-password (port 4001)
    ├── users-service/     # User CRUD, org-chart, branches (port 4002)
    ├── leads-service/     # Lead CRUD, follow-ups, interactions (port 4003)
    ├── assignments-service/ # Lead assignment management (port 4004)
    ├── analytics-service/ # Dashboard & pipeline metrics (port 4005)
    └── activities-service/ # Audit log (port 4006)
```

## Common commands

| Command | Description |
|---|---|
| `make dev` | Start everything locally (Postgres via Docker + all services) |
| `make build` | Build all packages and services |
| `make typecheck` | TypeScript check across the entire monorepo |
| `make lint` | ESLint across the entire monorepo |
| `make up` | Start the full stack via Docker Compose |
| `make down` | Stop Docker Compose stack |
| `make db-shell` | Open psql in the Postgres container |

## Environment variables

See `.env.example` for the full list. Required keys:

- `DATABASE_URL` — app_user connection (RLS-on)
- `DATABASE_URL_TENANT` — tenant_admin connection
- `DATABASE_URL_SERVICE` — service_role connection (BYPASSRLS)
- `JWT_SECRET` — HS256 signing secret (same value across all services)
- `BCRYPT_ROUNDS` — password hashing cost (default 12)

## Tech stack

- **Frontend**: Next.js 15, React 19, SWR, AG Grid, CSS Modules
- **Backend**: Fastify, postgres.js, jsonwebtoken, bcryptjs, pino
- **Auth**: JWT HS256 with issuer/audience pinning, httpOnly cookie (`fc_session`), password watermark (`pwd_iat`)
- **Database**: PostgreSQL 16 with Row Level Security
- **Tooling**: Turborepo, pnpm workspaces, TypeScript 5, tsx
