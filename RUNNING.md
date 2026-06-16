# Running the CRM Monorepo — Manual Guide

This guide covers how to run the full stack **without the Makefile**, how all the
services fit together, and what to change if you already have PostgreSQL running
in Docker.

---

## Architecture Overview

```
Browser
  └─► Next.js Web App   (port 3000)
        └─► API Gateway  (port 4000)  ← single public entry point
              ├─► Auth Service         (port 4001)
              ├─► Users Service        (port 4002)
              ├─► Leads Service        (port 4003)
              ├─► Assignments Service  (port 4004)
              ├─► Analytics Service    (port 4005)
              └─► Activities Service   (port 4006)
                    └─► PostgreSQL     (port 5432)
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

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 20.x |
| pnpm | 9.x |
| PostgreSQL | 15 or 16 |

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

Open `.env` and update at minimum:

```env
# Point to your PostgreSQL instance
DATABASE_URL=postgres://postgres:postgres@localhost:5432/crm
DATABASE_URL_TENANT=postgres://postgres:postgres@localhost:5432/crm
DATABASE_URL_SERVICE=postgres://postgres:postgres@localhost:5432/crm

# Must be the same across every service — use a long random string
JWT_SECRET=change-me-to-a-long-random-string-at-least-64-chars

# Next.js calls the gateway at this URL
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Everything else (ports, service URLs) can stay as-is for local development.

---

## Step 3 — Initialise the database

### Option A — PostgreSQL running in Docker (fresh container)

The `docker-compose.yml` mounts `scripts/init-db.sql` into
`/docker-entrypoint-initdb.d/` so the schema is applied automatically on first
start:

```
docker compose up postgres -d --wait
```

### Option B — PostgreSQL already running (your own instance)

Apply the schema manually:

```
psql -U postgres -h localhost -p 5432 -d crm -f scripts/init-db.sql
```

If the `crm` database doesn't exist yet, create it first:

```
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE crm;"
psql -U postgres -h localhost -p 5432 -d crm -f scripts/init-db.sql
```

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

## Step 5 — Seed the database

Create the super-admin user and initial tenant:

```
pnpm tsx scripts/seed-admin.ts
```

Optionally seed demo data (orgs, users, campaigns, leads):

```
pnpm tsx scripts/seed-data.ts
```

---

## Step 6 — Run services in development mode

Each service uses `tsx watch` which gives TypeScript hot-reload without a
separate compile step.

### Option A — Run everything together (recommended)

```
pnpm turbo dev --concurrency 16
```

Turbo starts all services and the web app in parallel, respects the dependency
graph, and streams colour-coded logs from every process.

### Option B — Run each service in a separate terminal

Open 8 terminals, one per process (order matters — start services before gateway,
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

**Terminal 7 — API Gateway** (start after all services above are listening)
```
cd services/api-gateway
pnpm dev
```

**Terminal 8 — Web App**
```
cd apps/web
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

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
curl http://localhost:4000/health   # gateway
```

---

## Step 7 — Run in production mode

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
pnpm turbo clean
node -e "require('fs').rmSync('node_modules', {recursive:true, force:true})"
```

---

## Using your own PostgreSQL Docker container

If you already have a PostgreSQL container running (not from this project's
`docker-compose.yml`), you need two things:

### 1 — Update `.env`

Point the three `DATABASE_URL*` variables at your container. Replace `localhost`
with `host.docker.internal` if your container is inside Docker and you are
running services on the host, or use the container's IP / network alias:

```env
DATABASE_URL=postgres://<user>:<password>@<host>:<port>/crm
DATABASE_URL_TENANT=postgres://<user>:<password>@<host>:<port>/crm
DATABASE_URL_SERVICE=postgres://<user>:<password>@<host>:<port>/crm
```

### 2 — Apply the schema manually

Your existing container won't pick up `init-db.sql` automatically (that only
runs on a fresh Docker volume). Apply it yourself:

```
psql -U <user> -h <host> -p <port> -d crm -f scripts/init-db.sql
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
