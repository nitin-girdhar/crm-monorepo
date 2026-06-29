# Plan: Per-Service Database Users

## Current State

Today, **8 services share 3 database login roles**:

| Login Role | RLS Behavior | Services Using It |
|---|---|---|
| `lead_svc` → `SET ROLE app_user` | Full RLS | auth, users, leads, assignments, analytics, notifications, meta-capi |
| `tenant_dash_svc` → `SET ROLE tenant_admin` | Tenant-scoped RLS | analytics |
| `crm_service` | `BYPASSRLS` | auth, users, leads, assignments, analytics, activities, notifications, meta-capi |

**Problems:**
- DB logs/`pg_stat_activity` show `lead_svc` for 7 different services — no way to tell which service is running a query.
- A vulnerability in one service gives the attacker access to every table `lead_svc` can reach.
- Cannot set per-service connection limits — one service can starve the pool for all others.
- Cannot rotate credentials for one service without redeploying all of them.

**Good news:** The SQL init script already defines stub roles for this migration:

| Stub Role | Line in `01_init-db.sql` | Password |
|---|---|---|
| `campaign_svc` | 2127 | `replace_in_env` |
| `user_mgmt_svc` | 2135 | `replace_in_env` |
| `notif_svc` | 2143 | `replace_in_env` |
| `intake_svc` | 2151 | `replace_in_env` |
| `analytics_svc` | 2168 | `replace_in_env` (BYPASSRLS, SELECT-only) |
| `meta_svc` | 2972 | `MetaSvc_Dev2025` |

---

## Target State

Every service gets its own login role. The 3-tier RLS model (`app_user`, `tenant_admin`, `crm_service`) stays — login roles just `SET LOCAL ROLE` into the appropriate tier at transaction time, exactly as they do today.

| Service | Login Role | `GRANT ... TO <role>` | RLS Behavior | Needs `crm_service` pool? |
|---|---|---|---|---|
| auth-service | `auth_svc` | `app_user` | Full RLS | Yes (password reset, token cleanup) |
| users-service | `user_mgmt_svc` | `app_user` | Full RLS | Yes (admin user create, soft-delete) |
| leads-service | `lead_svc` | `app_user` | Full RLS | Yes (system-level stage transitions) |
| assignments-service | `assign_svc` | `app_user` | Full RLS | Yes (cross-org assignment listing) |
| analytics-service | `analytics_svc` | `tenant_admin` + `app_user` | Both tiers | Yes (tenant resolution lookup) |
| activities-service | `activity_svc` | _(none — uses `crm_service` only)_ | BYPASSRLS | Yes (sole pool) |
| notifications-service | `notif_svc` | `app_user` | Full RLS | Yes (LISTEN/NOTIFY, follow-up checker) |
| meta-conversion-api | `meta_svc` | `app_user` | Full RLS | Yes (webhook intake, CAPI outbound) |

### Why keep the `crm_service` pool?

Several services need to perform system-level operations (audit logging, cross-org reads, password resets) where RLS would block the query. The `crm_service` BYPASSRLS role serves that purpose. In the ideal final state, each service would have a **second dedicated admin role** (e.g., `auth_svc_admin` with BYPASSRLS), but that doubles the credential count. The pragmatic middle ground:

- **Phase 1 (this plan):** Per-service app-level roles + shared `crm_service` for admin ops.
- **Phase 2 (future):** Replace `crm_service` with per-service admin roles if compliance requires it.

---

## Implementation Plan

### Phase 1 — SQL: Create Missing Roles & Set Passwords

**File:** `db_scripts/01_init-db.sql`

The following roles need to be **created or updated** with real dev passwords (replacing `replace_in_env`):

```sql
-- ── auth_svc ──────────────────────────────────────────────────
-- NEW role (does not exist yet in the script)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_svc') THEN
    CREATE ROLE auth_svc WITH LOGIN PASSWORD 'AuthSvc_Dev2025' NOINHERIT;
  ELSE ALTER ROLE auth_svc WITH LOGIN PASSWORD 'AuthSvc_Dev2025' NOINHERIT; END IF;
END; $$;
GRANT app_user TO auth_svc;

-- ── assign_svc ────────────────────────────────────────────────
-- NEW role (does not exist yet in the script)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'assign_svc') THEN
    CREATE ROLE assign_svc WITH LOGIN PASSWORD 'AssignSvc_Dev2025' NOINHERIT;
  ELSE ALTER ROLE assign_svc WITH LOGIN PASSWORD 'AssignSvc_Dev2025' NOINHERIT; END IF;
END; $$;
GRANT app_user TO assign_svc;

-- ── activity_svc ──────────────────────────────────────────────
-- NEW role. Only writes to audit.activities via crm_service pool,
-- but needs its own login for connection tracking.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'activity_svc') THEN
    CREATE ROLE activity_svc WITH LOGIN PASSWORD 'ActivitySvc_Dev2025' NOINHERIT;
  ELSE ALTER ROLE activity_svc WITH LOGIN PASSWORD 'ActivitySvc_Dev2025' NOINHERIT; END IF;
END; $$;
GRANT app_user TO activity_svc;
```

**Update existing stubs with real passwords:**

```sql
ALTER ROLE user_mgmt_svc WITH PASSWORD 'UserMgmtSvc_Dev2025';
ALTER ROLE notif_svc     WITH PASSWORD 'NotifSvc_Dev2025';
ALTER ROLE campaign_svc  WITH PASSWORD 'CampaignSvc_Dev2025';
ALTER ROLE intake_svc    WITH PASSWORD 'IntakeSvc_Dev2025';
-- analytics_svc and meta_svc already have passwords set
```

**Grant schema USAGE and CONNECT to new roles:**

Update the existing `GRANT USAGE ON SCHEMA` loop (line 2186) to include the new roles:

```sql
EXECUTE format(
  'GRANT USAGE ON SCHEMA %I TO lead_svc, campaign_svc, user_mgmt_svc,
   notif_svc, intake_svc, tenant_dash_svc, analytics_svc, meta_svc,
   auth_svc, assign_svc, activity_svc', s
);
```

Add `GRANT CONNECT` for new roles (after line 2200):

```sql
EXECUTE format('GRANT CONNECT ON DATABASE %I TO auth_svc',     v_db);
EXECUTE format('GRANT CONNECT ON DATABASE %I TO assign_svc',   v_db);
EXECUTE format('GRANT CONNECT ON DATABASE %I TO activity_svc', v_db);
```

**Optional — per-service connection limits:**

```sql
ALTER ROLE auth_svc     CONNECTION LIMIT 15;
ALTER ROLE user_mgmt_svc CONNECTION LIMIT 10;
ALTER ROLE lead_svc     CONNECTION LIMIT 20;
ALTER ROLE assign_svc   CONNECTION LIMIT 10;
ALTER ROLE analytics_svc CONNECTION LIMIT 10;
ALTER ROLE activity_svc CONNECTION LIMIT 10;
ALTER ROLE notif_svc    CONNECTION LIMIT 10;
ALTER ROLE meta_svc     CONNECTION LIMIT 10;
```

---

### Phase 2 — Environment Variables

**File:** `.env`

Replace the single shared credential block with per-service credentials:

```env
# ── Per-service database credentials ────────────────────────────
DB_AUTH_SVC_USER=auth_svc
DB_AUTH_SVC_PASSWORD=AuthSvc_Dev2025

DB_USERS_SVC_USER=user_mgmt_svc
DB_USERS_SVC_PASSWORD=UserMgmtSvc_Dev2025

DB_LEADS_SVC_USER=lead_svc
DB_LEADS_SVC_PASSWORD=LeadSvc_Dev2025

DB_ASSIGNMENTS_SVC_USER=assign_svc
DB_ASSIGNMENTS_SVC_PASSWORD=AssignSvc_Dev2025

DB_ANALYTICS_SVC_USER=analytics_svc
DB_ANALYTICS_SVC_PASSWORD=AnalyticsSvc_Dev2025

DB_ACTIVITIES_SVC_USER=activity_svc
DB_ACTIVITIES_SVC_PASSWORD=ActivitySvc_Dev2025

DB_NOTIFICATIONS_SVC_USER=notif_svc
DB_NOTIFICATIONS_SVC_PASSWORD=NotifSvc_Dev2025

DB_META_SVC_USER=meta_svc
DB_META_SVC_PASSWORD=MetaSvc_Dev2025

# Tenant admin pool (only analytics needs it)
DB_TENANT_SVC_USER=tenant_dash_svc
DB_TENANT_SVC_PASSWORD=TenantSvc_Dev2025

# Admin pool (shared — Phase 2 will split this too)
DB_SERVICE_USER=crm_service
DB_SERVICE_PASSWORD=CrmSvc_Dev2025
```

Remove the old shared `DB_LEAD_SVC_USER` / `DB_LEAD_SVC_PASSWORD` vars.

Remove the old composed `DATABASE_URL` / `DATABASE_URL_TENANT` / `DATABASE_URL_SERVICE` lines — each service will get its own in docker-compose.

---

### Phase 3 — Docker Compose

**File:** `docker-compose.yml`

Replace the single shared `x-db-env` anchor with per-service environment blocks. Each service gets exactly the pools it needs.

```yaml
# ── Shared admin pool (most services need this) ──
x-db-service-env: &db-service-env
  DATABASE_URL_SERVICE: postgres://${DB_SERVICE_USER}:${DB_SERVICE_PASSWORD}@${DB_CONTAINER_NAME}:5432/${DB_NAME}

# ── Tenant pool (only analytics) ──
x-db-tenant-env: &db-tenant-env
  DATABASE_URL_TENANT: postgres://${DB_TENANT_SVC_USER}:${DB_TENANT_SVC_PASSWORD}@${DB_CONTAINER_NAME}:5432/${DB_NAME}

services:
  auth-service:
    environment:
      PORT: ${AUTH_SERVICE_PORT}
      DATABASE_URL: postgres://${DB_AUTH_SVC_USER}:${DB_AUTH_SVC_PASSWORD}@${DB_CONTAINER_NAME}:5432/${DB_NAME}
      <<: *db-service-env

  users-service:
    environment:
      PORT: ${USERS_SERVICE_PORT}
      DATABASE_URL: postgres://${DB_USERS_SVC_USER}:${DB_USERS_SVC_PASSWORD}@${DB_CONTAINER_NAME}:5432/${DB_NAME}
      <<: *db-service-env

  leads-service:
    environment:
      PORT: ${LEADS_SERVICE_PORT}
      DATABASE_URL: postgres://${DB_LEADS_SVC_USER}:${DB_LEADS_SVC_PASSWORD}@${DB_CONTAINER_NAME}:5432/${DB_NAME}
      <<: *db-service-env

  assignments-service:
    environment:
      PORT: ${ASSIGNMENTS_SERVICE_PORT}
      DATABASE_URL: postgres://${DB_ASSIGNMENTS_SVC_USER}:${DB_ASSIGNMENTS_SVC_PASSWORD}@${DB_CONTAINER_NAME}:5432/${DB_NAME}
      <<: *db-service-env

  analytics-service:
    environment:
      PORT: ${ANALYTICS_SERVICE_PORT}
      DATABASE_URL: postgres://${DB_ANALYTICS_SVC_USER}:${DB_ANALYTICS_SVC_PASSWORD}@${DB_CONTAINER_NAME}:5432/${DB_NAME}
      <<: *db-service-env
      <<: *db-tenant-env

  activities-service:
    environment:
      PORT: ${ACTIVITIES_SERVICE_PORT}
      DATABASE_URL: postgres://${DB_ACTIVITIES_SVC_USER}:${DB_ACTIVITIES_SVC_PASSWORD}@${DB_CONTAINER_NAME}:5432/${DB_NAME}
      <<: *db-service-env

  notifications-service:
    environment:
      PORT: ${NOTIFICATIONS_SERVICE_PORT}
      DATABASE_URL: postgres://${DB_NOTIFICATIONS_SVC_USER}:${DB_NOTIFICATIONS_SVC_PASSWORD}@${DB_CONTAINER_NAME}:5432/${DB_NAME}
      <<: *db-service-env

  meta-conversion-api:
    environment:
      PORT: ${META_SERVICE_PORT}
      DATABASE_URL: postgres://${DB_META_SVC_USER}:${DB_META_SVC_PASSWORD}@${DB_CONTAINER_NAME}:5432/${DB_NAME}
      <<: *db-service-env
```

> **Note on YAML merge keys:** You cannot use `<<:` twice in the same mapping. For analytics-service which needs both `*db-service-env` and `*db-tenant-env`, either inline both URLs or create a combined anchor `x-analytics-env`.

---

### Phase 4 — Application Code

**No changes needed in `packages/db`!** The `client.ts` pool factory reads `DATABASE_URL`, `DATABASE_URL_TENANT`, and `DATABASE_URL_SERVICE` from env vars. Since we're still setting those same env var names (just with different credentials per service via docker-compose), the shared package works as-is.

The key insight: the **same env var name** (`DATABASE_URL`) now resolves to a **different connection string** in each service container. Auth-service's `DATABASE_URL` connects as `auth_svc`, leads-service's connects as `lead_svc`, etc.

**Config files that validate env vars** — no changes needed either. Each service's `config.ts` calls `requireEnv('DATABASE_URL')` / `requireEnv('DATABASE_URL_SERVICE')`, which will still work since those vars are still present.

**What to verify:**

Each service's config.ts requires only the pools it actually uses. Confirm these match:

| Service | Requires `DATABASE_URL`? | Requires `DATABASE_URL_TENANT`? | Requires `DATABASE_URL_SERVICE`? |
|---|---|---|---|
| auth-service | Yes (line 19) | No | Yes (line 20) |
| users-service | Yes | No | Yes |
| leads-service | Yes | No | Yes |
| assignments-service | Yes | No | Yes |
| analytics-service | Yes | Yes | Yes |
| activities-service | No (only uses service pool) | No | Yes |
| notifications-service | Yes (line 10) | No | Yes (line 11) |
| meta-conversion-api | Yes | No | Yes |

**Potential issue — activities-service:** It only uses `withServiceTx` / `serviceDb()`. Its config currently requires `DATABASE_URL` because it gets `<<: *db-env` which sets it. After migration, if we stop passing `DATABASE_URL` to activities-service, `appDb()` would throw if anything calls it. Check that no code path in activities-service ever calls `appDb()` or `withRoleTx()`. If it doesn't, skip setting `DATABASE_URL` for it.

---

### Phase 5 — Local Dev `.env` Files

Each service's auto-generated `.env` file (e.g., `services/auth-service/.env`) needs updating. These are generated from the root `.env` — update the generation script or template to produce per-service values:

```env
# services/auth-service/.env (auto-generated)
DATABASE_URL=postgres://auth_svc:AuthSvc_Dev2025@localhost:5432/crm
DATABASE_URL_SERVICE=postgres://crm_service:CrmSvc_Dev2025@localhost:5432/crm
```

---

### Phase 6 — Existing Database Migration

For a **fresh database** (new `docker-compose up`), the updated `01_init-db.sql` handles everything.

For an **existing database**, run a one-time migration script:

```sql
-- 1. Create new roles (idempotent — same pattern as init script)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_svc') THEN
    CREATE ROLE auth_svc WITH LOGIN PASSWORD 'AuthSvc_Dev2025' NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'assign_svc') THEN
    CREATE ROLE assign_svc WITH LOGIN PASSWORD 'AssignSvc_Dev2025' NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'activity_svc') THEN
    CREATE ROLE activity_svc WITH LOGIN PASSWORD 'ActivitySvc_Dev2025' NOINHERIT;
  END IF;
END $$;

-- 2. Grant RLS tier roles
GRANT app_user TO auth_svc;
GRANT app_user TO assign_svc;
GRANT app_user TO activity_svc;

-- 3. Set real passwords on stub roles
ALTER ROLE user_mgmt_svc WITH PASSWORD 'UserMgmtSvc_Dev2025';
ALTER ROLE notif_svc     WITH PASSWORD 'NotifSvc_Dev2025';
ALTER ROLE campaign_svc  WITH PASSWORD 'CampaignSvc_Dev2025';
ALTER ROLE intake_svc    WITH PASSWORD 'IntakeSvc_Dev2025';

-- 4. Grant USAGE on all schemas
DO $$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['public','geo','entity','iam','crm','marketing','audit','ext'] LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO auth_svc, assign_svc, activity_svc', s);
  END LOOP;
END $$;

-- 5. Grant CONNECT
DO $$
DECLARE v_db TEXT := current_database();
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO auth_svc',     v_db);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO assign_svc',   v_db);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO activity_svc', v_db);
END $$;

-- 6. Optional: connection limits
ALTER ROLE auth_svc      CONNECTION LIMIT 15;
ALTER ROLE user_mgmt_svc CONNECTION LIMIT 10;
ALTER ROLE lead_svc      CONNECTION LIMIT 20;
ALTER ROLE assign_svc    CONNECTION LIMIT 10;
ALTER ROLE analytics_svc CONNECTION LIMIT 10;
ALTER ROLE activity_svc  CONNECTION LIMIT 10;
ALTER ROLE notif_svc     CONNECTION LIMIT 10;
ALTER ROLE meta_svc      CONNECTION LIMIT 10;
```

---

## Rollout Order

Execute in this order to avoid downtime:

1. **SQL first** — run the migration script on the existing database to create/update all roles. This is non-breaking; old credentials still work.
2. **Update `.env`** — add new per-service credential vars. Keep old vars temporarily for backward compatibility.
3. **Update `docker-compose.yml`** — switch from shared `x-db-env` to per-service env blocks.
4. **Restart services one at a time** — each service picks up its new credentials. Verify each connects successfully before moving to the next.
5. **Clean up** — remove old `DB_LEAD_SVC_USER`/`DB_LEAD_SVC_PASSWORD` from `.env` once no service references them.
6. **Update `01_init-db.sql`** — so fresh deployments get the new roles from the start.

---

## Verification Checklist

After migration, verify each service:

- [ ] `docker compose logs <service> | grep "pool"` — confirm connection established
- [ ] `SELECT usename, application_name, count(*) FROM pg_stat_activity GROUP BY 1,2;` — each service appears with its own login role
- [ ] Run the service's API test suite (Bruno files in `/api-testing/`)
- [ ] Check RLS enforcement: a `lead_svc` query should not return data from a different org
- [ ] Connection limits: `SELECT rolname, rolconnlimit FROM pg_roles WHERE rolconnlimit > 0;`

---

## Files Changed (Summary)

| File | Change |
|---|---|
| `db_scripts/01_init-db.sql` | Add `auth_svc`, `assign_svc`, `activity_svc` roles; set real passwords on stubs; update GRANT loops |
| `.env` | Add per-service credential vars; remove shared `DB_LEAD_SVC_*` |
| `docker-compose.yml` | Replace shared `x-db-env` with per-service DATABASE_URL |
| `services/*/. env` | Update auto-generated local dev env files |
| `packages/db/src/*` | **No changes** — env var names stay the same |
| `services/*/src/config.ts` | **No changes** — same env var names |

---

## What This Does NOT Change

- The RLS model (`app_user`, `tenant_admin`, `crm_service` tiers) — unchanged.
- The `packages/db` shared code (`client.ts`, `transaction.ts`, `drizzle.ts`) — unchanged.
- The `SET LOCAL ROLE` mechanism in transactions — unchanged.
- The `crm_service` BYPASSRLS admin pool — still shared (Phase 2 future work).

## Future Phase 2 — Per-Service Admin Roles

If compliance or security audit requires it, replace the shared `crm_service` with per-service admin roles:

| Service | Admin Role | Permissions |
|---|---|---|
| auth-service | `auth_svc_admin` | BYPASSRLS, access to `iam.users`, `iam.token_blocklist` only |
| activities-service | `activity_svc_admin` | BYPASSRLS, INSERT on `audit.activities` only |
| notifications-service | `notif_svc_admin` | BYPASSRLS, SELECT on `crm.lead_follow_ups` only |
| etc. | | |

This requires per-service `DATABASE_URL_SERVICE` credentials and more granular `GRANT`/`REVOKE` statements. Defer until needed.
