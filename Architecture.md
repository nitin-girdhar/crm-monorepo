# Architecture

## Request flow

```
Browser
  └─→ Next.js (port 3000)
        ├─ Server Components: reads JWT from cookie server-side for SSR
        └─ Client Components: fetch /api/* (rewritten to API Gateway)
              └─→ API Gateway (port 4000)
                    ├─ Public: /auth/login, /auth/logout, /intake/webhook
                    └─ Protected: validates JWT → injects headers → proxies
                          ├─→ auth-service      (4001)
                          ├─→ users-service     (4002)
                          ├─→ leads-service     (4003)
                          ├─→ assignments-service (4004)
                          ├─→ analytics-service (4005)
                          └─→ activities-service (4006)
```

## JWT & auth

- **Cookie**: `fc_session` (httpOnly, sameSite=lax, secure in production)
- **Algorithm**: HS256 with `JWT_SECRET`, issuer `fitclass-crm`, audience `fitclass-crm:web`
- **Password watermark**: `pwd_iat = floor(password_changed_at / 1000)`. `/auth/me` rejects any session where `payload.pwd_iat < db.passwordChangedAt`. This invalidates all sessions when a password is reset.
- **Gateway**: validates JWT with `jose` (Edge-compatible). Injects `X-User-Id`, `X-User-Role`, `X-Org-Id`, `X-Rank` headers onto every proxied request.
- **Services**: never re-verify the JWT — they trust the injected headers from the gateway.

## Database pools

Three postgres.js pools exist, all with `transform: { column: { from: postgres.toCamel } }`:

| Pool | Connection | RLS | Used for |
|---|---|---|---|
| `appDb()` | `DATABASE_URL` (app_user) | Enabled | Org-scoped reads/writes |
| `tenantDb()` | `DATABASE_URL_TENANT` (tenant_admin) | Disabled | Cross-org reads |
| `serviceDb()` | `DATABASE_URL_SERVICE` (service_role) | Disabled / BYPASSRLS | System operations |

### Transaction helpers

- **`withOrgTx(orgId, userId, fn)`** — `SET LOCAL ROLE app_user` + sets GUCs `app.current_org_id` and `app.current_user_id`. RLS policy `leads_org_isolation` restricts `marketing_leads` to that org.
- **`withTenantTx(tenantId, userId, fn)`** — `SET LOCAL ROLE tenant_admin`. Cross-org reads within a tenant.
- **`withServiceTx(fn)`** — No role switch, BYPASSRLS. Used for auth lookups, seed scripts, activity logging.

## Row Level Security

RLS is enabled on `marketing_leads`, `users`, `ad_campaigns`, `lead_interactions`, `lead_follow_ups`, `lead_assignment_log`, and `lead_status_log`. Each table has two policies:

- `org_isolation_policy` (TO app_user): restricts rows to `org_id = current_setting('app.current_org_id')::uuid`
- `tenant_isolation_policy` (TO tenant_admin): restricts rows to orgs belonging to `current_setting('app.current_tenant_id')::uuid`

`service_role` has `BYPASSRLS` and is unaffected by these policies.

The `set_org_id()` trigger auto-populates `org_id` from `app.current_org_id` on INSERT when `org_id` is not supplied explicitly.

## Assignment model

Assignments are **not** a separate table. The assignment is stored as `marketing_leads.assigned_user_id`. The assignments-service queries and updates `marketing_leads` directly. Assignment ID in API responses = Lead ID.

## Activity logging

Fire-and-forget: every service calls activities-service via HTTP (no `await` on the fetch result, errors swallowed). This ensures activity logging never blocks or fails a user-facing request.

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

## Key database objects

- `vw_dashboard_leads` — paginated lead listing with all display fields
- `vw_lead_followup_timeline` — follow-up events for lead detail
- `vw_user_team_members` / `vw_user_org_chart` — hierarchy views
- `vw_org_performance_snapshot` — per-org metrics
- `vw_tenant_full_dashboard` — cross-org tenant metrics
- `can_assign_to(org_id, acting_user_id, target_user_id)` — authority check function (3-param)
