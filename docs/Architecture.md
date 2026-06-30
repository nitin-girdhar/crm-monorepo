# Architecture

## Request flow

```
Browser
  └─→ Next.js (port 3000)
        ├─ Server Components: reads JWT from cookie server-side for SSR
        └─ Client Components: fetch /api/* (rewritten to API Gateway)
              └─→ API Gateway (port 4000)
                    ├─ Public: /auth/login, /auth/logout, /intake/webhook
                    │          /meta/webhook/:integrationId (HMAC-verified)
                    └─ Protected: validates JWT → injects headers → proxies
                          ├─→ auth-service           (4001)
                          ├─→ users-service          (4002)
                          ├─→ leads-service          (4003)
                          ├─→ assignments-service    (4004)
                          ├─→ analytics-service      (4005)
                          ├─→ activities-service     (4006)
                          └─→ meta-conversion-api    (4007)

Meta (Facebook) ─→ API Gateway /meta/webhook/:integrationId ─→ meta-conversion-api
```

## API endpoints (via Gateway — port 4000)

### Public (no JWT)
| Method | Path | Service |
|---|---|---|
| GET | `/health` | gateway |
| POST | `/auth/login` | auth |
| POST | `/auth/logout` | auth |
| GET | `/auth/me` | auth |
| POST | `/intake/webhook` (x-api-key) | leads |
| GET/POST | `/meta/webhook/:integrationId` | meta-conversion-api |

### Protected (JWT required)
| Method | Path | Service |
|---|---|---|
| POST | `/auth/change-password` | auth |
| GET/POST | `/leads` | leads |
| GET/PATCH/DELETE | `/leads/:id` | leads |
| GET | `/leads/:id/timeline` | leads |
| GET/POST | `/leads/:id/interactions` | leads |
| GET | `/leads/:id/assignment-history` | leads |
| GET | `/leads/:id/assignments` | assignments |
| GET/POST | `/leads/:id/follow-ups` | leads |
| PATCH/DELETE | `/leads/:id/follow-ups/:followUpId` | leads |
| GET | `/follow-ups` | leads |
| GET/POST | `/campaigns` | leads |
| GET/PATCH/DELETE | `/campaigns/:id` | leads |
| GET | `/campaigns/platforms`, `/campaigns/statuses` | leads |
| GET | `/lookups`, `/lookups/cities`, `/lookups/lead-stages`, `/lookups/lead-stage-outcomes` | leads |
| GET | `/locations` | leads |
| GET/POST | `/users` | users |
| GET/PATCH/DELETE | `/users/:id` | users |
| GET | `/users/assignable`, `/users/team`, `/users/org-chart` | users |
| POST | `/users/:id/reset-password` | users |
| GET | `/branches`, `/branches/all`, `/lead-sources` | users |
| GET/POST | `/assignments` | assignments |
| GET | `/assignments/mine` | assignments |
| GET/PATCH/DELETE | `/assignments/:id` | assignments |
| GET | `/analytics/dashboard`, `/analytics/dashboard/campaigns` | analytics |
| GET | `/analytics/performance`, `/analytics/pipeline` | analytics |
| GET | `/activities` | activities |
| POST | `/meta/crm-event` | meta-conversion-api |
| POST | `/meta/capi/auto-trigger` | meta-conversion-api |
| GET/POST/PATCH | `/meta/integration` | meta-conversion-api |

### Legacy aliases
| Path | Redirects to |
|---|---|
| `/dashboard` | `/analytics/dashboard` |
| `/dashboard/campaigns` | `/analytics/dashboard/campaigns` |
| `/org/performance` | `/analytics/performance` |

## JWT & auth

- **Cookie**: `fc_session` (httpOnly, sameSite=lax, secure in production)
- **Algorithm**: HS256 with `JWT_SECRET`, issuer `fitclass-crm`, audience `fitclass-crm:web`
- **Password watermark**: `pwd_iat = floor(password_changed_at / 1000)`. `/auth/me` rejects any session where `payload.pwd_iat < db.passwordChangedAt`. This invalidates all sessions when a password is reset.
- **Gateway**: validates JWT with `jose` (Edge-compatible). Injects `X-User-Id`, `X-User-Role`, `X-Org-Id`, `X-Rank`, `X-Tenant-Id` headers onto every proxied request. Also injects `X-Internal-Secret` so downstream services can verify the request came through the gateway.
- **Services**: never re-verify the JWT — they trust the injected headers from the gateway. They reject requests missing `X-Internal-Secret`.

## Database pools

Three postgres.js pools exist, all with `transform: { column: { from: postgres.toCamel } }`:

| Pool | Connection | RLS | Used for |
|---|---|---|---|
| `appDb()` | `DATABASE_URL` (app_user) | Enabled | Org-scoped reads/writes |
| `tenantDb()` | `DATABASE_URL_TENANT` (tenant_admin) | Enabled (tenant scope) | Cross-org reads within a tenant |
| `serviceDb()` | `DATABASE_URL_SERVICE` (crm_service) | BYPASSRLS | System operations |

### Transaction helpers

- **`withRoleTx(ctx, fn)`** — Dispatches based on `ctx.role`: `super_admin` uses serviceDb, `tenant_admin` uses tenantDb, others use appDb with `SET LOCAL ROLE app_user` + GUCs.
- **`withServiceTx(fn)`** — No role switch, BYPASSRLS. Used for auth lookups, seed scripts, activity logging, and webhook ingestion.

## Row Level Security

RLS is enabled on `crm.marketing_leads`, `crm.lead_links`, `iam.users`, `marketing.ad_campaigns`, `crm.lead_interactions`, `crm.lead_follow_ups`, `crm.lead_assignment_log`, `crm.lead_status_log`, `ext.meta_org_config`, `ext.meta_leads`, `ext.meta_lead_custom_fields`, `ext.meta_capi_outbound_logs`, `ext.meta_lead_addresses`, `ext.meta_lead_professional`, and `ext.meta_lead_demographics`. Each table has:

- `org_isolation_policy` (TO app_user): restricts rows to `org_id = current_setting('app.current_org_id')::uuid`

Some tables also have:
- `tenant_isolation_policy` (TO tenant_admin): restricts rows to orgs belonging to `current_setting('app.current_tenant_id')::uuid`

`crm_service` has `BYPASSRLS` and is unaffected by these policies.

## Assignment model

Assignments are **not** a separate table. The assignment is stored as `crm.marketing_leads.assigned_user_id`. The assignments-service queries and updates `crm.marketing_leads` directly. Assignment ID in API responses = Lead ID.

## Activity logging

Fire-and-forget: every service calls activities-service via HTTP (no `await` on the fetch result, errors swallowed). This ensures activity logging never blocks or fails a user-facing request.

## Meta Conversion API

Bidirectional integration with Meta (Facebook) Lead Ads:

### Inbound flow (Meta → CRM)
1. Meta sends a webhook POST to `/meta/webhook/:integrationId` through the gateway
2. Gateway forwards raw bytes (not re-serialized JSON) via `proxyToRaw()` for HMAC integrity
3. Meta-conversion-api looks up `ext.meta_org_config` by the integration ID to get per-org credentials
4. HMAC-SHA256 verification using the org's `app_secret`
5. Fetches full lead data from Meta Graph API using the org's `access_token`
6. Always inserts a new `crm.marketing_leads` row (source=facebook, stage=new). If an active lead with the same `(org_id, phone)` already exists, the old row is marked `is_active=false, superseded_by=<new_id>` and a `crm.lead_links` record (`link_type='merge'`) is written for audit. A linked `ext.meta_leads` row is created referencing the new marketing lead.
7. Field extraction uses the org's `field_mappings` (from `ext.meta_org_config.field_mappings`, JSONB) merged over the hardcoded `DEFAULT_FIELD_MAPPINGS` — lets an org remap Meta form field keys without a redeploy
8. Address/job/demographic fields are written to `ext.meta_lead_addresses`, `ext.meta_lead_professional`, `ext.meta_lead_demographics` (1:1, only when at least one field is present)
9. Any remaining unmapped form fields stored in `ext.meta_lead_custom_fields`

### Outbound flow (CRM → Meta CAPI)
- **Auto-trigger**: When a lead's stage changes, leads-service fires a fire-and-forget HTTP call to meta-conversion-api. The service checks if the new stage is in `ext.meta_org_config.capi_trigger_stages` and sends a CAPI event if so.
- **Manual trigger**: `POST /meta/crm-event` (protected, JWT-authenticated) allows users to manually send conversion events.
- PII is SHA256-hashed before transmission. Deterministic `event_id` ensures Meta deduplication.
- Partial unique index on `ext.meta_capi_outbound_logs(marketing_lead_id, event_name) WHERE delivery_status = 'SUCCESS'` prevents duplicate events.

## Permissions

Role rank is an integer (0–100). The gateway injects `X-Rank` and services use it for authorization:

| Role | Rank |
|---|---|
| read_only | 0 |
| sales_representative | 20 |
| senior_sales_executive | 40 |
| org_manager | 60 |
| org_sr_manager | 70 |
| org_admin | 80 |
| tenant_admin | 90 |
| super_admin | 100 |

`can_assign_to(org_id, acting_user_id, target_user_id)` is a PostgreSQL function (3-param, SECURITY DEFINER). Managers and senior roles may assign within their subtree via `vw_user_team_members`; admins and tenant_admins may assign within/across their org/tenant.

## Shared packages

All packages live in `packages/` and are consumed via workspace references (`@crm/*`). They compile to ESM via `tsc` (`"module": "NodeNext"`). Services import from them; they never import from each other (no circular deps).

| Package | Purpose |
|---|---|
| `@crm/db` | Connection pools, Drizzle schema, transaction helpers, blocklist |
| `@crm/types` | Shared TypeScript interfaces |
| `@crm/validation` | Zod schemas for request validation |
| `@crm/permissions` | RANKS object, permission check helpers |
| `@crm/auth-constants` | AUTH_COOKIE_NAME and other auth constants |
| `@crm/internal-client` | HTTP client for inter-service calls |

## Key database objects

### Views
- `crm.vw_dashboard_leads` — paginated lead listing with all display fields
- `crm.vw_lead_followup_timeline` — follow-up events for lead detail
- `iam.vw_user_team_members` / `iam.vw_user_org_chart` — hierarchy views
- `crm.vw_org_performance_snapshot` — per-org metrics
- `crm.vw_tenant_full_dashboard` — cross-org tenant metrics
- `crm.vw_rep_performance` — per-sales-rep lead counts by stage
- `ext.view_meta_leads_complete` — meta_leads joined to marketing_leads, addresses, professional, and demographics

### Functions
- `iam.can_assign_to(org_id, acting_user_id, target_user_id)` — authority check (3-param, SECURITY DEFINER)
- `public.gen_uuidv7()` — RFC 9562 time-ordered UUID generator
- `iam.fn_user_active_orgs(user_id)` / `iam.fn_org_active_users(org_id)` — membership lookups

### Meta-specific tables (`ext` schema)
- `ext.meta_org_config` — per-org Meta credentials, pixel ID, CAPI trigger stages, `field_mappings` (JSONB, runtime-reloadable form field key overrides)
- `ext.meta_leads` — raw Meta lead data (BIGINT meta_lead_id) linked to crm.marketing_leads via FK
- `ext.meta_lead_custom_fields` — unmapped form fields (1:many)
- `ext.meta_lead_addresses` — address fields from Meta lead forms (1:1)
- `ext.meta_lead_professional` — job/company fields from Meta lead forms (1:1)
- `ext.meta_lead_demographics` — demographic fields from Meta lead forms (1:1)
- `ext.meta_capi_outbound_logs` — CAPI event audit trail with idempotency index
