# Local development setup

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 22+ | https://nodejs.org |
| pnpm | 9+ | `npm i -g pnpm@9` |
| Docker Desktop | latest | https://docker.com |
| Make | any | pre-installed on macOS/Linux; Windows: `winget install GnuWin32.Make` |

## First-time setup

```bash
# Clone the repo
git clone <repo-url> crm_monorepo
cd crm_monorepo

# Copy env template
cp .env.example .env
# Edit .env — fill in JWT_SECRET and any passwords you want to change

# Install all workspace dependencies
make install

# Start Postgres in Docker
make dev-infra

# Apply schema + lookup data
psql $DATABASE_URL_SERVICE -f db_scripts/init-db.sql

# (Optional) Load demo seed data — 2 tenants, 4 orgs, 31 users, 36 leads
# All demo accounts password: Admin@1234  |  super-admin: root.user@root.com
psql $DATABASE_URL_SERVICE -f db_scripts/init-seed.sql

# Start all backend services + Next.js
make dev
```

Open http://localhost:3000 and log in.

## Running individual services

Every service has `pnpm dev` which uses `tsx watch` for hot-reload:

```bash
# From repo root
pnpm --filter @crm/auth-service dev
pnpm --filter @crm/api-gateway dev
pnpm --filter @crm/web dev
```

Or use Turborepo to run a subset:

```bash
pnpm turbo dev --filter=auth-service --filter=api-gateway --filter=web
```

## Database

Postgres runs in Docker on `localhost:5432`, database `crm`.

```bash
# psql shell
make db-shell

# Or directly
psql postgres://postgres:postgres@localhost:5432/crm
```

SQL scripts live in `db_scripts/`:

| File | Purpose |
|---|---|
| `db_scripts/init-db.sql` | Full schema + all lookup/reference data. Idempotent — safe to re-run. |
| `db_scripts/init-seed.sql` | Demo transactional data (tenants, orgs, users, leads). Run once on a fresh DB. |

## Ports

| Service | Port |
|---|---|
| Next.js web | 3000 |
| API Gateway | 4000 |
| auth-service | 4001 |
| users-service | 4002 |
| leads-service | 4003 |
| assignments-service | 4004 |
| analytics-service | 4005 |
| activities-service | 4006 |
| PostgreSQL | 5432 |

## Troubleshooting

**`ECONNREFUSED` on startup** — Postgres container isn't healthy yet. Run `make dev-infra` and wait for the health check to pass.

**`Missing required environment variable`** — A service started before `.env` was copied. Copy `.env.example` → `.env`, fill it in, and restart.

**Type errors in packages/** — Run `make build` once to force-compile all shared packages. `make dev` builds them automatically on start, but a manual build is useful after pulling changes.
