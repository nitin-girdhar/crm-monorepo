# CRM Monorepo — Database Model

> **Database:** PostgreSQL 14+  
> **Schema version:** 1.2.0  
> **Primary keys:** UUIDv7 (time-ordered) for operational tables; SMALLINT/INTEGER identity for geographic lookups  
> **Multi-tenancy:** Row Level Security (RLS) on every operational table  
> **Extensions:** pgcrypto, pg_trgm, btree_gin, vector (optional)

---

## Schema Diagram (Entity-Relationship)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    SCHEMA: geo                                              │
│                                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                                 │
│  │  countries    │◄────│   states     │◄────│   cities     │                                 │
│  │  (SMALLINT)   │ 1:N │  (SMALLINT)  │ 1:N │  (INTEGER)   │                                │
│  └──────────────┘     └──────────────┘     └──────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  SCHEMA: entity                                             │
│                                                                                             │
│  ┌────────────────┐  ┌──────────────────┐  ┌───────────────┐                                │
│  │ tenant_domains │  │ tenant_plan_types│  │  org_types    │                                 │
│  └───────┬────────┘  └────────┬─────────┘  └──────┬────────┘                                │
│          │                    │                    │                                         │
│          ▼                    ▼                    ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐     ┌──────────────┐           │
│  │                    tenants                               │◄────│ organizations│──┐        │
│  │  (id, name, domain_id, plan_type_id, is_active, ...)    │ 1:N │              │  │        │
│  └──────────────────────────────────────────────────────────┘     └──────┬───────┘  │        │
│                                                                         │          │        │
│                                                                    1:N  │          │        │
│                                                                  ┌──────▼───────┐  │        │
│                                                                  │  branches    │  │        │
│                                                                  └──────────────┘  │        │
└─────────────────────────────────────────────────────────────────────────┼──────────┘        │
                                                                         │                    │
                    ┌────────────────────────────────────────────────────┘                    │
                    │ (org_id FK on nearly all operational tables)                             │
                    ▼                                                                          │
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    SCHEMA: iam                                              │
│                                                                                             │
│  ┌──────────────┐     ┌──────────────────────────────┐     ┌──────────────────────┐         │
│  │  user_roles  │◄────│            users             │────►│  user_org_mapping    │         │
│  └──────────────┘     │  (self-ref: manager_id)      │     │  (PK: user_id+org_id)│         │
│                       └──────────────────────────────┘     └──────────────────────┘         │
│                                                                                             │
│  ┌──────────────────────┐                                                                   │
│  │  token_blocklist     │  (JWT revocation: jti, user, org, tenant scope)                   │
│  └──────────────────────┘                                                                   │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    SCHEMA: crm                                              │
│                                                                                             │
│  ┌──────────────┐  ┌───────────────────┐  ┌──────────────────┐  ┌────────────────────┐      │
│  │  lead_stage  │──│ lead_stage_outcome│  │ interaction_types│  │ follow_up_statuses │      │
│  └──────┬───────┘  └────────┬──────────┘  └────────┬─────────┘  └─────────┬──────────┘      │
│         │                   │                      │                      │                  │
│         ▼                   ▼                      │                      │                  │
│  ┌──────────────────────────────────────┐          │                      │                  │
│  │          marketing_leads            │          │                      │                  │
│  │  (core lead entity, soft-delete)    │          │                      │                  │
│  │  FK → org, stage, outcome, campaign,│          │                      │                  │
│  │       source, branch, assigned_user,│          │                      │                  │
│  │       duplicate_lead (self-ref)     │          │                      │                  │
│  └────┬────────────────┬───────────┬───┘          │                      │                  │
│       │                │           │               │                      │                  │
│       │ 1:N            │ 1:N       │ 1:N           │                      │                  │
│       ▼                ▼           ▼               ▼                      ▼                  │
│  ┌────────────┐ ┌─────────────┐ ┌─────────────────────┐  ┌──────────────────────┐           │
│  │lead_status │ │ lead_assign │ │ lead_interactions   │  │  lead_follow_ups    │            │
│  │  _log      │ │ ment_log    │ │                     │  │                     │            │
│  └────────────┘ └─────────────┘ └─────────────────────┘  └─────────────────────┘            │
│                                                                                             │
│  ┌──────────────┐                                                                           │
│  │ lead_sources │  (facebook, google, walk_in, referral, ...)                               │
│  └──────────────┘                                                                           │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  SCHEMA: marketing                                          │
│                                                                                             │
│  ┌──────────────────────┐  ┌──────────────────┐                                             │
│  │ marketing_platforms  │  │ campaign_statuses│                                             │
│  └──────────┬───────────┘  └────────┬─────────┘                                             │
│             │                       │                                                       │
│             ▼                       ▼                                                       │
│  ┌──────────────────────────────────────────────┐                                           │
│  │              ad_campaigns                    │                                           │
│  │  FK → org, platform, status                  │                                           │
│  └──────────────────────────────────────────────┘                                           │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   SCHEMA: audit                                             │
│                                                                                             │
│  ┌──────────────────────────┐  ┌──────────────────┐  ┌──────────────┐                       │
│  │ marketing_leads_history  │  │    audit_log     │  │  activities  │                       │
│  │ (field-level diff for    │  │ (generic for all │  │ (fire-and-   │                       │
│  │  crm.marketing_leads)    │  │  other tables)   │  │  forget log) │                       │
│  └──────────────────────────┘  └──────────────────┘  └──────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    SCHEMA: ext                                              │
│                                                                                             │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────────┐              │
│  │ meta_org_config  │     │   meta_leads     │◄────│ meta_lead_custom_fields │              │
│  │ (per-org creds)  │     │ (raw Meta data)  │ 1:N └──────────────────────────┘              │
│  └──────────────────┘     └────────┬─────────┘                                              │
│                                    │                                                        │
│                                    ▼                                                        │
│                           ┌────────────────────────┐                                        │
│                           │ meta_capi_outbound_logs│                                        │
│                           │ (CAPI event audit)     │                                        │
│                           └────────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schemas

| Schema      | Purpose                                         |
| ----------- | ----------------------------------------------- |
| `public`    | UUIDv7 generator, utility trigger functions      |
| `geo`       | Geographic lookup tables (countries/states/cities) |
| `entity`    | Tenant, organization, branch, and related lookups |
| `iam`       | Users, roles, org mappings, token blocklist       |
| `crm`       | Leads, interactions, follow-ups, stage pipeline   |
| `marketing` | Ad campaigns, platforms, statuses                |
| `audit`     | Audit logs, lead history, activity log           |
| `ext`       | External integrations (Meta Lead Ads / CAPI)     |

---

## Database Roles

| Role              | Type         | RLS       | Purpose                                      |
| ----------------- | ------------ | --------- | --------------------------------------------- |
| `app_user`        | NOLOGIN      | Subject   | Standard app role — DML on operational tables |
| `tenant_admin`    | NOLOGIN      | Subject   | Cross-org admin within a tenant               |
| `crm_service`     | LOGIN        | BYPASSRLS | Service superuser — unrestricted DML          |
| `lead_svc`        | LOGIN        | via app_user | Leads microservice                        |
| `campaign_svc`    | LOGIN        | via app_user | Campaign management service               |
| `user_mgmt_svc`   | LOGIN        | via app_user | User management service                   |
| `notif_svc`       | LOGIN        | via app_user | Notifications service                     |
| `intake_svc`      | LOGIN        | via app_user | Lead intake / webhook service              |
| `meta_svc`        | LOGIN        | via app_user | Meta Conversion API service               |
| `tenant_dash_svc` | LOGIN        | via tenant_admin | Tenant dashboard service              |
| `analytics_svc`   | LOGIN        | BYPASSRLS | Read-only analytics (SELECT only)          |

---

## Table Details

### geo.countries

Geographic country lookup. Integer identity PK.

| Column      | Type      | Constraints          |
| ----------- | --------- | -------------------- |
| id          | SMALLINT  | PK, GENERATED ALWAYS |
| name        | TEXT      | NOT NULL, UNIQUE     |
| iso_code    | CHAR(2)   | NOT NULL, UNIQUE     |
| description | TEXT      |                      |

---

### geo.states

| Column      | Type      | Constraints                            |
| ----------- | --------- | -------------------------------------- |
| id          | SMALLINT  | PK, GENERATED ALWAYS                   |
| country_id  | SMALLINT  | NOT NULL, FK → geo.countries(id)       |
| name        | TEXT      | NOT NULL                               |
| code        | TEXT      |                                        |
| description | TEXT      |                                        |

**Unique:** `(country_id, name)`

---

### geo.cities

| Column      | Type      | Constraints                       |
| ----------- | --------- | --------------------------------- |
| id          | INTEGER   | PK, GENERATED ALWAYS              |
| state_id    | SMALLINT  | NOT NULL, FK → geo.states(id)     |
| name        | TEXT      | NOT NULL                          |
| description | TEXT      |                                   |

**Unique:** `(state_id, name)`

---

### entity.tenant_domains

Classifies tenants by industry vertical.

| Column      | Type | Constraints      |
| ----------- | ---- | ---------------- |
| id          | UUID | PK (UUIDv7)      |
| name        | TEXT | NOT NULL, UNIQUE |
| description | TEXT |                  |

**Seed values:** fitness, retail, healthcare, education, hospitality, medical, real_estate, automotive, logistics

---

### entity.tenant_plan_types

Subscription tiers.

| Column      | Type | Constraints      |
| ----------- | ---- | ---------------- |
| id          | UUID | PK (UUIDv7)      |
| name        | TEXT | NOT NULL, UNIQUE |
| description | TEXT |                  |

**Seed values:** free_trial, starter, growth, enterprise

---

### entity.org_types

Classification of organization locations.

| Column      | Type | Constraints      |
| ----------- | ---- | ---------------- |
| id          | UUID | PK (UUIDv7)      |
| name        | TEXT | NOT NULL, UNIQUE |
| description | TEXT |                  |

**Seed values:** gym_location, boutique, branch, headquarters, franchise, clinic, warehouse, showroom, head_office

---

### entity.tenants

Top-level tenant entity (SaaS customer).

| Column       | Type        | Constraints                              |
| ------------ | ----------- | ---------------------------------------- |
| id           | UUID        | PK (UUIDv7)                              |
| name         | TEXT        | NOT NULL, UNIQUE                         |
| domain_id    | UUID        | FK → entity.tenant_domains(id)           |
| plan_type_id | UUID        | FK → entity.tenant_plan_types(id)        |
| is_active    | BOOLEAN     | NOT NULL, DEFAULT TRUE                   |
| is_deleted   | BOOLEAN     | NOT NULL, DEFAULT FALSE                  |
| deleted_at   | TIMESTAMPTZ |                                          |
| deleted_by   | UUID        |                                          |
| metadata     | JSONB       | NOT NULL, DEFAULT '{}'                   |
| created_at   | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()      |
| updated_at   | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()      |

**Check:** `NOT (is_active AND is_deleted)`  
**RLS:** tenant sees only own row via `app.current_tenant_id`  
**Triggers:** `set_updated_at`, `soft_delete_row`

---

### entity.organizations

Business unit / location within a tenant.

| Column            | Type        | Constraints                                |
| ----------------- | ----------- | ------------------------------------------ |
| id                | UUID        | PK (UUIDv7)                                |
| tenant_id         | UUID        | NOT NULL, FK → entity.tenants(id)          |
| name              | TEXT        | NOT NULL                                   |
| legal_entity_name | TEXT        |                                            |
| brand_name        | TEXT        |                                            |
| org_type_id       | UUID        | FK → entity.org_types(id)                  |
| address_line1     | TEXT        |                                            |
| address_line2     | TEXT        |                                            |
| landmark          | TEXT        |                                            |
| pincode           | TEXT        |                                            |
| city              | TEXT        | Free-text city                             |
| city_id           | INTEGER     | FK → geo.cities(id)                        |
| state_id          | SMALLINT    | FK → geo.states(id)                        |
| country_id        | SMALLINT    | FK → geo.countries(id)                     |
| timezone          | TEXT        | NOT NULL, DEFAULT 'Asia/Kolkata'           |
| is_active         | BOOLEAN     | NOT NULL, DEFAULT TRUE                     |
| is_deleted        | BOOLEAN     | NOT NULL, DEFAULT FALSE                    |
| deleted_at        | TIMESTAMPTZ |                                            |
| deleted_by        | UUID        |                                            |
| metadata          | JSONB       | NOT NULL, DEFAULT '{}'                     |
| created_at        | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()        |
| updated_at        | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()        |

**Unique:** `(tenant_id, name)`  
**Check:** `NOT (is_active AND is_deleted)`  
**RLS:** app_user sees orgs they are mapped to; tenant_admin sees all within tenant  
**Triggers:** `set_updated_at`, `soft_delete_row`, `auto_grant_tenant_admins_on_new_org`

---

### entity.branches

Physical branch within an organization.

| Column     | Type        | Constraints                                  |
| ---------- | ----------- | -------------------------------------------- |
| id         | UUID        | PK (UUIDv7)                                  |
| org_id     | UUID        | NOT NULL, FK → entity.organizations(id)      |
| name       | TEXT        | NOT NULL                                     |
| is_active  | BOOLEAN     | NOT NULL, DEFAULT TRUE                       |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()          |

**Unique:** `(org_id, name)`  
**RLS:** app_user sees branches of mapped orgs; tenant_admin sees all within tenant

---

### iam.user_roles

Role definitions with rank-based hierarchy.

| Column      | Type | Constraints                       |
| ----------- | ---- | --------------------------------- |
| id          | UUID | PK (UUIDv7)                       |
| name        | TEXT | NOT NULL, UNIQUE                  |
| label       | TEXT | NOT NULL                          |
| description | TEXT |                                   |
| rank        | INT  | NOT NULL, DEFAULT 0 (range 0-100) |

**Seed values (by rank):**

| rank | name                     | label                   |
| ---- | ------------------------ | ----------------------- |
| 0    | read_only                | Read Only               |
| 20   | sales_representative     | Sales Representative    |
| 40   | senior_sales_executive   | Senior Sales Executive  |
| 60   | org_manager              | Manager                 |
| 70   | org_sr_manager           | Senior Manager          |
| 80   | org_admin                | Admin                   |
| 90   | tenant_admin             | Tenant Admin            |
| 100  | super_admin              | Super Admin             |

---

### iam.users

User accounts. `full_name` is a GENERATED STORED column.

| Column                | Type        | Constraints                                |
| --------------------- | ----------- | ------------------------------------------ |
| id                    | UUID        | PK (UUIDv7)                                |
| org_id                | UUID        | NOT NULL, FK → entity.organizations(id)    |
| first_name            | TEXT        | NOT NULL                                   |
| middle_name           | TEXT        |                                            |
| last_name             | TEXT        | NOT NULL, DEFAULT ''                       |
| full_name             | TEXT        | GENERATED ALWAYS AS STORED (computed)      |
| email                 | TEXT        | NOT NULL, UNIQUE                           |
| mobile                | TEXT        |                                            |
| password_hash         | TEXT        | NOT NULL                                   |
| role_id               | UUID        | NOT NULL, FK → iam.user_roles(id)          |
| manager_id            | UUID        | FK → iam.users(id), self-referential       |
| is_active             | BOOLEAN     | NOT NULL, DEFAULT TRUE                     |
| is_deleted            | BOOLEAN     | NOT NULL, DEFAULT FALSE                    |
| deleted_at            | TIMESTAMPTZ |                                            |
| deleted_by            | UUID        |                                            |
| created_by            | UUID        |                                            |
| force_password_change | BOOLEAN     | NOT NULL, DEFAULT TRUE                     |
| password_changed_at   | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()        |
| last_login_at         | TIMESTAMPTZ |                                            |
| created_at            | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()        |
| updated_at            | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()        |

**Checks:** `id <> manager_id`, `NOT (is_active AND is_deleted)`  
**RLS:** app_user sees users with active mapping to current org; tenant_admin sees all within tenant  
**Triggers:** `set_updated_at`, `soft_delete_row`, `set_org_id`, `set_created_by`, `check_user_hierarchy_no_cycle`, `audit_row_changes`

---

### iam.user_org_mapping

Multi-org access control. Source of truth for which orgs a user can access.

| Column     | Type        | Constraints                              |
| ---------- | ----------- | ---------------------------------------- |
| user_id    | UUID        | NOT NULL, FK → iam.users(id), PK (composite) |
| org_id     | UUID        | NOT NULL, FK → entity.organizations(id), PK (composite) |
| role_id    | UUID        | NOT NULL, FK → iam.user_roles(id)        |
| is_active  | BOOLEAN     | NOT NULL, DEFAULT TRUE                   |
| granted_by | UUID        | FK → iam.users(id)                       |
| granted_at | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()      |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()      |

**PK:** `(user_id, org_id)`  
**RLS:** Users can read own rows; org admins (rank >= 80) manage within their org; tenant_admin manages across tenant  
**Triggers:** `set_updated_at`, `auto_grant_all_orgs_on_tenant_admin`

---

### iam.token_blocklist

DB-backed JWT revocation supporting multiple scope levels.

| Column     | Type        | Constraints                                  |
| ---------- | ----------- | -------------------------------------------- |
| id         | UUID        | PK (UUIDv7)                                  |
| jti        | TEXT        | Unique (partial, WHERE NOT NULL)             |
| user_id    | UUID        | FK → iam.users(id)                           |
| org_id     | UUID        | FK → entity.organizations(id)               |
| tenant_id  | UUID        |                                              |
| revoked_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()                      |
| revoked_by | UUID        | FK → iam.users(id)                           |
| reason     | TEXT        |                                              |
| expires_at | TIMESTAMPTZ | NOT NULL                                     |

**Check:** At least one of jti, user_id, org_id, tenant_id must be non-null

---

### crm.lead_stage

Pipeline stages for leads.

| Column            | Type    | Constraints      |
| ----------------- | ------- | ---------------- |
| id                | UUID    | PK (UUIDv7)      |
| name              | TEXT    | NOT NULL, UNIQUE |
| label             | TEXT    | NOT NULL         |
| description       | TEXT    |                  |
| sort_order        | INT     | NOT NULL, DEFAULT 0 |
| followup_required | BOOLEAN | NOT NULL, DEFAULT FALSE |
| is_rejected       | BOOLEAN | NOT NULL, DEFAULT FALSE |
| is_terminated     | BOOLEAN | NOT NULL, DEFAULT FALSE |

**Seed values:**

| sort | name             | followup_required | is_rejected | is_terminated |
| ---- | ---------------- | ----------------- | ----------- | ------------- |
| 1    | new              | false             | false       | false         |
| 2    | contacting       | true              | false       | false         |
| 3    | qualified        | true              | false       | false         |
| 4    | converted        | false             | false       | true          |
| 5    | unqualified      | false             | true        | true          |
| 6    | transferred_out  | false             | false       | true          |

---

### crm.lead_stage_outcome

Outcome options per stage.

| Column           | Type    | Constraints                               |
| ---------------- | ------- | ----------------------------------------- |
| id               | UUID    | PK (UUIDv7)                               |
| stage_id         | UUID    | NOT NULL, FK → crm.lead_stage(id)         |
| name             | TEXT    | NOT NULL                                  |
| label            | TEXT    | NOT NULL                                  |
| description      | TEXT    |                                           |
| requires_comment | BOOLEAN | NOT NULL, DEFAULT FALSE                   |
| sort_order       | INT     | NOT NULL, DEFAULT 0                       |

**Unique:** `(stage_id, name)`

**Seed values by stage:**
- **contacting:** not_connected, switch_off, not_answered, call_back_later
- **qualified:** visit_scheduled, visited
- **converted:** membership_sold
- **unqualified:** no_response_after_multiple_attempts, wrong_number, job_applicant, budget_issue, not_interested, location_issue, duplicate_lead, other (requires_comment)
- **transferred_out:** transferred_to_other_branch

---

### crm.interaction_types

| Column      | Type | Constraints      |
| ----------- | ---- | ---------------- |
| id          | UUID | PK (UUIDv7)      |
| name        | TEXT | NOT NULL, UNIQUE |
| description | TEXT |                  |

**Seed values:** call, whatsapp, email, sms, in_person, video_call, chat, internal_note

---

### crm.follow_up_statuses

| Column      | Type | Constraints      |
| ----------- | ---- | ---------------- |
| id          | UUID | PK (UUIDv7)      |
| name        | TEXT | NOT NULL, UNIQUE |
| label       | TEXT | NOT NULL         |
| description | TEXT |                  |

**Seed values:** pending, completed, missed, rescheduled

---

### crm.lead_sources

| Column | Type | Constraints      |
| ------ | ---- | ---------------- |
| id     | UUID | PK (UUIDv7)      |
| name   | TEXT | NOT NULL, UNIQUE |

**Seed values:** facebook, google, instagram, whatsapp, website_form, referral, walk_in, cold_call, other

---

### crm.marketing_leads

Core lead entity. `full_name` is GENERATED STORED.

| Column            | Type        | Constraints                                  |
| ----------------- | ----------- | -------------------------------------------- |
| id                | UUID        | PK (UUIDv7)                                  |
| org_id            | UUID        | NOT NULL, FK → entity.organizations(id)      |
| first_name        | TEXT        | NOT NULL                                     |
| middle_name       | TEXT        |                                              |
| last_name         | TEXT        | NOT NULL, DEFAULT ''                         |
| full_name         | TEXT        | GENERATED ALWAYS AS STORED                   |
| phone             | TEXT        |                                              |
| email             | TEXT        |                                              |
| address_line1     | TEXT        |                                              |
| address_line2     | TEXT        |                                              |
| landmark          | TEXT        |                                              |
| pincode           | TEXT        |                                              |
| city              | TEXT        | Free-text city                               |
| city_id           | INTEGER     | FK → geo.cities(id)                          |
| state_id          | SMALLINT    | FK → geo.states(id)                          |
| country_id        | SMALLINT    | FK → geo.countries(id)                       |
| stage_id          | UUID        | FK → crm.lead_stage(id)                      |
| outcome_id        | UUID        | FK → crm.lead_stage_outcome(id)              |
| outcome_comment   | TEXT        |                                              |
| campaign_id       | UUID        | FK → marketing.ad_campaigns(id)              |
| source_id         | UUID        | FK → crm.lead_sources(id)                    |
| branch_id         | UUID        | FK → entity.branches(id)                     |
| assigned_user_id  | UUID        | FK → iam.users(id)                           |
| duplicate_lead_id | UUID        | FK → crm.marketing_leads(id), self-ref       |
| raw_webhook_data  | JSONB       | NOT NULL, DEFAULT '{}'                       |
| metadata          | JSONB       | NOT NULL, DEFAULT '{}'                       |
| tags              | TEXT[]      | NOT NULL, DEFAULT '{}'                       |
| is_deleted        | BOOLEAN     | NOT NULL, DEFAULT FALSE                      |
| deleted_at        | TIMESTAMPTZ |                                              |
| deleted_by        | UUID        |                                              |
| created_by        | UUID        |                                              |
| created_at        | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()          |
| updated_at        | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()          |

**Unique indexes (partial):** `(org_id, phone) WHERE phone IS NOT NULL AND NOT is_deleted`, `(org_id, email) WHERE email IS NOT NULL AND NOT is_deleted`  
**RLS:** org-scoped for app_user; tenant-scoped for tenant_admin  
**Triggers:** `set_updated_at`, `soft_delete_row`, `set_org_id`, `set_created_by`, `check_lead_stage_outcome`, `check_lead_fk_org_scope`, `log_lead_assignment`, `log_lead_stage_change`, `audit_marketing_leads_changes`

---

### crm.lead_interactions

Append-only interaction log (no updated_at).

| Column              | Type        | Constraints                                  |
| ------------------- | ----------- | -------------------------------------------- |
| id                  | UUID        | PK (UUIDv7)                                  |
| org_id              | UUID        | NOT NULL, FK → entity.organizations(id)      |
| lead_id             | UUID        | NOT NULL, FK → crm.marketing_leads(id)       |
| user_id             | UUID        | NOT NULL, FK → iam.users(id)                 |
| interaction_type_id | UUID        | FK → crm.interaction_types(id)               |
| notes               | TEXT        |                                              |
| duration_seconds    | INT         |                                              |
| occurred_at         | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()          |
| is_deleted          | BOOLEAN     | NOT NULL, DEFAULT FALSE                      |
| deleted_at          | TIMESTAMPTZ |                                              |
| deleted_by          | UUID        |                                              |
| created_by          | UUID        |                                              |
| created_at          | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()          |

**RLS:** org + tenant isolation  
**Triggers:** `soft_delete_row`, `set_org_id`, `set_created_by`, `check_interaction_fk_org_scope`, `audit_row_changes`

---

### crm.lead_follow_ups

Scheduled follow-up tasks.

| Column           | Type        | Constraints                                  |
| ---------------- | ----------- | -------------------------------------------- |
| id               | UUID        | PK (UUIDv7)                                  |
| org_id           | UUID        | NOT NULL, FK → entity.organizations(id)      |
| lead_id          | UUID        | NOT NULL, FK → crm.marketing_leads(id)       |
| assigned_user_id | UUID        | NOT NULL, FK → iam.users(id)                 |
| status_id        | UUID        | NOT NULL, FK → crm.follow_up_statuses(id)    |
| scheduled_at     | TIMESTAMPTZ | NOT NULL                                     |
| completed_at     | TIMESTAMPTZ |                                              |
| notes            | TEXT        |                                              |
| is_deleted       | BOOLEAN     | NOT NULL, DEFAULT FALSE                      |
| deleted_at       | TIMESTAMPTZ |                                              |
| deleted_by       | UUID        |                                              |
| created_by       | UUID        |                                              |
| created_at       | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()          |
| updated_at       | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()          |

**RLS:** org + tenant isolation  
**Triggers:** `set_updated_at`, `soft_delete_row`, `set_org_id`, `set_created_by`, `check_follow_up_completion`, `check_follow_up_fk_org_scope`, `set_default_follow_up_status`, `sync_follow_up_status`, `audit_row_changes`

---

### crm.lead_assignment_log

Immutable log of lead assignment changes. Auto-populated by trigger.

| Column               | Type        | Constraints                                 |
| -------------------- | ----------- | ------------------------------------------- |
| id                   | UUID        | PK (UUIDv7)                                 |
| org_id               | UUID        | NOT NULL, FK → entity.organizations(id)     |
| lead_id              | UUID        | NOT NULL, FK → crm.marketing_leads(id)      |
| assigned_by_id       | UUID        | FK → iam.users(id)                          |
| assigned_to_id       | UUID        | FK → iam.users(id)                          |
| previous_assignee_id | UUID        | FK → iam.users(id)                          |
| action               | TEXT        | NOT NULL, DEFAULT 'reassigned'              |
| note                 | TEXT        |                                             |
| assigned_at          | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()         |

**Action values:** initial, reassigned, unassigned, self_assigned, bulk_assigned  
**RLS:** org + tenant isolation (SELECT only for non-service roles)

---

### crm.lead_status_log

Immutable stage/outcome transition log. Written by trigger.

| Column           | Type        | Constraints                                  |
| ---------------- | ----------- | -------------------------------------------- |
| id               | UUID        | PK (UUIDv7)                                  |
| org_id           | UUID        | NOT NULL, FK → entity.organizations(id)      |
| lead_id          | UUID        | NOT NULL, FK → crm.marketing_leads(id)       |
| changed_by_id    | UUID        | FK → iam.users(id)                           |
| old_stage_id     | UUID        | FK → crm.lead_stage(id)                      |
| new_stage_id     | UUID        | NOT NULL, FK → crm.lead_stage(id)            |
| old_outcome_id   | UUID        | FK → crm.lead_stage_outcome(id)              |
| new_outcome_id   | UUID        | FK → crm.lead_stage_outcome(id)              |
| assigned_user_id | UUID        | FK → iam.users(id)                           |
| transition_note  | TEXT        |                                              |
| changed_at       | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()          |

**RLS:** SELECT-only for app_user + tenant_admin

---

### marketing.marketing_platforms

| Column      | Type | Constraints      |
| ----------- | ---- | ---------------- |
| id          | UUID | PK (UUIDv7)      |
| name        | TEXT | NOT NULL, UNIQUE |
| description | TEXT |                  |

**Seed values:** facebook, google, instagram, youtube, whatsapp, linkedin, tiktok, organic, referral, whatsapp_ads

---

### marketing.campaign_statuses

| Column      | Type | Constraints      |
| ----------- | ---- | ---------------- |
| id          | UUID | PK (UUIDv7)      |
| name        | TEXT | NOT NULL, UNIQUE |
| description | TEXT |                  |

**Seed values:** draft, active, paused, completed, archived

---

### marketing.ad_campaigns

| Column     | Type         | Constraints                                     |
| ---------- | ------------ | ----------------------------------------------- |
| id         | UUID         | PK (UUIDv7)                                     |
| org_id     | UUID         | NOT NULL, FK → entity.organizations(id)         |
| name       | TEXT         | NOT NULL                                        |
| platform_id| UUID         | NOT NULL, FK → marketing.marketing_platforms(id) |
| status_id  | UUID         | NOT NULL, FK → marketing.campaign_statuses(id)   |
| budget     | NUMERIC(12,2)|                                                  |
| started_at | TIMESTAMPTZ  |                                                  |
| ended_at   | TIMESTAMPTZ  |                                                  |
| is_deleted | BOOLEAN      | NOT NULL, DEFAULT FALSE                          |
| deleted_at | TIMESTAMPTZ  |                                                  |
| deleted_by | UUID         |                                                  |
| created_by | UUID         |                                                  |
| created_at | TIMESTAMPTZ  | NOT NULL, DEFAULT CLOCK_TIMESTAMP()              |
| updated_at | TIMESTAMPTZ  | NOT NULL, DEFAULT CLOCK_TIMESTAMP()              |

**Check:** `ended_at IS NULL OR started_at IS NULL OR started_at < ended_at`  
**RLS:** org + tenant isolation  
**Triggers:** `set_updated_at`, `soft_delete_row`, `set_org_id`, `set_created_by`, `audit_row_changes`

---

### audit.marketing_leads_history

Field-level diff audit for `crm.marketing_leads`. Written by trigger.

| Column             | Type        | Constraints                               |
| ------------------ | ----------- | ----------------------------------------- |
| id                 | UUID        | PK (UUIDv7)                               |
| lead_id            | UUID        | NOT NULL, FK → crm.marketing_leads(id)    |
| changed_by_user_id | UUID        | FK → iam.users(id)                        |
| operation          | CHAR(1)     | NOT NULL, CHECK IN ('I','U','D')          |
| changed_fields     | JSONB       | diff format: `{"field": {"old": v, "new": v}}` |
| changed_at         | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()       |

**RLS:** SELECT-only, org + tenant isolation via join to `crm.marketing_leads`

---

### audit.audit_log

Generic audit for all operational tables except `crm.marketing_leads`.

| Column         | Type        | Constraints                               |
| -------------- | ----------- | ----------------------------------------- |
| id             | UUID        | PK (UUIDv7)                               |
| table_name     | TEXT        | NOT NULL                                  |
| operation      | CHAR(1)     | NOT NULL, CHECK IN ('U','D')              |
| record_id      | UUID        |                                           |
| changed_by     | UUID        |                                           |
| changed_fields | JSONB       |                                           |
| old_data       | JSONB       |                                           |
| new_data       | JSONB       |                                           |
| org_id         | UUID        |                                           |
| changed_at     | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()       |

**RLS:** SELECT-only, org + tenant isolation

---

### audit.activities

Fire-and-forget activity log.

| Column       | Type        | Constraints                            |
| ------------ | ----------- | -------------------------------------- |
| id           | UUID        | PK (UUIDv7)                            |
| action_type  | TEXT        | NOT NULL                               |
| performed_by | UUID        | FK → iam.users(id)                     |
| target_id    | UUID        |                                        |
| target_type  | TEXT        |                                        |
| org_id       | UUID        | FK → entity.organizations(id)          |
| meta         | JSONB       |                                        |
| created_at   | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP()    |

**RLS:** SELECT-only, org + tenant isolation

---

### ext.meta_org_config

Per-org Meta Lead Ads credentials and CAPI configuration.

| Column              | Type        | Constraints                               |
| ------------------- | ----------- | ----------------------------------------- |
| id                  | UUID        | PK (UUIDv7)                               |
| org_id              | UUID        | NOT NULL, FK → entity.organizations(id)   |
| app_secret          | TEXT        | NOT NULL                                  |
| verify_token        | TEXT        | NOT NULL                                  |
| pixel_id            | TEXT        | NOT NULL                                  |
| access_token        | TEXT        | NOT NULL                                  |
| graph_api_version   | TEXT        | NOT NULL, DEFAULT 'v21.0'                 |
| is_active           | BOOLEAN     | NOT NULL, DEFAULT TRUE                    |
| capi_trigger_stages | UUID[]      | NOT NULL, DEFAULT '{}'                    |
| created_at          | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()                   |
| updated_at          | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()                   |

**Unique:** `(org_id)`  
**RLS:** org + tenant isolation

---

### ext.meta_leads

Raw Meta lead data linked to CRM marketing leads.

| Column            | Type        | Constraints                                |
| ----------------- | ----------- | ------------------------------------------ |
| id                | UUID        | PK (UUIDv7)                                |
| org_id            | UUID        | NOT NULL, FK → entity.organizations(id)    |
| marketing_lead_id | UUID        | FK → crm.marketing_leads(id)               |
| meta_lead_id      | BIGINT      | NOT NULL, UNIQUE                           |
| form_id           | BIGINT      | NOT NULL                                   |
| campaign_id       | BIGINT      |                                            |
| adset_id          | BIGINT      |                                            |
| ad_id             | BIGINT      |                                            |
| platform          | TEXT        | CHECK IN ('fb', 'ig')                      |
| lead_created_at   | TIMESTAMPTZ | NOT NULL                                   |
| full_name         | TEXT        |                                            |
| first_name        | TEXT        |                                            |
| last_name         | TEXT        |                                            |
| email             | TEXT        |                                            |
| phone             | TEXT        |                                            |
| whatsapp_number   | TEXT        |                                            |
| raw_field_data    | JSONB       |                                            |
| created_at        | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()                    |

**RLS:** org + tenant isolation

---

### ext.meta_lead_custom_fields

Unmapped form fields from Meta lead forms (1:many from `ext.meta_leads`).

| Column         | Type | Constraints                              |
| -------------- | ---- | ---------------------------------------- |
| id             | UUID | PK (UUIDv7)                              |
| meta_lead_id   | UUID | NOT NULL, FK → ext.meta_leads(id)        |
| org_id         | UUID | NOT NULL, FK → entity.organizations(id)  |
| question_key   | TEXT | NOT NULL                                 |
| question_value | TEXT |                                          |

**Unique:** `(meta_lead_id, question_key)`  
**RLS:** org + tenant isolation

---

### ext.meta_capi_outbound_logs

Outbound Meta Conversion API event audit trail.

| Column               | Type        | Constraints                                   |
| -------------------- | ----------- | --------------------------------------------- |
| id                   | UUID        | PK (UUIDv7)                                   |
| org_id               | UUID        | NOT NULL, FK → entity.organizations(id)       |
| marketing_lead_id    | UUID        | NOT NULL, FK → crm.marketing_leads(id)        |
| meta_lead_id         | UUID        | FK → ext.meta_leads(id)                       |
| event_name           | TEXT        | NOT NULL                                      |
| event_id             | TEXT        | NOT NULL                                      |
| delivery_status      | TEXT        | NOT NULL, CHECK IN ('SUCCESS','FAILED','PENDING') |
| fb_trace_id          | TEXT        |                                               |
| request_payload      | JSONB       | NOT NULL                                      |
| response_payload     | JSONB       |                                               |
| triggered_by         | TEXT        | NOT NULL, CHECK IN ('auto_stage_change','manual') |
| triggered_by_user_id | UUID        |                                               |
| sent_at              | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()                       |

**Unique (partial):** `(marketing_lead_id, event_name) WHERE delivery_status = 'SUCCESS'`  
**RLS:** org + tenant isolation

---

### public.schema_versions

Schema migration tracking.

| Column      | Type        | Constraints                         |
| ----------- | ----------- | ----------------------------------- |
| version     | TEXT        | PK                                  |
| description | TEXT        |                                     |
| applied_at  | TIMESTAMPTZ | NOT NULL, DEFAULT CLOCK_TIMESTAMP() |

---

## Views

| View                                         | Schema    | security_invoker | Purpose                                                    |
| -------------------------------------------- | --------- | ---------------- | ---------------------------------------------------------- |
| `crm.vw_dashboard_leads`                     | crm       | yes              | Primary lead listing with resolved FKs                     |
| `crm.vw_lead_followup_timeline`              | crm       | yes              | Unified timeline: status + follow-ups + interactions + assignments |
| `crm.vw_lead_assignment_timeline`            | crm       | yes              | Assignment history with held-for duration                  |
| `crm.vw_sales_follow_up_pipeline`            | crm       | yes              | Follow-up queue (pending + missed only)                    |
| `crm.vw_followup_pipeline_enriched`          | crm       | yes              | Enriched pipeline with overdue flag + last interaction     |
| `crm.vw_org_performance_snapshot`            | crm       | yes              | Per-org KPIs for analytics                                 |
| `crm.vw_tenant_full_dashboard`               | crm       | yes              | Cross-org tenant KPIs by stage                             |
| `crm.vw_rep_performance`                     | crm       | yes              | Per-rep lead counts by stage (leaderboard)                 |
| `iam.vw_user_org_chart`                      | iam       | yes              | Recursive org chart with depth + breadcrumb path           |
| `iam.vw_user_team_members`                   | iam       | yes              | Recursive subtree membership for hierarchy authority       |
| `iam.vw_user_org_access`                     | iam       | yes              | Active org-user mappings with role context                 |
| `entity.vw_branch_lookup`                    | entity    | yes              | Branches with org and tenant context                       |
| `marketing.vw_campaign_lookup`               | marketing | yes              | Campaigns with resolved platform/status                    |
| `marketing.vw_tenant_campaign_summary`       | marketing | yes              | Campaign performance by tenant                             |
| `ext.view_meta_leads_complete`               | ext       | yes              | Meta leads joined to CRM marketing_leads                   |

---

## Key Business-Rule Triggers

| Trigger                          | Table                     | Event                    | Behavior                                                          |
| -------------------------------- | ------------------------- | ------------------------ | ----------------------------------------------------------------- |
| `trg_lead_stage_outcome_check`   | crm.marketing_leads       | INSERT/UPDATE            | Enforces outcome ↔ stage consistency; validates requires_comment   |
| `trg_follow_up_completion_check` | crm.lead_follow_ups       | INSERT/UPDATE            | Enforces completed_at ↔ status='completed' invariant              |
| `trg_marketing_leads_fk_scope`   | crm.marketing_leads       | INSERT/UPDATE            | Validates campaign + assigned_user belong to same org              |
| `trg_lead_interactions_fk_scope` | crm.lead_interactions     | INSERT/UPDATE            | Validates lead + user belong to same org                           |
| `trg_lead_follow_ups_fk_scope`   | crm.lead_follow_ups       | INSERT/UPDATE            | Validates lead + assigned_user belong to same org                  |
| `trg_lead_assignment_log`        | crm.marketing_leads       | AFTER UPDATE             | Logs assignment changes to crm.lead_assignment_log                 |
| `trg_lead_stage_log`             | crm.marketing_leads       | AFTER INSERT/UPDATE      | Logs stage transitions to crm.lead_status_log                      |
| `trg_marketing_leads_audit`      | crm.marketing_leads       | AFTER UPDATE/DELETE      | Field-level diff → audit.marketing_leads_history                   |
| `trg_user_hierarchy_no_cycle`    | iam.users                 | INSERT/UPDATE            | Prevents circular manager chains                                   |
| `trg_follow_ups_default_status`  | crm.lead_follow_ups       | BEFORE INSERT            | Sets status to 'pending' when not supplied                         |
| `trg_follow_ups_sync_status`     | crm.lead_follow_ups       | BEFORE UPDATE            | Auto-transitions status when completed_at is set/cleared           |
| `trg_auto_grant_*`              | entity.organizations / iam.user_org_mapping | AFTER INSERT | Auto-grants tenant_admin access to all orgs in tenant |

---

## Utility Functions

| Function                                 | Schema | Purpose                                                |
| ---------------------------------------- | ------ | ------------------------------------------------------ |
| `public.gen_uuidv7()`                    | public | RFC 9562 UUIDv7 generator (time-ordered)               |
| `public.set_updated_at()`                | public | Trigger: auto-update `updated_at`                      |
| `public.soft_delete_row()`               | public | Trigger: converts DELETE to soft-delete                |
| `public.set_created_by()`                | public | Trigger: auto-populates `created_by` from session GUC  |
| `public.set_org_id()`                    | public | Trigger: auto-populates `org_id` from session GUC      |
| `iam.can_assign_to(UUID,UUID,UUID)`      | iam    | Checks if acting user has authority to assign to target |
| `iam.fn_user_active_orgs(UUID)`          | iam    | Returns array of org UUIDs a user has active access to  |
| `iam.fn_org_active_users(UUID)`          | iam    | Returns array of user UUIDs with active access to org   |
| `iam.fn_user_org_rank(UUID,UUID)`        | iam    | Returns user's role rank in a specific org              |
| `iam.purge_expired_token_blocklist()`    | iam    | Cleanup: removes expired token blocklist entries        |

---

## Session GUCs (set per-request by API layer)

| GUC                          | Purpose                                     |
| ---------------------------- | ------------------------------------------- |
| `app.current_user_id`        | Acting user's UUID (used by triggers + RLS) |
| `app.current_org_id`         | Current org context (RLS org isolation)      |
| `app.current_tenant_id`      | Current tenant context (RLS tenant isolation)|
| `app.lead_transition_note`   | Free-text note for lead stage transitions   |

---

## RLS Policy Summary

Every operational table enforces two tiers of isolation:

1. **`org_isolation_policy`** — `app_user` sees only rows matching `app.current_org_id`
2. **`tenant_isolation_policy`** — `tenant_admin` sees rows across all orgs within `app.current_tenant_id`

`crm_service` and `analytics_svc` bypass RLS entirely (`BYPASSRLS`).

Audit tables (`lead_status_log`, `lead_assignment_log`, `audit_log`, `marketing_leads_history`, `activities`) are **SELECT-only** for non-service roles — writes happen exclusively via SECURITY DEFINER trigger functions.
