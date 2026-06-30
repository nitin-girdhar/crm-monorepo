# CRM Monorepo

A microservices CRM system built with Next.js 15, Fastify, PostgreSQL, and pnpm workspaces / Turborepo.

## Quick start

```bash
# 1. Copy env file and fill in secrets
cp .env.example .env

# 2. Start Postgres (Docker)
make dev-infra

# 3. Apply schema (runs automatically on fresh Docker volume, or manually)
make migrate

# 4. (Optional) Seed demo data — password for all accounts: Admin@12345
make seed-admin && make seed-data

# 5. Start all services and the web app
make dev
```

Open [http://localhost:3000](http://localhost:3000) and log in.

## Architecture

```
crm_monorepo/
├── apps/
│   └── web/               # Next.js 15 App Router frontend (port 3000)
├── packages/
│   ├── types/             # Shared TypeScript types
│   ├── auth-constants/    # JWT config, ROLES, AUTH_COOKIE_NAME
│   ├── permissions/       # RANKS constants
│   ├── db/                # postgres.js pools + Drizzle schema + transaction helpers
│   ├── validation/        # zod schemas
│   └── internal-client/   # Typed fetch client for inter-service calls
└── services/
    ├── api-gateway/       # JWT validation + reverse proxy (port 4000)
    ├── auth-service/      # Login, logout, /me, change-password (port 4001)
    ├── users-service/     # User CRUD, org-chart, orgs (port 4002)
    ├── leads-service/     # Lead CRUD, follow-ups, interactions (port 4003)
    ├── assignments-service/ # Lead assignment management (port 4004)
    ├── analytics-service/ # Dashboard & pipeline metrics (port 4005)
    ├── activities-service/ # Audit log (port 4006)
    └── meta-conversion-api/ # Meta Lead Ads + CAPI integration (port 4007)
```

## Database schemas

Tables are organised into PostgreSQL schemas for namespace clarity:

| Schema | Tables |
|---|---|
| `geo` | countries, states, cities |
| `entity` | tenants, organizations, org_types, tenant_domains, tenant_plan_types |
| `iam` | users, user_roles, user_org_mapping, token_blocklist |
| `crm` | marketing_leads, lead_stage, lead_stage_outcome, lead_sources, lead_interactions, lead_follow_ups, lead_assignment_log, lead_status_log, interaction_types, follow_up_statuses |
| `marketing` | ad_campaigns, marketing_platforms, campaign_statuses |
| `audit` | audit_log, marketing_leads_history, activities |
| `ext` | meta_org_config, meta_leads, meta_lead_custom_fields, meta_capi_outbound_logs |
| `public` | schema_versions, utility functions (gen_uuidv7, set_updated_at, etc.) |

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
| `make setup-env` | Generate per-service `.env` files from root `.env` |
| `make migrate` | Apply database schema |
| `make seed-admin` | Seed tenants, orgs, and users |
| `make seed-data` | Seed leads, interactions, follow-ups |

## API testing (Bruno)

The `api-testing/` folder contains a complete [Bruno](https://www.usebruno.com/) collection covering every endpoint across all services.

**Setup:**
1. Open Bruno → **Open Collection** → select `api-testing/`
2. Select the **Local** environment (top-right)
3. Run **Auth → Login** first — it auto-saves `authToken`, `userId`, `orgId`
4. All other requests use these variables automatically

**Collection structure:**
| Folder | Endpoints |
|---|---|
| Auth | Login, Logout, Me, Change Password |
| Users | CRUD, Assignable, Team, Org Chart, Reset Password |
| Leads | CRUD, Timeline, Assignment History, Assignments |
| Leads/Interactions | List, Create |
| Leads/Follow-Ups | CRUD, Cross-lead Pipeline |
| Leads/Lookups | All Lookups, Stages, Outcomes, Cities, Locations |
| Campaigns | CRUD, Platforms, Statuses |
| Assignments | CRUD, My Assignments |
| Analytics | Dashboard, Campaign Dashboard, Performance, Pipeline |
| Activities | List (Audit Log) |
| Orgs | Filtered, All, Lead Sources |
| Intake | Webhook Lead Intake |
| Meta-CAPI | Integration CRUD, CRM Event (Manual), Auto-Trigger |

## Environment variables

The root `.env` is the **single source of truth**. `docker-compose.yml` reads
component variables (`DB_NAME`, `POSTGRES_PASSWORD`, etc.) via `${VAR}`
interpolation — you never need to edit `docker-compose.yml` when changing DB
config. See `.env.example` for the full list.

Each service also has its own `.env.example` documenting exactly what it needs.
Run `make setup-env` to generate per-service `.env` files for isolated debugging
(`pnpm dev:local`).

Required keys:

- `DATABASE_URL` — app_user connection (RLS-on)
- `DATABASE_URL_TENANT` — tenant_admin connection
- `DATABASE_URL_SERVICE` — service_role connection (BYPASSRLS)
- `JWT_SECRET` — HS256 signing secret (same value across all services)
- `BCRYPT_ROUNDS` — password hashing cost, required integer (recommended: 12)

## Tech stack

- **Frontend**: Next.js 15, React 19, SWR, AG Grid, CSS Modules
- **Backend**: Fastify, postgres.js, jsonwebtoken, bcryptjs, pino
- **Auth**: JWT HS256 with issuer/audience pinning, httpOnly cookie (`fc_session`), password watermark (`pwd_iat`)
- **Database**: PostgreSQL 18.4 with Row Level Security, multi-schema (geo/entity/iam/crm/marketing/audit/ext)
- **Tooling**: Turborepo, pnpm workspaces, TypeScript 5, tsx
