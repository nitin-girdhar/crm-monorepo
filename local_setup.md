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
# Edit .env — update DB_NAME, POSTGRES_PASSWORD, JWT_SECRET as needed

# Install all workspace dependencies
make install

# Start Postgres in Docker
make dev-infra

# Apply schema + lookup data
make migrate

# (Optional) Load demo seed data
# All demo accounts password: Admin@12345
make seed-admin
make seed-data

# Start all backend services + Next.js
make dev
```

Open http://localhost:3000 and log in.

## Environment variables

The root `.env` is the **single source of truth**. It contains:
- `DB_NAME`, `DB_HOST`, `DB_PORT`, `POSTGRES_PASSWORD` — database components
- `DATABASE_URL*` — composed connection strings for local dev
- `DB_LEAD_SVC_USER/PASSWORD`, etc. — service role credentials
- `JWT_SECRET`, `INTERNAL_SERVICE_SECRET` — shared secrets

`docker-compose.yml` reads the component variables via `${VAR}` interpolation
and constructs its own `DATABASE_URL*` with the Docker network hostname. You
never need to edit `docker-compose.yml` when changing DB config.

### Per-service .env files (for isolated debugging)

```bash
make setup-env              # generates services/*/.env from root .env
cd services/leads-service
pnpm dev:local              # uses ./services/leads-service/.env
```

## Running individual services

Every service has `pnpm dev` which uses `tsx watch` for hot-reload:

```bash
# From repo root (loads root .env)
pnpm --filter @crm/auth-service dev
pnpm --filter @crm/api-gateway dev
pnpm --filter @crm/web dev
```

Or use Turborepo to run a subset:

```bash
pnpm turbo dev --filter=auth-service --filter=api-gateway --filter=web
```

## Database

Postgres runs in Docker on `localhost:5432`, database `crm` (configurable via
`DB_NAME` in `.env`).

```bash
# psql shell
make db-shell

# Or directly (uses superuser — for schema/seed only)
psql postgres://postgres:Passw0rd@localhost:5432/crm
```

SQL scripts live in `db_scripts/`:

| File | Purpose |
|---|---|
| `01_init-db.sql` | Full schema + all lookup/reference data. Idempotent — safe to re-run. |
| `02-seed-tenants-orgs-users.sql` | Demo tenants, orgs, users. |
| `03-seed-leads-bulk.sql` | 500 leads per org (5,000 total). |
| `04-seed-interactions-followups.sql` | Interactions and follow-ups for seeded leads. |
| `05-cleanup-seed-helpers.sql` | Drops temporary seed helper functions. |

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
| meta-conversion-api | 4007 |
| PostgreSQL | 5432 |

## Debugging & service inspection

```bash
# Check which CRM services are listening (ports 4000–4007)
netstat -ano | findstr /R ":400[0-7].*LISTENING"

# Kill a service on a specific port (replace PID with actual value)
# First find PID:  netstat -ano | findstr ":4000.*LISTENING"
# Then kill:       taskkill /PID <PID> /F

# Docker container status
docker compose ps

# Stream logs for a specific service
docker compose logs auth-service -f --tail 50

# Health checks (verify each service is up)
curl http://localhost:4000/health   # gateway
curl http://localhost:4001/health   # auth
curl http://localhost:4002/health   # users
curl http://localhost:4003/health   # leads
curl http://localhost:4004/health   # assignments
curl http://localhost:4005/health   # analytics
curl http://localhost:4006/health   # activities
curl http://localhost:4007/health   # meta-conversion-api

# Restart a single service
docker compose restart leads-service

# Rebuild and restart everything
docker compose up --build -d
```

## API testing with Bruno

The `api-testing/` folder contains a complete Bruno collection for all endpoints.

1. Install [Bruno](https://www.usebruno.com/)
2. **Open Collection** → select `api-testing/`
3. Select the **Local** environment
4. Run **Auth → Login** first (auto-saves auth variables)
5. All other requests use the saved variables

## Troubleshooting

**`ECONNREFUSED` on startup** — Postgres container isn't healthy yet. Run `make dev-infra` and wait for the health check to pass.

**`Missing required environment variable`** — A service started before `.env` was copied. Copy `.env.example` → `.env`, fill it in, and restart.

**Type errors in packages/** — Run `make build` once to force-compile all shared packages. `make dev` builds them automatically on start, but a manual build is useful after pulling changes.
