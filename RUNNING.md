# Running the CRM Monorepo — Manual Guide

This guide covers how to run the full stack **without the Makefile**, how all the
services fit together, and what to change if you already have PostgreSQL running
in Docker.

---

## Architecture Overview

```
Browser
  └─► Next.js Web App        (port 3000)
        └─► API Gateway       (port 4000)  ← single public entry point
              ├─► Auth Service             (port 4001)
              ├─► Users Service            (port 4002)
              ├─► Leads Service            (port 4003)
              ├─► Assignments Service      (port 4004)
              ├─► Analytics Service        (port 4005)
              ├─► Activities Service       (port 4006)
              └─► Meta Conversion API      (port 4007)
                    └─► PostgreSQL          (port 5432)

Meta (Facebook)
  └─► API Gateway  /meta/webhook/:integrationId  (public, no JWT)
        └─► Meta Conversion API (HMAC-verified per org)
```

**Key rules:**
- All browser traffic goes to the **API Gateway only**. Backend services are
  never exposed directly to the client.
- The API Gateway verifies JWT on every request, then proxies to the correct
  service.
- All services share the **same PostgreSQL database** (`crm`), isolated by
  Row-Level Security (RLS) and per-request GUC variables.
- The **Activities Service** is called by other services internally to log audit
  events. It is not proxied by the Gateway.
- The **Meta Conversion API** handles bidirectional Meta Lead Ads integration:
  inbound webhook lead sync and outbound CAPI conversion events. Public webhook
  endpoints use HMAC-SHA256 verification (per-org secrets) instead of JWT.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 20.x |
| pnpm | 9.x |
| PostgreSQL | 15+ (18.4 recommended) |

Install pnpm globally if you don't have it:
```
npm install -g pnpm@9
```

---

## Step 1 — Install dependencies

Run once from the monorepo root:

```
pnpm install
```

---

## Step 2 — Configure environment variables

Copy the example file and edit it:

```
copy .env.example .env       # Windows
cp .env.example .env          # Mac / Linux
```

The root `.env` is the **single source of truth**. It contains database
connection components, composed `DATABASE_URL*` strings, shared secrets, and
service ports. Both `pnpm dev` (local) and `docker compose` read from it.

Open `.env` and update at minimum:

```env
# Database connection components (docker-compose reads these directly)
DB_NAME=crm
DB_HOST=localhost
DB_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=Passw0rd

# Composed URLs for local dev (services outside Docker)
DATABASE_URL=postgres://lead_svc:LeadSvc_Dev2025@localhost:5432/crm
DATABASE_URL_TENANT=postgres://tenant_dash_svc:TenantSvc_Dev2025@localhost:5432/crm
DATABASE_URL_SERVICE=postgres://crm_service:CrmSvc_Dev2025@localhost:5432/crm

# Must be the same across every service — use a long random string
JWT_SECRET=change-me-to-a-long-random-string-at-least-64-chars

# Inter-service authentication — gateway injects this, services reject without it
INTERNAL_SERVICE_SECRET=change-me-to-another-long-random-string

# API key for the intake webhook endpoint (pre-shared with ad platform integrations)
WEBHOOK_API_KEY=change-me-webhook-key

# Next.js calls the gateway at this URL
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Everything else (ports, service URLs) can stay as-is for local development.

### Per-service .env files (optional)

Each service also has a `.env.example` documenting exactly what it needs. If you
want to run a single service in isolation (outside the monorepo dev workflow),
generate per-service `.env` files:

```
make setup-env
```

This reads the root `.env` and writes a scoped `.env` into each
`services/<name>/` directory. Then run the service with:

```
cd services/leads-service
pnpm dev:local            # loads ./services/leads-service/.env
```

---

## Step 3 — Initialise the database

### Option A — PostgreSQL running in Docker (fresh container)

The `docker-compose.yml` mounts `db_scripts/01_init-db.sql` into
`/docker-entrypoint-initdb.d/` so the schema is applied automatically on first
start:

```
docker compose up postgres -d --wait
```

### Option B — PostgreSQL already running (your own instance)

Apply the schema manually:

```
psql -U postgres -h localhost -p 5432 -d crm -f db_scripts/01_init-db.sql
```

If the `crm` database doesn't exist yet, create it first:

```
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE crm;"
psql -U postgres -h localhost -p 5432 -d crm -f db_scripts/01_init-db.sql
```

### Seeding demo data

After applying the schema, seed tenants, orgs, users, and leads:

```
psql -U postgres -h localhost -p 5432 -d crm -f db_scripts/02-seed-tenants-orgs-users.sql
psql -U postgres -h localhost -p 5432 -d crm -f db_scripts/03-seed-leads-bulk.sql
psql -U postgres -h localhost -p 5432 -d crm -f db_scripts/04-seed-interactions-followups.sql
psql -U postgres -h localhost -p 5432 -d crm -f db_scripts/05-cleanup-seed-helpers.sql
```

Or use the Makefile shortcut: `make seed-admin && make seed-data`

---

## Step 4 — Build shared packages

Services import from `@crm/db`, `@crm/types`, `@crm/permissions`, etc.
These must be compiled before any service can start:

```
pnpm turbo build --filter=./packages/*
```

Or build everything at once (packages + services + web):

```
pnpm turbo build
```

---

## Step 5 — Run services in development mode

Each service uses `tsx watch` which gives TypeScript hot-reload without a
separate compile step.

### Option A — Run everything together (recommended)

```
pnpm turbo dev --concurrency 16
```

Turbo starts all services and the web app in parallel, respects the dependency
graph, and streams colour-coded logs from every process. Each service loads the
root `.env` via `tsx --env-file ../../.env`.

### Option B — Run each service in a separate terminal

Open 9 terminals, one per process (order matters — start services before gateway,
gateway before web):

**Terminal 1 — Auth Service**
```
cd services/auth-service
pnpm dev
```

**Terminal 2 — Users Service**
```
cd services/users-service
pnpm dev
```

**Terminal 3 — Leads Service**
```
cd services/leads-service
pnpm dev
```

**Terminal 4 — Assignments Service**
```
cd services/assignments-service
pnpm dev
```

**Terminal 5 — Analytics Service**
```
cd services/analytics-service
pnpm dev
```

**Terminal 6 — Activities Service**
```
cd services/activities-service
pnpm dev
```

**Terminal 7 — Meta Conversion API**
```
cd services/meta-conversion-api
pnpm dev
```

**Terminal 8 — API Gateway** (start after all services above are listening)
```
cd services/api-gateway
pnpm dev
```

**Terminal 9 — Web App**
```
cd apps/web
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Option C — Run a single service in isolation

Generate per-service `.env` files first, then use `dev:local`:

```
make setup-env
cd services/leads-service
pnpm dev:local
```

### Health check endpoints

Each service exposes `/health`. Use these to verify a service is up before
starting the gateway:

```
curl http://localhost:4001/health   # auth
curl http://localhost:4002/health   # users
curl http://localhost:4003/health   # leads
curl http://localhost:4004/health   # assignments
curl http://localhost:4005/health   # analytics
curl http://localhost:4006/health   # activities
curl http://localhost:4007/health   # meta-conversion-api
curl http://localhost:4000/health   # gateway
```

---

## Step 6 — Run in production mode

Build all packages and services to `dist/`:

```
pnpm turbo build
```

Start each compiled service:

```
# from the monorepo root
node services/auth-service/dist/server.js
node services/users-service/dist/server.js
node services/leads-service/dist/server.js
node services/assignments-service/dist/server.js
node services/analytics-service/dist/server.js
node services/activities-service/dist/server.js
node services/meta-conversion-api/dist/server.js
node services/api-gateway/dist/server.js
```

Start the Next.js web app:

```
cd apps/web
pnpm start
```

In production use a process manager (PM2, systemd, Docker) to keep processes
alive and restart on crash.

---

## Cleanup

Remove compiled output from all packages:

```
pnpm turbo clean
```

Remove compiled output **and** `node_modules`:

```
make clean-all
```

---

## Environment variable flow

```
┌─────────────────────────────────────────────────────────────┐
│  LOCAL DEV (all services via turbo)                         │
│  pnpm dev → tsx --env-file ../../.env                       │
│  Change DB? → edit root .env only                           │
├─────────────────────────────────────────────────────────────┤
│  LOCAL DEV (single service isolation)                       │
│  make setup-env → generates per-service .env                │
│  cd services/x && pnpm dev:local → reads ./.env             │
│  Change DB? → edit root .env, re-run make setup-env         │
├─────────────────────────────────────────────────────────────┤
│  DOCKER COMPOSE                                             │
│  docker compose up                                          │
│  Reads root .env for ${VAR} interpolation                   │
│  Builds DATABASE_URL from components (DB_NAME, etc.)        │
│  Host = container name (crm-db-server), not localhost        │
│  Change DB? → edit root .env only                           │
├─────────────────────────────────────────────────────────────┤
│  PRODUCTION (K8s / ECS / etc.)                              │
│  No .env files — platform injects env vars                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Using your own PostgreSQL Docker container

If you already have a PostgreSQL container running (not from this project's
`docker-compose.yml`), you need two things:

### 1 — Update `.env`

Update the `DB_*` component vars and the composed `DATABASE_URL*` strings to
point at your instance:

```env
DB_NAME=crm
DB_HOST=localhost
DB_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=YourPassword

DATABASE_URL=postgres://lead_svc:LeadSvc_Dev2025@localhost:5432/crm
DATABASE_URL_TENANT=postgres://tenant_dash_svc:TenantSvc_Dev2025@localhost:5432/crm
DATABASE_URL_SERVICE=postgres://crm_service:CrmSvc_Dev2025@localhost:5432/crm
```

### 2 — Apply the schema manually

Your existing container won't pick up `01_init-db.sql` automatically (that only
runs on a fresh Docker volume). Apply it yourself:

```
psql -U postgres -h localhost -p 5432 -d crm -f db_scripts/01_init-db.sql
```

### Makefile change — skip the `postgres` service

Edit `docker-compose.yml` and remove (or comment out) the `postgres:` block
entirely, then update the `dev-infra` target in the Makefile so it doesn't try
to start a Postgres container:

**Before:**
```makefile
dev-infra: ## Start only Postgres in Docker (background)
	$(COMPOSE) up postgres -d --wait
```

**After:**
```makefile
dev-infra: ## Postgres is external — nothing to start
	@echo "Using external PostgreSQL — skipping container start"
```

And remove `depends_on: postgres` from every service in `docker-compose.yml`
if you ever run the full stack via Compose. Otherwise leave `docker-compose.yml`
alone and simply don't run `make dev-infra` — just start services with
`pnpm turbo dev` directly after your Postgres container is up.
