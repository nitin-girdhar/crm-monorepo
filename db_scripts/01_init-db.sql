--drop database crm_v2 (force)
--create database crm_v2
-- ===================================================================
-- CRM Monorepo — Merged Production Schema
-- Combines: monorepo UUID-based design + EXISTING_WORKING_CODE features
-- UUID PKs for all operational/lookup tables
-- SMALLINT/INTEGER PKs for geographic tables (countries/states/cities)
-- Idempotent: safe to re-run (IF NOT EXISTS, ON CONFLICT DO NOTHING)
-- ===================================================================


-- ── Schema version tracking ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_versions (
  version     TEXT        PRIMARY KEY,
  description TEXT,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP()
);
INSERT INTO schema_versions (version, description) VALUES
  ('1.0.0', 'Merged monorepo + EXISTING_WORKING_CODE: geo tables, soft-delete, business-rule triggers, audit triggers, service logins'),
  ('1.1.0', 'user_org_mapping table, legal_entity_name/brand_name on organizations, fixed multi-org RLS gaps')
ON CONFLICT (version) DO NOTHING;

-- ── Extensions ─────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_bytes() used by gen_uuidv7()
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS "vector"';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pgvector not available (%). AI embedding features disabled.', SQLERRM;
END;
$$;

-- ── UUIDv7 generator (RFC 9562 §5.7) ──────────────────────────────
-- Time-ordered UUIDs: 48-bit ms timestamp prefix eliminates the
-- random-insert B-tree fragmentation caused by gen_uuidv7() (v4).
-- Works on PostgreSQL 14+ with no extensions required.
CREATE OR REPLACE FUNCTION gen_uuidv7() RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
  v_millis BIGINT;
  v_bytes  BYTEA;
  v_hex    TEXT;
BEGIN
  v_millis := (EXTRACT(EPOCH FROM CLOCK_TIMESTAMP()) * 1000)::BIGINT;
  v_bytes  := gen_random_bytes(10);
  v_hex :=
    -- 48-bit unix_ts_ms: high 32 bits (8 hex) + low 16 bits (4 hex)
    lpad(to_hex(v_millis >> 16), 8, '0') ||
    lpad(to_hex(v_millis & 65535), 4, '0') ||
    -- version nibble (7) + 12-bit rand_a
    '7' ||
    lpad(to_hex(((get_byte(v_bytes, 0) & 15) << 8) | get_byte(v_bytes, 1)), 3, '0') ||
    -- variant bits (10xxxxxx) + rand_b
    lpad(to_hex((get_byte(v_bytes, 2) & 63) | 128), 2, '0') ||
    lpad(to_hex(get_byte(v_bytes, 3)), 2, '0') ||
    encode(substring(v_bytes from 5 for 6), 'hex');
  RETURN (
    substring(v_hex, 1, 8)  || '-' ||
    substring(v_hex, 9, 4)  || '-' ||
    substring(v_hex, 13, 4) || '-' ||
    substring(v_hex, 17, 4) || '-' ||
    substring(v_hex, 21, 12)
  )::UUID;
END; $$;

-- ── Roles (idempotent) ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOINHERIT;
  ELSE
    ALTER ROLE app_user NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenant_admin') THEN
    CREATE ROLE tenant_admin NOLOGIN NOINHERIT;
  ELSE
    ALTER ROLE tenant_admin NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_service') THEN
    CREATE ROLE crm_service WITH LOGIN PASSWORD 'CrmSvc_Dev2025' BYPASSRLS;
  ELSE
    ALTER ROLE crm_service WITH LOGIN PASSWORD 'CrmSvc_Dev2025' BYPASSRLS;
  END IF;
END $$;

-- ===================================================================
-- GEOGRAPHIC LOOKUP TABLES
-- SMALLINT/INTEGER PKs (GENERATED ALWAYS AS IDENTITY) — high-cardinality
-- safe with SMALLINT for countries/states; INTEGER for cities.
-- ===================================================================

CREATE TABLE IF NOT EXISTS countries (
  id       SMALLINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name     TEXT     NOT NULL UNIQUE,
  iso_code CHAR(2)  NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS states (
  id         SMALLINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  country_id SMALLINT NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
  name       TEXT     NOT NULL,
  code       TEXT,
  description TEXT,
  CONSTRAINT uq_states_country_name UNIQUE (country_id, name)
);

CREATE TABLE IF NOT EXISTS cities (
  id          INTEGER  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  state_id    SMALLINT NOT NULL REFERENCES states(id) ON DELETE RESTRICT,
  name        TEXT     NOT NULL,
  description TEXT,
  CONSTRAINT uq_cities_state_name UNIQUE (state_id, name)
);

-- ── Geographic seed data ────────────────────────────────────────────
INSERT INTO countries (name, iso_code) VALUES
  ('India',                'IN'),
  ('United States',        'US'),
  ('United Kingdom',       'GB'),
  ('United Arab Emirates', 'AE')
ON CONFLICT (name) DO NOTHING;

INSERT INTO states (country_id, name, code)
SELECT c.id, s.name, s.code
FROM countries c
CROSS JOIN (VALUES
  ('Delhi',           'DL'),
  ('Maharashtra',     'MH'),
  ('Karnataka',       'KA'),
  ('Tamil Nadu',      'TN'),
  ('West Bengal',     'WB'),
  ('Telangana',       'TS'),
  ('Rajasthan',       'RJ'),
  ('Gujarat',         'GJ'),
  ('Uttar Pradesh',   'UP'),
  ('Haryana',         'HR'),
  ('Punjab',          'PB'),
  ('Madhya Pradesh',  'MP')
) AS s(name, code)
WHERE c.iso_code = 'IN'
ON CONFLICT (country_id, name) DO NOTHING;

INSERT INTO cities (state_id, name)
SELECT s.id, c.name
FROM states s
CROSS JOIN (VALUES
  ('Delhi',         'New Delhi'),
  ('Delhi',         'Dwarka'),
  ('Delhi',         'Rohini'),
  ('Delhi',         'Lajpat Nagar'),
  ('Delhi',         'Connaught Place'),
  ('Delhi',         'Saket'),
  ('Delhi',         'Janakpuri'),
  ('Uttar Pradesh', 'Lucknow'),
  ('Uttar Pradesh', 'Noida'),
  ('Uttar Pradesh', 'Agra'),
  ('Haryana',       'Gurgaon'),
  ('Haryana',       'Faridabad'),
  ('Punjab',        'Chandigarh'),
  ('Punjab',        'Amritsar')
) AS c(state_name, name)
WHERE s.name = c.state_name
ON CONFLICT (state_id, name) DO NOTHING;

-- ===================================================================
-- OPERATIONAL LOOKUP TABLES  (UUID PKs)
-- ===================================================================

CREATE TABLE IF NOT EXISTS user_roles (
  id          UUID     PRIMARY KEY DEFAULT gen_uuidv7(),
  name        TEXT     NOT NULL UNIQUE,
  label       TEXT     NOT NULL,
  description TEXT,
  rank        INT      NOT NULL DEFAULT 0
                       CONSTRAINT chk_user_roles_rank CHECK (rank >= 0 AND rank <= 100)
);
INSERT INTO user_roles (name, label, description, rank) VALUES
  ('read_only',               'Read Only',              'Read-only viewer — dashboards and reports only',                                    0),
  ('sales_representative',    'Sales Representative',   'Front-line sales — manages own assigned leads and follow-ups',                     20),
  ('senior_sales_executive',  'Senior Sales Executive', 'Senior Sales Executive — manages a team of sales reps; reports to org_manager',    40),
  ('org_manager',             'Manager',                'Manages a team of Senior Sales Executives and reps within an org',                 60),
  ('org_sr_manager',          'Senior Manager',         'Manages a team of managers and reps within an org',                               70),
  ('org_admin',               'Admin',                  'Org-level admin — full control within one org',                                   80),
  ('tenant_admin',            'Tenant Admin',           'Tenant-level admin — manages all orgs under the tenant',                          90),
  ('super_admin',             'Super Admin',            'Platform-level superuser — SaaS admin only',                                     100)
ON CONFLICT (name) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  rank        = EXCLUDED.rank;

CREATE TABLE IF NOT EXISTS lead_stage (
  id                UUID    PRIMARY KEY DEFAULT gen_uuidv7(),
  name              TEXT    NOT NULL UNIQUE,
  label             TEXT    NOT NULL,
  description       TEXT,
  sort_order        INT     NOT NULL DEFAULT 0,
  followup_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_rejected       BOOLEAN NOT NULL DEFAULT FALSE,
  is_terminated     BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO lead_stage (name, label, description, sort_order, followup_required, is_rejected, is_terminated) VALUES
  ('new',            'New',            'Lead just received — not yet contacted',                       1, FALSE, FALSE, FALSE),
  ('contacting',     'Contacting',     'Active outreach in progress — calls, WhatsApp, or email',      2, TRUE,  FALSE, FALSE),
  ('qualified',      'Qualified',      'Lead confirmed as a genuine prospect with intent and budget',  3, TRUE,  FALSE, FALSE),
  ('converted',      'Converted',      'Lead became a paying customer',                                4, FALSE, FALSE, TRUE),
  ('unqualified',    'Unqualified',    'Lead did not qualify — outcome and note must be recorded',     5, FALSE, TRUE,  TRUE),
  ('transferred_out','Transferred Out','Lead transferred to another org or partner',                   6, FALSE, FALSE, TRUE)
ON CONFLICT (name) DO UPDATE SET
  label             = EXCLUDED.label,
  description       = EXCLUDED.description,
  sort_order        = EXCLUDED.sort_order,
  followup_required = EXCLUDED.followup_required,
  is_rejected       = EXCLUDED.is_rejected,
  is_terminated     = EXCLUDED.is_terminated;

CREATE TABLE IF NOT EXISTS lead_stage_outcome (
  id               UUID    PRIMARY KEY DEFAULT gen_uuidv7(),
  stage_id         UUID    NOT NULL REFERENCES lead_stage(id) ON DELETE RESTRICT,
  name             TEXT    NOT NULL,
  label            TEXT    NOT NULL,
  description      TEXT,
  requires_comment BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order       INT     NOT NULL DEFAULT 0,
  CONSTRAINT uq_lead_stage_outcome_stage_name UNIQUE (stage_id, name)
);

-- Seed all outcomes using name subqueries (never hardcoded IDs)
DO $$
DECLARE
  v_contacting  UUID;
  v_qualified   UUID;
  v_converted   UUID;
  v_unqualified UUID;
  v_transferred UUID;
BEGIN
  SELECT id INTO v_contacting  FROM lead_stage WHERE name = 'contacting';
  SELECT id INTO v_qualified   FROM lead_stage WHERE name = 'qualified';
  SELECT id INTO v_converted   FROM lead_stage WHERE name = 'converted';
  SELECT id INTO v_unqualified FROM lead_stage WHERE name = 'unqualified';
  SELECT id INTO v_transferred FROM lead_stage WHERE name = 'transferred_out';

  -- contacting outcomes
  INSERT INTO lead_stage_outcome (stage_id, name, label, sort_order) VALUES
    (v_contacting, 'not_connected',   'Not Connected',   1),
    (v_contacting, 'switch_off',      'Switch Off',      2),
    (v_contacting, 'not_answered',    'Not Answered',    3),
    (v_contacting, 'call_back_later', 'Call Back Later', 4)
  ON CONFLICT (stage_id, name) DO NOTHING;

  -- qualified outcomes
  INSERT INTO lead_stage_outcome (stage_id, name, label, sort_order) VALUES
    (v_qualified, 'visit_scheduled', 'Visit Scheduled', 1),
    (v_qualified, 'visited',         'Visited',         2)
  ON CONFLICT (stage_id, name) DO NOTHING;

  -- converted outcomes
  INSERT INTO lead_stage_outcome (stage_id, name, label, sort_order) VALUES
    (v_converted, 'membership_sold', 'Membership Sold', 1)
  ON CONFLICT (stage_id, name) DO NOTHING;

  -- unqualified outcomes
  INSERT INTO lead_stage_outcome (stage_id, name, label, requires_comment, sort_order) VALUES
    (v_unqualified, 'no_response_after_multiple_attempts', 'No Response After Multiple Attempts', FALSE, 1),
    (v_unqualified, 'wrong_number',                        'Wrong Number',                        FALSE, 2),
    (v_unqualified, 'job_applicant',                       'Job Applicant',                       FALSE, 3),
    (v_unqualified, 'budget_issue',                        'Budget Issue',                        FALSE, 4),
    (v_unqualified, 'not_interested',                      'Not Interested',                      FALSE, 5),
    (v_unqualified, 'location_issue',                      'Location Issue',                      FALSE, 6),
    (v_unqualified, 'duplicate_lead',                      'Duplicate Lead',                      FALSE, 7),
    (v_unqualified, 'other',                               'Other',                               TRUE,  8)
  ON CONFLICT (stage_id, name) DO NOTHING;

  -- transferred_out outcomes
  INSERT INTO lead_stage_outcome (stage_id, name, label, sort_order) VALUES
    (v_transferred, 'transferred_to_other_branch', 'Transferred to Other Branch', 1)
  ON CONFLICT (stage_id, name) DO NOTHING;
END;
$$;

CREATE TABLE IF NOT EXISTS interaction_types (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);
INSERT INTO interaction_types (name, description) VALUES
  ('call',          'Outbound or inbound phone call'),
  ('whatsapp',      'WhatsApp message (text, audio, or media)'),
  ('email',         'Email sent or received'),
  ('sms',           'SMS or text message'),
  ('in_person',     'Face-to-face meeting at store, office, or event'),
  ('video_call',    'Video call via Zoom, Google Meet, WhatsApp Video, etc.'),
  ('chat',          'Live chat on website or social media platform'),
  ('internal_note', 'Internal note or annotation added by a team member')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS follow_up_statuses (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  name        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  description TEXT
);
INSERT INTO follow_up_statuses (name, label, description) VALUES
  ('pending',     'Pending',     'Follow-up scheduled and not yet actioned'),
  ('completed',   'Completed',   'Follow-up actioned within the scheduled window'),
  ('missed',      'Missed',      'Follow-up was not actioned before the scheduled time'),
  ('rescheduled', 'Rescheduled', 'Follow-up postponed to a new scheduled_at datetime')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS marketing_platforms (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);
INSERT INTO marketing_platforms (name, description) VALUES
  ('facebook',     'Facebook / Instagram Lead Ads and Campaigns'),
  ('google',       'Google Ads (Search, Display, Shopping, Performance Max)'),
  ('instagram',    'Instagram organic and paid posts'),
  ('youtube',      'YouTube video ads'),
  ('whatsapp',     'WhatsApp click-to-chat ads via Facebook Ads Manager'),
  ('linkedin',     'LinkedIn Lead Gen Forms and sponsored content'),
  ('tiktok',       'TikTok for Business lead generation'),
  ('organic',      'Walk-in, direct website, or offline enquiry with no paid source'),
  ('referral',     'Referred by an existing customer or partner'),
  ('whatsapp_ads', 'WhatsApp click-to-chat ads via Facebook Ads Manager (legacy alias)')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS campaign_statuses (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);
INSERT INTO campaign_statuses (name, description) VALUES
  ('draft',     'Campaign created but not yet submitted for review or activation'),
  ('active',    'Campaign is live and currently running'),
  ('paused',    'Campaign temporarily paused; can be resumed'),
  ('completed', 'Campaign ran its full duration and ended normally'),
  ('archived',  'Campaign permanently closed and moved to archive')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS org_types (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);
INSERT INTO org_types (name, description) VALUES
  ('gym_location', 'Physical gym or fitness centre location'),
  ('boutique',     'Boutique or small retail outlet'),
  ('branch',       'Standard branch office of a business'),
  ('headquarters', 'Corporate headquarters or registered office'),
  ('franchise',    'Franchise outlet operating under a licensor brand'),
  ('clinic',       'Medical or wellness clinic unit'),
  ('warehouse',    'Storage or fulfilment centre'),
  ('showroom',     'Product display and sales showroom'),
  ('head_office',  'Corporate headquarters or registered office (alias)')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_domains (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);
INSERT INTO tenant_domains (name, description) VALUES
  ('fitness',     'Gyms, fitness centres, yoga studios, personal training'),
  ('retail',      'Fashion boutiques, apparel, accessories, lifestyle stores'),
  ('healthcare',  'Clinics, hospitals, diagnostic centres, healthcare providers'),
  ('education',   'Schools, coaching centres, e-learning platforms'),
  ('hospitality', 'Hotels, resorts, restaurants, event venues'),
  ('medical',     'Medical practices and healthcare providers (alias for healthcare)'),
  ('real_estate', 'Property sales, rentals, property management'),
  ('automotive',  'Car dealerships, service centres, vehicle rentals'),
  ('logistics',   'Warehousing, freight, courier, supply chain')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_plan_types (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);
INSERT INTO tenant_plan_types (name, description) VALUES
  ('free_trial', 'Up to 3 users, 1 org, 100 leads — 30-day trial'),
  ('starter',    'Up to 10 users, 2 orgs, 1 000 leads/month'),
  ('growth',     'Up to 50 users, 10 orgs, 10 000 leads/month, AI scoring'),
  ('enterprise', 'Unlimited users and orgs, dedicated support, custom SLA')
ON CONFLICT (name) DO NOTHING;

-- Monorepo addition: source channel for organic / non-campaign leads
CREATE TABLE IF NOT EXISTS lead_sources (
  id   UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  name TEXT NOT NULL UNIQUE
);
INSERT INTO lead_sources (name) VALUES
  ('facebook'),('google'),('instagram'),('whatsapp'),('website_form'),
  ('referral'),('walk_in'),('cold_call'),('other')
ON CONFLICT (name) DO NOTHING;

-- ===================================================================
-- CORE TABLES
-- ===================================================================

-- ── Utility functions (needed before table triggers) ──────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := CLOCK_TIMESTAMP(); RETURN NEW; END; $$;

-- Converts a physical DELETE into a soft delete (UPDATE is_deleted=TRUE).
-- crm_service bypasses this and performs a real delete (GDPR/purge).
CREATE OR REPLACE FUNCTION soft_delete_row()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_user_id UUID;
BEGIN
  IF current_user = 'crm_service' THEN RETURN OLD; END IF;
  BEGIN
    v_user_id := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  EXECUTE format(
    'UPDATE %I.%I SET is_deleted = TRUE, deleted_at = CLOCK_TIMESTAMP(), deleted_by = $1 WHERE id = $2',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
  ) USING v_user_id, OLD.id;
  RETURN NULL;
END; $$;

-- Auto-populates created_by from app.current_user_id on INSERT.
CREATE OR REPLACE FUNCTION set_created_by()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_user_id UUID;
BEGIN
  IF NEW.created_by IS NULL THEN
    BEGIN
      v_user_id := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
    EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
    NEW.created_by := v_user_id;
  END IF;
  RETURN NEW;
END; $$;

-- Auto-populate org_id from session GUC when not provided explicitly.
CREATE OR REPLACE FUNCTION set_org_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_org TEXT;
BEGIN
  IF NEW.org_id IS NULL THEN
    v_org := current_setting('app.current_org_id', true);
    IF v_org IS NULL OR v_org = '' THEN
      RAISE EXCEPTION 'org_id is NULL and app.current_org_id GUC is not set';
    END IF;
    NEW.org_id := v_org::uuid;
  END IF;
  RETURN NEW;
END; $$;

-- ── TENANTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id           UUID    PRIMARY KEY DEFAULT gen_uuidv7(),
  name         TEXT    NOT NULL UNIQUE,
  domain_id    UUID    REFERENCES tenant_domains(id),
  plan_type_id UUID    REFERENCES tenant_plan_types(id),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at   TIMESTAMPTZ,
  deleted_by   UUID,
  metadata     JSONB   NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  CONSTRAINT chk_tenants_active_deleted CHECK (NOT (is_active AND is_deleted))
);

DROP TRIGGER IF EXISTS trg_tenants_updated_at   ON tenants;
CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tenants_soft_delete  ON tenants;
CREATE TRIGGER trg_tenants_soft_delete
  BEFORE DELETE ON tenants FOR EACH ROW EXECUTE FUNCTION soft_delete_row();

-- ── ORGANIZATIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id            UUID    PRIMARY KEY DEFAULT gen_uuidv7(),
  tenant_id     UUID    NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name               TEXT    NOT NULL,
  legal_entity_name  TEXT,
  brand_name         TEXT,
  org_type_id        UUID    REFERENCES org_types(id),
  address_line1 TEXT,
  address_line2 TEXT,
  landmark      TEXT,
  pincode       TEXT,
  -- free-text city (monorepo); structured FK city below for enriched queries
  city          TEXT,
  city_id       INTEGER  REFERENCES cities(id)    ON DELETE RESTRICT,
  state_id      SMALLINT REFERENCES states(id)    ON DELETE RESTRICT,
  country_id    SMALLINT REFERENCES countries(id) ON DELETE RESTRICT,
  timezone      TEXT    NOT NULL DEFAULT 'Asia/Kolkata',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID,
  metadata      JSONB   NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  CONSTRAINT uq_organizations_tenant_name  UNIQUE (tenant_id, name),
  CONSTRAINT chk_organizations_active_deleted CHECK (NOT (is_active AND is_deleted))
);

DROP TRIGGER IF EXISTS trg_organizations_updated_at  ON organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_organizations_soft_delete ON organizations;
CREATE TRIGGER trg_organizations_soft_delete
  BEFORE DELETE ON organizations FOR EACH ROW EXECUTE FUNCTION soft_delete_row();

-- ── USERS ─────────────────────────────────────────────────────────
-- full_name is GENERATED ALWAYS AS STORED — never insert it directly.
CREATE TABLE IF NOT EXISTS users (
  id                    UUID    PRIMARY KEY DEFAULT gen_uuidv7(),
  org_id                UUID    NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  first_name            TEXT    NOT NULL,
  middle_name           TEXT,
  last_name             TEXT    NOT NULL DEFAULT '',
  full_name             TEXT    GENERATED ALWAYS AS (
                          TRIM(first_name
                            || COALESCE(' ' || NULLIF(middle_name, ''), '')
                            || COALESCE(' ' || NULLIF(last_name,   ''), ''))
                        ) STORED,
  email                 TEXT    NOT NULL UNIQUE,
  mobile                TEXT,
  password_hash         TEXT    NOT NULL,
  role_id               UUID    NOT NULL REFERENCES user_roles(id) ON DELETE RESTRICT,
  -- self-referential adjacency list; NULL = top of hierarchy
  manager_id            UUID    REFERENCES users(id) ON DELETE SET NULL,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted            BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at            TIMESTAMPTZ,
  deleted_by            UUID,
  created_by            UUID,
  force_password_change BOOLEAN NOT NULL DEFAULT TRUE,
  password_changed_at   TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  last_login_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  CONSTRAINT chk_user_not_own_manager    CHECK (id <> manager_id),
  CONSTRAINT chk_users_active_deleted    CHECK (NOT (is_active AND is_deleted))
);

DROP TRIGGER IF EXISTS trg_users_updated_at       ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_users_soft_delete      ON users;
CREATE TRIGGER trg_users_soft_delete
  BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION soft_delete_row();

DROP TRIGGER IF EXISTS trg_00_users_set_org_id    ON users;
CREATE TRIGGER trg_00_users_set_org_id
  BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION set_org_id();

DROP TRIGGER IF EXISTS trg_01_users_set_created_by ON users;
CREATE TRIGGER trg_01_users_set_created_by
  BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION set_created_by();

-- ── BRANCHES (monorepo addition: physical branch within an org) ───
CREATE TABLE IF NOT EXISTS branches (
  id         UUID    PRIMARY KEY DEFAULT gen_uuidv7(),
  org_id     UUID    NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name       TEXT    NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  UNIQUE (org_id, name)
);

-- ── AD_CAMPAIGNS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id          UUID    PRIMARY KEY DEFAULT gen_uuidv7(),
  org_id      UUID    NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name        TEXT    NOT NULL,
  platform_id UUID    NOT NULL REFERENCES marketing_platforms(id) ON DELETE RESTRICT,
  status_id   UUID    NOT NULL REFERENCES campaign_statuses(id)   ON DELETE RESTRICT,
  budget      NUMERIC(12,2),
  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ,
  is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at  TIMESTAMPTZ,
  deleted_by  UUID,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  CONSTRAINT chk_campaign_dates
    CHECK (ended_at IS NULL OR started_at IS NULL OR started_at < ended_at)
);

DROP TRIGGER IF EXISTS trg_ad_campaigns_updated_at    ON ad_campaigns;
CREATE TRIGGER trg_ad_campaigns_updated_at
  BEFORE UPDATE ON ad_campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_ad_campaigns_soft_delete   ON ad_campaigns;
CREATE TRIGGER trg_ad_campaigns_soft_delete
  BEFORE DELETE ON ad_campaigns FOR EACH ROW EXECUTE FUNCTION soft_delete_row();

DROP TRIGGER IF EXISTS trg_00_ad_campaigns_set_org_id ON ad_campaigns;
CREATE TRIGGER trg_00_ad_campaigns_set_org_id
  BEFORE INSERT ON ad_campaigns FOR EACH ROW EXECUTE FUNCTION set_org_id();

DROP TRIGGER IF EXISTS trg_01_ad_campaigns_set_created_by ON ad_campaigns;
CREATE TRIGGER trg_01_ad_campaigns_set_created_by
  BEFORE INSERT ON ad_campaigns FOR EACH ROW EXECUTE FUNCTION set_created_by();

-- ── MARKETING_LEADS ───────────────────────────────────────────────
-- full_name is GENERATED ALWAYS AS STORED.
-- city TEXT = free-text (monorepo); city_id/state_id/country_id = structured FK (EXISTING).
-- duplicate_lead_id: walk-in dedup pointer to the oldest digital lead with same phone/email.
-- embedding column stub: uncomment after pgvector confirmed.
CREATE TABLE IF NOT EXISTS marketing_leads (
  id               UUID    PRIMARY KEY DEFAULT gen_uuidv7(),
  org_id           UUID    NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  first_name       TEXT    NOT NULL,
  middle_name      TEXT,
  last_name        TEXT    NOT NULL DEFAULT '',
  full_name        TEXT    GENERATED ALWAYS AS (
                     TRIM(first_name
                       || COALESCE(' ' || NULLIF(middle_name, ''), '')
                       || COALESCE(' ' || NULLIF(last_name,   ''), ''))
                   ) STORED,
  phone            TEXT,
  email            TEXT,
  -- address fields
  address_line1    TEXT,
  address_line2    TEXT,
  landmark         TEXT,
  pincode          TEXT,
  -- free-text city (backwards-compatible); structured FKs below
  city             TEXT,
  city_id          INTEGER  REFERENCES cities(id)    ON DELETE RESTRICT,
  state_id         SMALLINT REFERENCES states(id)    ON DELETE RESTRICT,
  country_id       SMALLINT REFERENCES countries(id) ON DELETE RESTRICT,
  -- CRM state
  stage_id         UUID    REFERENCES lead_stage(id)         ON DELETE RESTRICT,
  outcome_id       UUID    REFERENCES lead_stage_outcome(id)  ON DELETE RESTRICT,
  outcome_comment  TEXT,
  -- source tracking
  campaign_id      UUID    REFERENCES ad_campaigns(id) ON DELETE SET NULL,
  source_id        UUID    REFERENCES lead_sources(id),
  branch_id        UUID    REFERENCES branches(id),
  -- assignment
  assigned_user_id UUID    REFERENCES users(id) ON DELETE SET NULL,
  -- walk-in dedup
  duplicate_lead_id UUID   REFERENCES marketing_leads(id) ON DELETE SET NULL,
  -- raw/enrichment data
  raw_webhook_data JSONB   NOT NULL DEFAULT '{}',
  metadata         JSONB   NOT NULL DEFAULT '{}',
  tags             TEXT[]  NOT NULL DEFAULT '{}',
  -- embedding vector(1536), -- uncomment after pgvector confirmed
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ,
  deleted_by       UUID,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP()
);

COMMENT ON COLUMN marketing_leads.duplicate_lead_id IS
  'Set on walk-in leads when an existing campaign-sourced lead with the same phone/email exists. Points to the oldest matching digital lead in the same org.';

DROP TRIGGER IF EXISTS trg_marketing_leads_updated_at     ON marketing_leads;
CREATE TRIGGER trg_marketing_leads_updated_at
  BEFORE UPDATE ON marketing_leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_marketing_leads_soft_delete    ON marketing_leads;
CREATE TRIGGER trg_marketing_leads_soft_delete
  BEFORE DELETE ON marketing_leads FOR EACH ROW EXECUTE FUNCTION soft_delete_row();

DROP TRIGGER IF EXISTS trg_00_marketing_leads_set_org_id  ON marketing_leads;
CREATE TRIGGER trg_00_marketing_leads_set_org_id
  BEFORE INSERT ON marketing_leads FOR EACH ROW EXECUTE FUNCTION set_org_id();

DROP TRIGGER IF EXISTS trg_01_marketing_leads_set_created_by ON marketing_leads;
CREATE TRIGGER trg_01_marketing_leads_set_created_by
  BEFORE INSERT ON marketing_leads FOR EACH ROW EXECUTE FUNCTION set_created_by();

-- ── LEAD_INTERACTIONS ─────────────────────────────────────────────
-- Append-only log — no updated_at, no update trigger.
CREATE TABLE IF NOT EXISTS lead_interactions (
  id                  UUID    PRIMARY KEY DEFAULT gen_uuidv7(),
  org_id              UUID    NOT NULL REFERENCES organizations(id)   ON DELETE RESTRICT,
  lead_id             UUID    NOT NULL REFERENCES marketing_leads(id) ON DELETE CASCADE,
  user_id             UUID    NOT NULL REFERENCES users(id)           ON DELETE RESTRICT,
  interaction_type_id UUID    REFERENCES interaction_types(id)        ON DELETE RESTRICT,
  notes               TEXT,
  duration_seconds    INT,
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at          TIMESTAMPTZ,
  deleted_by          UUID,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP()
);

DROP TRIGGER IF EXISTS trg_lead_interactions_soft_delete        ON lead_interactions;
CREATE TRIGGER trg_lead_interactions_soft_delete
  BEFORE DELETE ON lead_interactions FOR EACH ROW EXECUTE FUNCTION soft_delete_row();

DROP TRIGGER IF EXISTS trg_00_lead_interactions_set_org_id      ON lead_interactions;
CREATE TRIGGER trg_00_lead_interactions_set_org_id
  BEFORE INSERT ON lead_interactions FOR EACH ROW EXECUTE FUNCTION set_org_id();

DROP TRIGGER IF EXISTS trg_01_lead_interactions_set_created_by  ON lead_interactions;
CREATE TRIGGER trg_01_lead_interactions_set_created_by
  BEFORE INSERT ON lead_interactions FOR EACH ROW EXECUTE FUNCTION set_created_by();

-- ── LEAD_FOLLOW_UPS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_follow_ups (
  id               UUID    PRIMARY KEY DEFAULT gen_uuidv7(),
  org_id           UUID    NOT NULL REFERENCES organizations(id)   ON DELETE RESTRICT,
  lead_id          UUID    NOT NULL REFERENCES marketing_leads(id) ON DELETE CASCADE,
  assigned_user_id UUID    NOT NULL REFERENCES users(id)           ON DELETE RESTRICT,
  status_id        UUID    NOT NULL REFERENCES follow_up_statuses(id) ON DELETE RESTRICT,
  scheduled_at     TIMESTAMPTZ NOT NULL,
  completed_at     TIMESTAMPTZ,
  notes            TEXT,
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ,
  deleted_by       UUID,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP()
);

DROP TRIGGER IF EXISTS trg_lead_follow_ups_updated_at        ON lead_follow_ups;
CREATE TRIGGER trg_lead_follow_ups_updated_at
  BEFORE UPDATE ON lead_follow_ups FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_lead_follow_ups_soft_delete       ON lead_follow_ups;
CREATE TRIGGER trg_lead_follow_ups_soft_delete
  BEFORE DELETE ON lead_follow_ups FOR EACH ROW EXECUTE FUNCTION soft_delete_row();

DROP TRIGGER IF EXISTS trg_00_lead_follow_ups_set_org_id     ON lead_follow_ups;
CREATE TRIGGER trg_00_lead_follow_ups_set_org_id
  BEFORE INSERT ON lead_follow_ups FOR EACH ROW EXECUTE FUNCTION set_org_id();

DROP TRIGGER IF EXISTS trg_01_lead_follow_ups_set_created_by ON lead_follow_ups;
CREATE TRIGGER trg_01_lead_follow_ups_set_created_by
  BEFORE INSERT ON lead_follow_ups FOR EACH ROW EXECUTE FUNCTION set_created_by();

-- ── LEAD_ASSIGNMENT_LOG ───────────────────────────────────────────
-- Populated automatically by trigger on marketing_leads.
CREATE TABLE IF NOT EXISTS lead_assignment_log (
  id                   UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  org_id               UUID NOT NULL REFERENCES organizations(id)   ON DELETE RESTRICT,
  lead_id              UUID NOT NULL REFERENCES marketing_leads(id) ON DELETE CASCADE,
  assigned_by_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  previous_assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action               TEXT NOT NULL DEFAULT 'reassigned'
                       CONSTRAINT chk_assignment_action CHECK (
                         action IN ('initial','reassigned','unassigned','self_assigned','bulk_assigned')
                       ),
  note                 TEXT,
  assigned_at          TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP()
);

-- ── ACTIVITIES ────────────────────────────────────────────────────
-- Fire-and-forget log written by activities-service.
CREATE TABLE IF NOT EXISTS activities (
  id           UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  action_type  TEXT NOT NULL,
  performed_by UUID REFERENCES users(id),
  target_id    UUID,
  target_type  TEXT,
  org_id       UUID REFERENCES organizations(id),
  meta         JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP()
);

-- ── LEAD_STATUS_LOG ───────────────────────────────────────────────
-- Immutable stage-transition log. Written by trigger only.
CREATE TABLE IF NOT EXISTS lead_status_log (
  id               UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  org_id           UUID NOT NULL REFERENCES organizations(id)   ON DELETE RESTRICT,
  lead_id          UUID NOT NULL REFERENCES marketing_leads(id) ON DELETE CASCADE,
  changed_by_id    UUID REFERENCES users(id)            ON DELETE SET NULL,
  old_stage_id     UUID REFERENCES lead_stage(id)       ON DELETE RESTRICT,
  new_stage_id     UUID NOT NULL REFERENCES lead_stage(id) ON DELETE RESTRICT,
  old_outcome_id   UUID REFERENCES lead_stage_outcome(id) ON DELETE RESTRICT,
  new_outcome_id   UUID REFERENCES lead_stage_outcome(id) ON DELETE RESTRICT,
  assigned_user_id UUID REFERENCES users(id)            ON DELETE SET NULL,
  transition_note  TEXT,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP()
);

CREATE INDEX IF NOT EXISTS idx_lead_status_log_lead_changed
  ON lead_status_log (org_id, lead_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_status_log_org_changed
  ON lead_status_log (org_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_status_log_changed_by
  ON lead_status_log (org_id, changed_by_id, changed_at DESC);

-- ── MARKETING_LEADS_HISTORY ───────────────────────────────────────
-- Dedicated audit table for marketing_leads field changes.
-- UPDATE: diff-style {"field": {"old": v, "new": v}}
-- DELETE: full to_jsonb(OLD) snapshot
CREATE TABLE IF NOT EXISTS marketing_leads_history (
  id                 UUID    PRIMARY KEY DEFAULT gen_uuidv7(),
  lead_id            UUID    NOT NULL REFERENCES marketing_leads(id) ON DELETE RESTRICT,
  changed_by_user_id UUID    REFERENCES users(id) ON DELETE SET NULL,
  operation          CHAR(1) NOT NULL CHECK (operation IN ('I','U','D')),
  changed_fields     JSONB,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP()
);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_history_lead_changed
  ON marketing_leads_history (lead_id, changed_at DESC);

-- ── AUDIT_LOG ─────────────────────────────────────────────────────
-- Generic audit for all operational tables except marketing_leads
-- (which has its own history table above).
-- Columns cover both the monorepo convention and EXISTING_WORKING_CODE convention.
CREATE TABLE IF NOT EXISTS audit_log (
  id             UUID        PRIMARY KEY DEFAULT gen_uuidv7(),
  table_name     TEXT        NOT NULL,
  operation      CHAR(1)     NOT NULL CHECK (operation IN ('U', 'D')),
  -- EXISTING_WORKING_CODE naming
  record_id      UUID,
  changed_by     UUID,
  changed_fields JSONB,
  -- monorepo naming (aliases of above; populated together for compatibility)
  row_id         UUID,
  actor_id       UUID        REFERENCES users(id),
  old_data       JSONB,
  new_data       JSONB,
  -- common
  org_id         UUID,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record
  ON audit_log (table_name, record_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_org_table
  ON audit_log (org_id, table_name, changed_at DESC)
  WHERE org_id IS NOT NULL;

-- ===================================================================
-- BUSINESS RULE TRIGGER FUNCTIONS
-- ===================================================================

-- Enforces outcome_id ↔ stage_id consistency on marketing_leads.
-- On stage change: auto-nulls outcome when new stage has no outcomes or
--   supplied outcome doesn't match the new stage.
-- Validates requires_comment when outcome.requires_comment = TRUE.
CREATE OR REPLACE FUNCTION check_lead_stage_outcome()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_outcome_stage_id  UUID;
  v_outcome_count     INT;
  v_requires_comment  BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    SELECT COUNT(*) INTO v_outcome_count
    FROM lead_stage_outcome WHERE stage_id = NEW.stage_id;

    IF v_outcome_count = 0 THEN
      NEW.outcome_id      := NULL;
      NEW.outcome_comment := NULL;
    ELSIF NEW.outcome_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM lead_stage_outcome
        WHERE id = NEW.outcome_id AND stage_id = NEW.stage_id
      ) THEN
        NEW.outcome_id      := NULL;
        NEW.outcome_comment := NULL;
      END IF;
    END IF;
  ELSIF NEW.outcome_id IS NOT NULL THEN
    SELECT stage_id INTO v_outcome_stage_id
    FROM lead_stage_outcome WHERE id = NEW.outcome_id;

    IF v_outcome_stage_id IS DISTINCT FROM NEW.stage_id THEN
      RAISE EXCEPTION
        'outcome_id % does not belong to stage_id %. Cross-stage outcome selection is not allowed.',
        NEW.outcome_id, NEW.stage_id;
    END IF;
  END IF;

  IF NEW.outcome_id IS NOT NULL THEN
    SELECT requires_comment INTO v_requires_comment
    FROM lead_stage_outcome WHERE id = NEW.outcome_id;

    IF v_requires_comment AND (NEW.outcome_comment IS NULL OR NEW.outcome_comment = '') THEN
      RAISE EXCEPTION
        'outcome_comment is required for this outcome (requires_comment = TRUE). Please provide a comment describing the reason.';
    END IF;
  ELSE
    NEW.outcome_comment := NULL;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lead_stage_outcome_check ON marketing_leads;
CREATE TRIGGER trg_lead_stage_outcome_check
  BEFORE INSERT OR UPDATE OF stage_id, outcome_id, outcome_comment ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION check_lead_stage_outcome();

-- Enforces completed_at ↔ status='completed' invariant on follow-ups.
CREATE OR REPLACE FUNCTION check_follow_up_completion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_status TEXT;
BEGIN
  SELECT name INTO v_status FROM follow_up_statuses WHERE id = NEW.status_id;
  IF v_status = 'completed' AND NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'completed_at must be set when follow_up status is ''completed''.';
  END IF;
  IF v_status <> 'completed' AND NEW.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'completed_at must be NULL when follow_up status is ''%'' (not ''completed'').', v_status;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_follow_up_completion_check ON lead_follow_ups;
CREATE TRIGGER trg_follow_up_completion_check
  BEFORE INSERT OR UPDATE OF status_id, completed_at ON lead_follow_ups
  FOR EACH ROW EXECUTE FUNCTION check_follow_up_completion();

-- Validates campaign_id and assigned_user_id belong to the same org as the lead.
CREATE OR REPLACE FUNCTION check_lead_fk_org_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.campaign_id IS NOT NULL THEN
    PERFORM 1 FROM ad_campaigns
    WHERE id = NEW.campaign_id AND org_id = NEW.org_id AND NOT is_deleted;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'campaign_id % does not belong to org % or has been deleted.', NEW.campaign_id, NEW.org_id;
    END IF;
  END IF;
  IF NEW.assigned_user_id IS NOT NULL THEN
    PERFORM 1 FROM users
    WHERE id = NEW.assigned_user_id AND org_id = NEW.org_id AND NOT is_deleted;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'assigned_user_id % does not belong to org % or has been deleted.', NEW.assigned_user_id, NEW.org_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_marketing_leads_fk_scope ON marketing_leads;
CREATE TRIGGER trg_marketing_leads_fk_scope
  BEFORE INSERT OR UPDATE OF org_id, campaign_id, assigned_user_id ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION check_lead_fk_org_scope();

-- Validates lead and user in an interaction share the same org.
CREATE OR REPLACE FUNCTION check_interaction_fk_org_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM marketing_leads
  WHERE id = NEW.lead_id AND org_id = NEW.org_id AND NOT is_deleted;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_id % does not belong to org % or has been deleted.', NEW.lead_id, NEW.org_id;
  END IF;
  PERFORM 1 FROM users
  WHERE id = NEW.user_id AND org_id = NEW.org_id AND NOT is_deleted;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_id % does not belong to org % or has been deleted.', NEW.user_id, NEW.org_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lead_interactions_fk_scope ON lead_interactions;
CREATE TRIGGER trg_lead_interactions_fk_scope
  BEFORE INSERT OR UPDATE OF org_id, lead_id, user_id ON lead_interactions
  FOR EACH ROW EXECUTE FUNCTION check_interaction_fk_org_scope();

-- Validates lead and assigned user in a follow-up share the same org.
CREATE OR REPLACE FUNCTION check_follow_up_fk_org_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM marketing_leads
  WHERE id = NEW.lead_id AND org_id = NEW.org_id AND NOT is_deleted;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_id % does not belong to org % or has been deleted.', NEW.lead_id, NEW.org_id;
  END IF;
  PERFORM 1 FROM users
  WHERE id = NEW.assigned_user_id AND org_id = NEW.org_id AND NOT is_deleted;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assigned_user_id % does not belong to org % or has been deleted.', NEW.assigned_user_id, NEW.org_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lead_follow_ups_fk_scope ON lead_follow_ups;
CREATE TRIGGER trg_lead_follow_ups_fk_scope
  BEFORE INSERT OR UPDATE OF org_id, lead_id, assigned_user_id ON lead_follow_ups
  FOR EACH ROW EXECUTE FUNCTION check_follow_up_fk_org_scope();

-- Set lead_follow_ups.status_id to 'pending' on INSERT when not supplied.
CREATE OR REPLACE FUNCTION set_default_follow_up_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status_id IS NULL THEN
    SELECT id INTO NEW.status_id FROM follow_up_statuses WHERE name = 'pending' LIMIT 1;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lead_follow_ups_default_status ON lead_follow_ups;
CREATE TRIGGER trg_lead_follow_ups_default_status
  BEFORE INSERT ON lead_follow_ups FOR EACH ROW EXECUTE FUNCTION set_default_follow_up_status();

-- Auto-transition status when completed_at is set or cleared.
CREATE OR REPLACE FUNCTION sync_follow_up_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    SELECT id INTO NEW.status_id FROM follow_up_statuses WHERE name = 'completed' LIMIT 1;
  ELSIF NEW.completed_at IS NULL AND OLD.completed_at IS NOT NULL THEN
    SELECT id INTO NEW.status_id FROM follow_up_statuses WHERE name = 'pending' LIMIT 1;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lead_follow_ups_sync_status ON lead_follow_ups;
CREATE TRIGGER trg_lead_follow_ups_sync_status
  BEFORE UPDATE OF completed_at ON lead_follow_ups
  FOR EACH ROW EXECUTE FUNCTION sync_follow_up_status();

-- ===================================================================
-- USER HIERARCHY FUNCTIONS & TRIGGERS
-- ===================================================================

-- Prevents circular manager_id chains (cycle detection).
CREATE OR REPLACE FUNCTION check_user_hierarchy_no_cycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_cursor  UUID;
  v_visited UUID[] := ARRAY[NEW.id];
BEGIN
  IF NEW.manager_id IS NULL THEN RETURN NEW; END IF;
  v_cursor := NEW.manager_id;
  LOOP
    IF v_cursor = ANY(v_visited) THEN
      RAISE EXCEPTION
        'Circular reporting chain detected: setting manager_id = % on user % would create a cycle. Chain visited: %',
        NEW.manager_id, NEW.id, v_visited;
    END IF;
    v_visited := v_visited || v_cursor;
    SELECT manager_id INTO v_cursor FROM users WHERE id = v_cursor;
    EXIT WHEN v_cursor IS NULL;
  END LOOP;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_user_hierarchy_no_cycle ON users;
CREATE TRIGGER trg_user_hierarchy_no_cycle
  BEFORE INSERT OR UPDATE OF manager_id ON users
  FOR EACH ROW EXECUTE FUNCTION check_user_hierarchy_no_cycle();

-- Write to lead_assignment_log whenever assigned_user_id changes.
-- SECURITY DEFINER: app_user has only SELECT on lead_assignment_log.
CREATE OR REPLACE FUNCTION log_lead_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actor  UUID;
  v_action TEXT;
BEGIN
  IF NEW.assigned_user_id IS NOT DISTINCT FROM OLD.assigned_user_id THEN RETURN NEW; END IF;
  BEGIN
    v_actor := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
  v_action := CASE
    WHEN OLD.assigned_user_id IS NULL AND NEW.assigned_user_id IS NOT NULL THEN 'initial'
    WHEN OLD.assigned_user_id IS NOT NULL AND NEW.assigned_user_id IS NULL  THEN 'unassigned'
    WHEN v_actor = NEW.assigned_user_id                                      THEN 'self_assigned'
    ELSE 'reassigned'
  END;
  INSERT INTO lead_assignment_log
    (org_id, lead_id, assigned_by_id, assigned_to_id, action, previous_assignee_id)
  VALUES
    (NEW.org_id, NEW.id, v_actor, NEW.assigned_user_id, v_action, OLD.assigned_user_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lead_assignment_log ON marketing_leads;
CREATE TRIGGER trg_lead_assignment_log
  AFTER UPDATE OF assigned_user_id ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION log_lead_assignment();

-- ===================================================================
-- ASSIGNMENT AUTHORITY FUNCTION
-- ===================================================================

-- Returns TRUE if acting user has authority to assign a lead to target user.
-- 3-param version: org_id, acting_user_id, target_user_id.
-- SECURITY DEFINER: reads users + vw_user_team_members regardless of calling role.
CREATE OR REPLACE FUNCTION can_assign_to(
  p_org_id         UUID,
  p_acting_user_id UUID,
  p_target_user_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role     TEXT;
  v_in_scope BOOLEAN;
BEGIN
  IF p_acting_user_id = p_target_user_id THEN RETURN TRUE; END IF;

  SELECT ur.name INTO v_role
  FROM users u JOIN user_roles ur ON ur.id = u.role_id
  WHERE u.id = p_acting_user_id AND u.org_id = p_org_id
    AND NOT u.is_deleted AND u.is_active;

  IF v_role IS NULL THEN RETURN FALSE; END IF;
  IF v_role IN ('super_admin','tenant_admin','org_admin') THEN RETURN TRUE; END IF;

  IF v_role IN ('org_manager','org_sr_manager','senior_sales_executive') THEN
    SELECT COUNT(*) > 0 INTO v_in_scope
    FROM vw_user_team_members
    WHERE manager_id = p_acting_user_id
      AND member_id  = p_target_user_id
      AND org_id     = p_org_id;
    RETURN COALESCE(v_in_scope, FALSE);
  END IF;

  RETURN FALSE;
END; $$;

-- ===================================================================
-- VIEWS
-- ===================================================================

-- Recursive org chart (depth + breadcrumb path).
CREATE OR REPLACE VIEW vw_user_org_chart AS
WITH RECURSIVE tree AS (
  SELECT u.id, u.org_id, u.first_name, u.middle_name, u.last_name, u.full_name, u.email,
         ur.name AS role_name, u.manager_id,
         NULL::UUID AS manager_id_resolved, NULL::TEXT AS manager_full_name,
         0 AS hierarchy_level,
         ARRAY[u.id] AS ancestor_ids,
         ARRAY[u.full_name]::TEXT[] AS path_names
  FROM users u JOIN user_roles ur ON ur.id = u.role_id
  WHERE u.manager_id IS NULL AND NOT u.is_deleted
  UNION ALL
  SELECT u.id, u.org_id, u.first_name, u.middle_name, u.last_name, u.full_name, u.email,
         ur.name AS role_name, u.manager_id,
         t.id AS manager_id_resolved, t.full_name AS manager_full_name,
         t.hierarchy_level + 1,
         t.ancestor_ids || u.id,
         t.path_names   || u.full_name
  FROM users u JOIN user_roles ur ON ur.id = u.role_id
  JOIN tree t ON t.id = u.manager_id
  WHERE NOT u.is_deleted AND NOT (u.id = ANY(t.ancestor_ids))
)
SELECT id AS user_id, org_id, first_name, middle_name, last_name, full_name, email,
       role_name, manager_id, manager_full_name, hierarchy_level,
       array_to_string(path_names, ' > ') AS reporting_path, ancestor_ids
FROM tree;

-- Recursive subtree membership — used by can_assign_to for hierarchy authority.
CREATE OR REPLACE VIEW vw_user_team_members AS
WITH RECURSIVE subtree AS (
  SELECT u.id AS manager_id, u.org_id, u.id AS member_id,
         u.full_name AS member_full_name, u.email AS member_email,
         ur.name AS member_role, u.manager_id AS direct_manager_id,
         0 AS depth, u.is_active, ARRAY[u.id] AS visited
  FROM users u JOIN user_roles ur ON ur.id = u.role_id WHERE NOT u.is_deleted
  UNION ALL
  SELECT s.manager_id, u.org_id, u.id AS member_id,
         u.full_name, u.email, ur.name AS member_role,
         u.manager_id AS direct_manager_id, s.depth + 1, u.is_active,
         s.visited || u.id
  FROM users u JOIN user_roles ur ON ur.id = u.role_id
  JOIN subtree s ON s.member_id = u.manager_id
  WHERE NOT u.is_deleted AND NOT (u.id = ANY(s.visited))
)
SELECT manager_id, org_id, member_id, member_full_name, member_email,
       member_role, direct_manager_id, depth, is_active
FROM subtree WHERE depth > 0;

-- Primary lead listing.
-- city = ml.city (free-text, always populated); city_name = from geographic FK (when available).
CREATE OR REPLACE VIEW vw_dashboard_leads WITH (security_invoker = true) AS
SELECT
  ml.id                AS lead_id,
  ml.org_id,
  o.name               AS org_name,
  ml.first_name,
  ml.middle_name,
  ml.last_name,
  ml.full_name,
  ml.phone,
  ml.email,
  ml.city,
  ci.name              AS city_name,
  st.name              AS state_name,
  co.name              AS country_name,
  ml.address_line1,
  ml.tags,
  ml.metadata,
  ls.name              AS stage,
  ls.label             AS stage_label,
  ls.followup_required,
  ls.is_rejected,
  ls.is_terminated,
  lso.name             AS outcome,
  lso.label            AS outcome_label,
  ml.outcome_comment,
  ml.stage_id,
  ml.outcome_id,
  ac.name              AS campaign_name,
  mp.name              AS platform,
  src.name             AS source,
  br.name              AS branch,
  u.full_name          AS assigned_rep_name,
  u.email              AS assigned_rep_email,
  ml.assigned_user_id,
  ml.campaign_id,
  ml.is_deleted,
  ml.created_at,
  ml.updated_at
FROM  marketing_leads     ml
JOIN  organizations        o    ON o.id    = ml.org_id
LEFT JOIN lead_stage       ls   ON ls.id   = ml.stage_id
LEFT JOIN lead_stage_outcome lso ON lso.id = ml.outcome_id
LEFT JOIN ad_campaigns     ac   ON ac.id   = ml.campaign_id
LEFT JOIN marketing_platforms mp ON mp.id  = ac.platform_id
LEFT JOIN users            u    ON u.id    = ml.assigned_user_id
LEFT JOIN lead_sources     src  ON src.id  = ml.source_id
LEFT JOIN branches         br   ON br.id   = ml.branch_id
LEFT JOIN cities           ci   ON ci.id   = ml.city_id
LEFT JOIN states           st   ON st.id   = ml.state_id
LEFT JOIN countries        co   ON co.id   = ml.country_id;

-- Unified lead timeline: status changes + follow-ups + interactions + assignment changes.
CREATE OR REPLACE VIEW vw_lead_followup_timeline WITH (security_invoker = true) AS
SELECT
  lsl.id AS event_id, lsl.org_id, lsl.lead_id,
  'status_change'     AS event_type,
  lsl.changed_at      AS event_at,
  cb.full_name AS actor_name, cb.email AS actor_email,
  os.name AS old_stage,  os.label AS old_stage_label,
  ns.name AS new_stage,  ns.label AS new_stage_label,
  ofr.name AS old_outcome, ofr.label AS old_outcome_label,
  nfr.name AS new_outcome, nfr.label AS new_outcome_label,
  au.full_name AS assigned_to_name,
  lsl.transition_note AS note,
  NULL::uuid          AS followup_id,
  NULL::text          AS followup_status,
  NULL::timestamptz   AS scheduled_at,
  NULL::timestamptz   AS completed_at,
  NULL::text          AS interaction_type
FROM lead_status_log lsl
LEFT JOIN users              cb  ON cb.id  = lsl.changed_by_id
LEFT JOIN lead_stage         os  ON os.id  = lsl.old_stage_id
JOIN  lead_stage             ns  ON ns.id  = lsl.new_stage_id
LEFT JOIN lead_stage_outcome ofr ON ofr.id = lsl.old_outcome_id
LEFT JOIN lead_stage_outcome nfr ON nfr.id = lsl.new_outcome_id
LEFT JOIN users              au  ON au.id  = lsl.assigned_user_id

UNION ALL

SELECT
  lf.id, lf.org_id, lf.lead_id,
  'follow_up',
  COALESCE(lf.completed_at, lf.scheduled_at),
  u.full_name, u.email,
  NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
  u.full_name, lf.notes,
  lf.id, fs.name, lf.scheduled_at, lf.completed_at, NULL
FROM lead_follow_ups lf
JOIN follow_up_statuses fs ON fs.id = lf.status_id
JOIN users u ON u.id = lf.assigned_user_id
WHERE NOT lf.is_deleted

UNION ALL

SELECT
  li.id, li.org_id, li.lead_id,
  'interaction',
  li.occurred_at,
  u.full_name, u.email,
  NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
  NULL, li.notes,
  NULL, NULL, NULL, NULL, it.name
FROM lead_interactions li
LEFT JOIN interaction_types it ON it.id = li.interaction_type_id
JOIN users u ON u.id = li.user_id
WHERE NOT li.is_deleted

UNION ALL

SELECT
  mlh.id, ml.org_id, mlh.lead_id,
  'assignment_change',
  mlh.changed_at,
  cu.full_name, cu.email,
  NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
  COALESCE(new_u.full_name, 'Unassigned'),
  CASE
    WHEN old_u.full_name IS NULL THEN 'Assigned to '    || COALESCE(new_u.full_name, 'unknown')
    WHEN new_u.full_name IS NULL THEN 'Unassigned from '|| old_u.full_name
    ELSE 'Reassigned from ' || old_u.full_name || ' to ' || COALESCE(new_u.full_name, 'unknown')
  END,
  NULL, NULL, NULL, NULL, NULL
FROM marketing_leads_history mlh
JOIN marketing_leads ml  ON ml.id   = mlh.lead_id
LEFT JOIN users cu       ON cu.id   = mlh.changed_by_user_id
LEFT JOIN users old_u    ON old_u.id = (mlh.changed_fields -> 'assigned_user_id' ->> 'old')::uuid
LEFT JOIN users new_u    ON new_u.id = (mlh.changed_fields -> 'assigned_user_id' ->> 'new')::uuid
WHERE mlh.operation = 'U' AND mlh.changed_fields ? 'assigned_user_id';

-- Assignment history for a lead (who held it, for how long).
CREATE OR REPLACE VIEW vw_lead_assignment_timeline AS
SELECT
  l.id AS log_id, l.org_id, l.lead_id, ml.full_name AS lead_full_name,
  actor.full_name  AS assigned_by_name,  actor.email  AS assigned_by_email,
  target.full_name AS assigned_to_name,  target.email AS assigned_to_email,
  prev.full_name   AS previous_assignee_name,
  l.action, l.note, l.assigned_at,
  LEAD(l.assigned_at) OVER (PARTITION BY l.lead_id ORDER BY l.assigned_at)
    - l.assigned_at AS held_for
FROM lead_assignment_log l
JOIN  marketing_leads ml  ON ml.id    = l.lead_id
LEFT JOIN users actor     ON actor.id  = l.assigned_by_id
LEFT JOIN users target    ON target.id = l.assigned_to_id
LEFT JOIN users prev      ON prev.id   = l.previous_assignee_id;

-- Follow-up queue: pending + missed only.
CREATE OR REPLACE VIEW vw_sales_follow_up_pipeline WITH (security_invoker = true) AS
SELECT
  lf.id AS follow_up_id, lf.org_id, o.name AS org_name,
  ml.full_name AS lead_full_name, ml.phone AS lead_phone, ml.email AS lead_email,
  u.full_name AS assigned_rep_name, u.email AS assigned_rep_email,
  fs.name AS status, lf.scheduled_at, lf.completed_at, lf.notes
FROM lead_follow_ups lf
JOIN marketing_leads     ml ON ml.id  = lf.lead_id
JOIN users               u  ON u.id   = lf.assigned_user_id
JOIN follow_up_statuses  fs ON fs.id  = lf.status_id
JOIN organizations       o  ON o.id   = lf.org_id
WHERE fs.name IN ('pending','missed');

-- Enriched follow-up pipeline with overdue flag + last interaction.
CREATE OR REPLACE VIEW vw_followup_pipeline_enriched WITH (security_invoker = true) AS
SELECT
  lf.id AS follow_up_id, lf.org_id, o.name AS org_name, lf.lead_id,
  ml.full_name AS lead_full_name, ml.phone AS lead_phone, ml.email AS lead_email,
  ls.name AS lead_stage, ls.label AS lead_stage_label, ml.tags AS lead_tags,
  u.id AS assigned_rep_id, u.full_name AS assigned_rep_name, u.email AS assigned_rep_email,
  fs.name AS follow_up_status, lf.scheduled_at, lf.completed_at, lf.notes, lf.created_at,
  (fs.name = 'pending' AND lf.scheduled_at < CLOCK_TIMESTAMP()) AS is_overdue,
  CASE WHEN fs.name = 'pending' AND lf.scheduled_at < CLOCK_TIMESTAMP()
       THEN EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - lf.scheduled_at))::INT / 60
       ELSE NULL END AS minutes_overdue,
  last_ix.occurred_at AS last_interaction_at,
  last_ix.type_name   AS last_interaction_type
FROM lead_follow_ups lf
JOIN marketing_leads     ml ON ml.id  = lf.lead_id
JOIN lead_stage          ls ON ls.id  = ml.stage_id
JOIN follow_up_statuses  fs ON fs.id  = lf.status_id
JOIN users               u  ON u.id   = lf.assigned_user_id
JOIN organizations       o  ON o.id   = lf.org_id
LEFT JOIN LATERAL (
  SELECT li.occurred_at, it.name AS type_name
  FROM lead_interactions li
  LEFT JOIN interaction_types it ON it.id = li.interaction_type_id
  WHERE li.lead_id = lf.lead_id AND NOT li.is_deleted
  ORDER BY li.occurred_at DESC LIMIT 1
) last_ix ON TRUE
WHERE NOT lf.is_deleted AND NOT ml.is_deleted AND fs.name IN ('pending','missed');

-- Per-org KPIs for analytics service.
CREATE OR REPLACE VIEW vw_org_performance_snapshot WITH (security_invoker = true) AS
WITH lead_counts AS (
  SELECT ml.org_id,
    COUNT(*)                                        AS total_leads,
    COUNT(*) FILTER (WHERE ls.name = 'converted')   AS converted_leads,
    COUNT(*) FILTER (WHERE ls.name = 'unqualified') AS unqualified_leads
  FROM marketing_leads ml JOIN lead_stage ls ON ls.id = ml.stage_id
  WHERE NOT ml.is_deleted GROUP BY ml.org_id
),
interaction_stats AS (
  SELECT org_id, COUNT(*) AS total_interactions, COUNT(DISTINCT lead_id) AS leads_with_interactions
  FROM lead_interactions WHERE NOT is_deleted GROUP BY org_id
),
follow_up_counts AS (
  SELECT lf.org_id,
    COUNT(*) FILTER (WHERE fs.name = 'pending') AS pending_follow_ups,
    COUNT(*) FILTER (WHERE fs.name = 'missed')  AS missed_follow_ups
  FROM lead_follow_ups lf JOIN follow_up_statuses fs ON fs.id = lf.status_id
  WHERE NOT lf.is_deleted GROUP BY lf.org_id
),
platform_usage AS (
  SELECT org_id, most_used_platform FROM (
    SELECT ac.org_id, mp.name AS most_used_platform, COUNT(ml.id) AS lead_count,
           ROW_NUMBER() OVER (PARTITION BY ac.org_id ORDER BY COUNT(ml.id) DESC) AS rn
    FROM ad_campaigns ac JOIN marketing_platforms mp ON mp.id = ac.platform_id
    LEFT JOIN marketing_leads ml ON ml.campaign_id = ac.id AND NOT ml.is_deleted
    WHERE NOT ac.is_deleted GROUP BY ac.org_id, mp.name
  ) r WHERE rn = 1
)
SELECT
  o.id AS org_id, o.name AS org_name, o.tenant_id,
  COALESCE(lc.total_leads,       0)::INT AS total_leads,
  COALESCE(lc.converted_leads,   0)::INT AS converted_leads,
  COALESCE(lc.unqualified_leads, 0)::INT AS unqualified_leads,
  CASE WHEN COALESCE(ist.leads_with_interactions,0) = 0 THEN 0::NUMERIC(5,2)
       ELSE ROUND(ist.total_interactions::NUMERIC / ist.leads_with_interactions, 2)
  END AS avg_interactions_per_lead,
  COALESCE(fc.pending_follow_ups, 0)::INT AS pending_follow_ups,
  COALESCE(fc.missed_follow_ups,  0)::INT AS missed_follow_ups,
  pu.most_used_platform,
  CLOCK_TIMESTAMP() AS snapshot_at
FROM organizations o
LEFT JOIN lead_counts lc ON lc.org_id = o.id
LEFT JOIN interaction_stats ist ON ist.org_id = o.id
LEFT JOIN follow_up_counts fc ON fc.org_id = o.id
LEFT JOIN platform_usage pu ON pu.org_id = o.id
WHERE NOT o.is_deleted;

-- Cross-org tenant KPIs (query as tenant_admin role).
CREATE OR REPLACE VIEW vw_tenant_full_dashboard WITH (security_invoker = true) AS
WITH org_leads AS (
  SELECT ml.org_id,
    COUNT(*)                                               AS total_leads,
    COUNT(*) FILTER (WHERE ls.name = 'new')               AS new_leads,
    COUNT(*) FILTER (WHERE ls.name = 'contacting')        AS contacting_leads,
    COUNT(*) FILTER (WHERE ls.name = 'qualified')         AS qualified_leads,
    COUNT(*) FILTER (WHERE ls.name = 'converted')         AS converted_leads,
    COUNT(*) FILTER (WHERE ls.name = 'unqualified')       AS unqualified_leads,
    COUNT(*) FILTER (WHERE ls.name = 'transferred_out')   AS transferred_out_leads
  FROM marketing_leads ml JOIN lead_stage ls ON ls.id = ml.stage_id
  WHERE NOT ml.is_deleted GROUP BY ml.org_id
),
org_follow_ups AS (
  SELECT lf.org_id,
    COUNT(*) FILTER (WHERE fs.name = 'pending')   AS pending_follow_ups,
    COUNT(*) FILTER (WHERE fs.name = 'missed')    AS missed_follow_ups,
    COUNT(*) FILTER (WHERE fs.name = 'completed') AS completed_follow_ups
  FROM lead_follow_ups lf JOIN follow_up_statuses fs ON fs.id = lf.status_id
  WHERE NOT lf.is_deleted GROUP BY lf.org_id
),
org_platform AS (
  SELECT org_id, most_used_platform FROM (
    SELECT ac.org_id, mp.name AS most_used_platform, COUNT(ml.id) AS cnt,
           ROW_NUMBER() OVER (PARTITION BY ac.org_id ORDER BY COUNT(ml.id) DESC) AS rn
    FROM ad_campaigns ac JOIN marketing_platforms mp ON mp.id = ac.platform_id
    LEFT JOIN marketing_leads ml ON ml.campaign_id = ac.id AND NOT ml.is_deleted
    WHERE NOT ac.is_deleted GROUP BY ac.org_id, mp.name
  ) r WHERE rn = 1
)
SELECT
  o.tenant_id, t.name AS tenant_name, o.id AS org_id, o.name AS org_name,
  ot.name AS org_type,
  o.city,
  ci.name AS city_name, st.name AS state_name,
  COALESCE(ol.total_leads,           0)::INT AS total_leads,
  COALESCE(ol.new_leads,             0)::INT AS new_leads,
  COALESCE(ol.contacting_leads,      0)::INT AS contacting_leads,
  COALESCE(ol.qualified_leads,       0)::INT AS qualified_leads,
  COALESCE(ol.converted_leads,       0)::INT AS converted_leads,
  COALESCE(ol.unqualified_leads,     0)::INT AS unqualified_leads,
  COALESCE(ol.transferred_out_leads, 0)::INT AS transferred_out_leads,
  CASE WHEN COALESCE(ol.total_leads, 0) = 0 THEN 0::NUMERIC(5,2)
       ELSE ROUND(ol.converted_leads::NUMERIC / ol.total_leads * 100, 2)
  END AS conversion_rate_pct,
  COALESCE(ofu.pending_follow_ups,   0)::INT AS pending_follow_ups,
  COALESCE(ofu.missed_follow_ups,    0)::INT AS missed_follow_ups,
  COALESCE(ofu.completed_follow_ups, 0)::INT AS completed_follow_ups,
  op.most_used_platform,
  CLOCK_TIMESTAMP() AS snapshot_at
FROM organizations o
JOIN tenants t ON t.id = o.tenant_id
LEFT JOIN org_types ot ON ot.id = o.org_type_id
LEFT JOIN cities    ci ON ci.id = o.city_id
LEFT JOIN states    st ON st.id = o.state_id
LEFT JOIN org_leads ol ON ol.org_id = o.id
LEFT JOIN org_follow_ups ofu ON ofu.org_id = o.id
LEFT JOIN org_platform   op  ON op.org_id  = o.id
WHERE NOT o.is_deleted AND NOT t.is_deleted;

-- Campaign performance (tenant_admin scope).
CREATE OR REPLACE VIEW vw_tenant_campaign_summary WITH (security_invoker = true) AS
WITH cls AS (
  SELECT sub.campaign_id,
    SUM(sub.stage_cnt)::INT AS total_leads,
    COALESCE(SUM(sub.stage_cnt) FILTER (WHERE ls.name = 'converted'), 0)::INT AS converted_leads,
    jsonb_object_agg(ls.name, sub.stage_cnt) AS leads_by_stage
  FROM (
    SELECT campaign_id, stage_id, COUNT(*) AS stage_cnt
    FROM marketing_leads WHERE campaign_id IS NOT NULL AND NOT is_deleted
    GROUP BY campaign_id, stage_id
  ) sub JOIN lead_stage ls ON ls.id = sub.stage_id GROUP BY sub.campaign_id
)
SELECT
  o.tenant_id, ac.org_id, o.name AS org_name,
  ac.id AS campaign_id, ac.name AS campaign_name,
  mp.name AS platform, cs.name AS campaign_status, ac.budget,
  COALESCE(cls.total_leads, 0)::INT AS total_leads,
  COALESCE(cls.leads_by_stage, '{}'::jsonb) AS leads_by_stage,
  CASE WHEN COALESCE(cls.total_leads, 0) = 0 THEN 0::NUMERIC(5,2)
       ELSE ROUND(COALESCE(cls.converted_leads,0)::NUMERIC / cls.total_leads * 100, 2)
  END AS conversion_rate
FROM ad_campaigns ac
JOIN organizations o ON o.id = ac.org_id
JOIN marketing_platforms mp ON mp.id = ac.platform_id
JOIN campaign_statuses cs ON cs.id = ac.status_id
LEFT JOIN cls ON cls.campaign_id = ac.id
WHERE NOT ac.is_deleted;

-- ===================================================================
-- AUDIT TRIGGER FUNCTIONS
-- ===================================================================

-- RLS on marketing_leads_history.
-- INSERT from the SECURITY DEFINER function bypasses RLS; SELECT is gated.
ALTER TABLE marketing_leads_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_leads_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS history_org_isolation    ON marketing_leads_history;
DROP POLICY IF EXISTS history_tenant_isolation ON marketing_leads_history;

CREATE POLICY history_org_isolation ON marketing_leads_history
  AS PERMISSIVE FOR SELECT TO app_user
  USING (EXISTS (
    SELECT 1 FROM marketing_leads ml
    WHERE ml.id = marketing_leads_history.lead_id
      AND ml.org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  ));

CREATE POLICY history_tenant_isolation ON marketing_leads_history
  AS PERMISSIVE FOR SELECT TO tenant_admin
  USING (EXISTS (
    SELECT 1 FROM marketing_leads ml
    JOIN organizations o ON o.id = ml.org_id
    WHERE ml.id = marketing_leads_history.lead_id
      AND o.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  ));

-- Audit trigger for marketing_leads (field-level diff on UPDATE, snapshot on DELETE).
-- SECURITY DEFINER: app_user has no INSERT on marketing_leads_history.
CREATE OR REPLACE FUNCTION audit_marketing_leads_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  k_skip CONSTANT TEXT[] := ARRAY['updated_at','created_at','id','deleted_at','deleted_by'];
  v_diff       JSONB := '{}';
  v_old_json   JSONB;
  v_new_json   JSONB;
  v_key        TEXT;
  v_old_val    JSONB;
  v_new_val    JSONB;
  v_changed_by UUID;
BEGIN
  BEGIN
    v_changed_by := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN v_changed_by := NULL; END;

  IF TG_OP = 'UPDATE' THEN
    v_old_json := to_jsonb(OLD);
    v_new_json := to_jsonb(NEW);
    FOR v_key, v_new_val IN SELECT key, value FROM jsonb_each(v_new_json) LOOP
      CONTINUE WHEN v_key = ANY(k_skip);
      v_old_val := v_old_json -> v_key;
      IF v_new_val IS DISTINCT FROM v_old_val THEN
        v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object('old', v_old_val, 'new', v_new_val));
      END IF;
    END LOOP;
    IF v_diff = '{}'::jsonb THEN RETURN NEW; END IF;
    INSERT INTO marketing_leads_history (lead_id, changed_by_user_id, operation, changed_fields)
    VALUES (NEW.id, v_changed_by, 'U', v_diff);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO marketing_leads_history (lead_id, changed_by_user_id, operation, changed_fields)
    VALUES (OLD.id, v_changed_by, 'D', to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_marketing_leads_audit ON marketing_leads;
CREATE TRIGGER trg_marketing_leads_audit
  AFTER UPDATE OR DELETE ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION audit_marketing_leads_changes();

-- RLS on audit_log.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation_policy    ON audit_log;
DROP POLICY IF EXISTS tenant_isolation_policy ON audit_log;

CREATE POLICY org_isolation_policy ON audit_log
  AS PERMISSIVE FOR SELECT TO app_user
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_policy ON audit_log
  AS PERMISSIVE FOR SELECT TO tenant_admin
  USING (org_id IN (
    SELECT id FROM organizations
    WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      AND NOT is_deleted
  ));

-- Generic audit trigger for all operational tables except marketing_leads.
-- SECURITY DEFINER: app_user has no INSERT on audit_log.
CREATE OR REPLACE FUNCTION audit_row_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  k_skip   CONSTANT TEXT[] := ARRAY['updated_at','created_at','id','deleted_at','deleted_by','created_by'];
  v_diff       JSONB := '{}';
  v_old_json   JSONB;
  v_new_json   JSONB;
  v_key        TEXT;
  v_old_val    JSONB;
  v_new_val    JSONB;
  v_changed_by UUID;
  v_record_id  UUID;
  v_org_id     UUID;
BEGIN
  BEGIN
    v_changed_by := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN v_changed_by := NULL; END;

  IF TG_OP = 'UPDATE' THEN
    v_old_json := to_jsonb(OLD);
    v_new_json := to_jsonb(NEW);
    FOR v_key, v_new_val IN SELECT key, value FROM jsonb_each(v_new_json) LOOP
      CONTINUE WHEN v_key = ANY(k_skip);
      v_old_val := v_old_json -> v_key;
      IF v_new_val IS DISTINCT FROM v_old_val THEN
        v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object('old', v_old_val, 'new', v_new_val));
      END IF;
    END LOOP;
    IF v_diff = '{}'::jsonb THEN RETURN NEW; END IF;
    v_record_id := (to_jsonb(NEW) ->> 'id')::uuid;
    v_org_id    := NULLIF(to_jsonb(NEW) ->> 'org_id', '')::uuid;
    INSERT INTO audit_log (table_name, operation, record_id, row_id, org_id, changed_by, actor_id, changed_fields, old_data, new_data)
    VALUES (TG_TABLE_NAME, 'U', v_record_id, v_record_id, v_org_id, v_changed_by, v_changed_by, v_diff, v_old_json, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_json  := to_jsonb(OLD);
    v_record_id := (v_old_json ->> 'id')::uuid;
    v_org_id    := NULLIF(v_old_json ->> 'org_id', '')::uuid;
    INSERT INTO audit_log (table_name, operation, record_id, row_id, org_id, changed_by, actor_id, changed_fields, old_data)
    VALUES (TG_TABLE_NAME, 'D', v_record_id, v_record_id, v_org_id, v_changed_by, v_changed_by, v_old_json, v_old_json);
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_users_audit           ON users;
CREATE TRIGGER trg_users_audit
  AFTER UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION audit_row_changes();

DROP TRIGGER IF EXISTS trg_ad_campaigns_audit    ON ad_campaigns;
CREATE TRIGGER trg_ad_campaigns_audit
  AFTER UPDATE OR DELETE ON ad_campaigns FOR EACH ROW EXECUTE FUNCTION audit_row_changes();

DROP TRIGGER IF EXISTS trg_lead_interactions_audit ON lead_interactions;
CREATE TRIGGER trg_lead_interactions_audit
  AFTER UPDATE OR DELETE ON lead_interactions FOR EACH ROW EXECUTE FUNCTION audit_row_changes();

DROP TRIGGER IF EXISTS trg_lead_follow_ups_audit ON lead_follow_ups;
CREATE TRIGGER trg_lead_follow_ups_audit
  AFTER UPDATE OR DELETE ON lead_follow_ups FOR EACH ROW EXECUTE FUNCTION audit_row_changes();

-- Lead stage transition log.
-- SECURITY DEFINER: app_user has no INSERT on lead_status_log.
-- transition_note is read from app.lead_transition_note session GUC set by the API.
CREATE OR REPLACE FUNCTION log_lead_stage_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_changed_by UUID;
  v_note       TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id
       AND NEW.outcome_id IS NOT DISTINCT FROM OLD.outcome_id THEN
      RETURN NEW;
    END IF;
  END IF;
  BEGIN
    v_changed_by := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN v_changed_by := NULL; END;
  BEGIN
    v_note := NULLIF(current_setting('app.lead_transition_note', true), '');
  EXCEPTION WHEN OTHERS THEN v_note := NULL; END;

  INSERT INTO lead_status_log (
    org_id, lead_id,
    old_stage_id, new_stage_id,
    old_outcome_id, new_outcome_id,
    assigned_user_id, changed_by_id, transition_note
  ) VALUES (
    NEW.org_id, NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.stage_id END,
    NEW.stage_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.outcome_id END,
    NEW.outcome_id,
    NEW.assigned_user_id,
    v_changed_by,
    v_note
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lead_status_log  ON marketing_leads;
DROP TRIGGER IF EXISTS trg_lead_stage_log   ON marketing_leads;
CREATE TRIGGER trg_lead_stage_log
  AFTER INSERT OR UPDATE OF stage_id, outcome_id ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION log_lead_stage_change();

-- ===================================================================
-- ROW LEVEL SECURITY
-- ===================================================================

-- marketing_leads
ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_leads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation_policy    ON marketing_leads;
DROP POLICY IF EXISTS tenant_isolation_policy ON marketing_leads;
CREATE POLICY org_isolation_policy ON marketing_leads AS PERMISSIVE FOR ALL TO app_user
  USING     (org_id = NULLIF(current_setting('app.current_org_id',true),'')::uuid AND NOT is_deleted)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id',true),'')::uuid AND NOT is_deleted);
CREATE POLICY tenant_isolation_policy ON marketing_leads AS PERMISSIVE FOR ALL TO tenant_admin
  USING (org_id IN (SELECT id FROM organizations WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid AND NOT is_deleted) AND NOT is_deleted)
  WITH CHECK (org_id IN (SELECT id FROM organizations WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid AND NOT is_deleted) AND NOT is_deleted);

-- users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation_policy    ON users;
DROP POLICY IF EXISTS tenant_isolation_policy ON users;
CREATE POLICY org_isolation_policy ON users AS PERMISSIVE FOR ALL TO app_user
  USING     (org_id = NULLIF(current_setting('app.current_org_id',true),'')::uuid AND NOT is_deleted)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id',true),'')::uuid AND NOT is_deleted);
CREATE POLICY tenant_isolation_policy ON users AS PERMISSIVE FOR ALL TO tenant_admin
  USING (org_id IN (SELECT id FROM organizations WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid AND NOT is_deleted) AND NOT is_deleted)
  WITH CHECK (org_id IN (SELECT id FROM organizations WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid AND NOT is_deleted) AND NOT is_deleted);

-- ad_campaigns
ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation_policy    ON ad_campaigns;
DROP POLICY IF EXISTS tenant_isolation_policy ON ad_campaigns;
CREATE POLICY org_isolation_policy ON ad_campaigns AS PERMISSIVE FOR ALL TO app_user
  USING     (org_id = NULLIF(current_setting('app.current_org_id',true),'')::uuid AND NOT is_deleted)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id',true),'')::uuid AND NOT is_deleted);
CREATE POLICY tenant_isolation_policy ON ad_campaigns AS PERMISSIVE FOR ALL TO tenant_admin
  USING (org_id IN (SELECT id FROM organizations WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid AND NOT is_deleted) AND NOT is_deleted)
  WITH CHECK (org_id IN (SELECT id FROM organizations WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid AND NOT is_deleted) AND NOT is_deleted);

-- lead_interactions
ALTER TABLE lead_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_interactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation_policy    ON lead_interactions;
DROP POLICY IF EXISTS tenant_isolation_policy ON lead_interactions;
CREATE POLICY org_isolation_policy ON lead_interactions AS PERMISSIVE FOR ALL TO app_user
  USING     (org_id = NULLIF(current_setting('app.current_org_id',true),'')::uuid AND NOT is_deleted)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id',true),'')::uuid AND NOT is_deleted);
CREATE POLICY tenant_isolation_policy ON lead_interactions AS PERMISSIVE FOR ALL TO tenant_admin
  USING (org_id IN (SELECT id FROM organizations WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid AND NOT is_deleted) AND NOT is_deleted)
  WITH CHECK (org_id IN (SELECT id FROM organizations WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid AND NOT is_deleted) AND NOT is_deleted);

-- lead_follow_ups
ALTER TABLE lead_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_follow_ups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation_policy    ON lead_follow_ups;
DROP POLICY IF EXISTS tenant_isolation_policy ON lead_follow_ups;
CREATE POLICY org_isolation_policy ON lead_follow_ups AS PERMISSIVE FOR ALL TO app_user
  USING     (org_id = NULLIF(current_setting('app.current_org_id',true),'')::uuid AND NOT is_deleted)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id',true),'')::uuid AND NOT is_deleted);
CREATE POLICY tenant_isolation_policy ON lead_follow_ups AS PERMISSIVE FOR ALL TO tenant_admin
  USING (org_id IN (SELECT id FROM organizations WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid AND NOT is_deleted) AND NOT is_deleted)
  WITH CHECK (org_id IN (SELECT id FROM organizations WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid AND NOT is_deleted) AND NOT is_deleted);

-- lead_assignment_log
ALTER TABLE lead_assignment_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_assignment_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation_policy    ON lead_assignment_log;
DROP POLICY IF EXISTS tenant_isolation_policy ON lead_assignment_log;
CREATE POLICY org_isolation_policy ON lead_assignment_log AS PERMISSIVE FOR ALL TO app_user
  USING     (org_id = NULLIF(current_setting('app.current_org_id',true),'')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id',true),'')::uuid);
CREATE POLICY tenant_isolation_policy ON lead_assignment_log AS PERMISSIVE FOR ALL TO tenant_admin
  USING (org_id IN (SELECT id FROM organizations WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid AND NOT is_deleted));

-- lead_status_log (SELECT only for non-service roles)
ALTER TABLE lead_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_status_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation_policy    ON lead_status_log;
DROP POLICY IF EXISTS tenant_isolation_policy ON lead_status_log;
CREATE POLICY org_isolation_policy ON lead_status_log AS PERMISSIVE FOR SELECT TO app_user
  USING (org_id = NULLIF(current_setting('app.current_org_id',true),'')::uuid);
CREATE POLICY tenant_isolation_policy ON lead_status_log AS PERMISSIVE FOR SELECT TO tenant_admin
  USING (org_id IN (SELECT id FROM organizations WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid AND NOT is_deleted));

-- ===================================================================
-- INDEXES
-- ===================================================================

-- marketing_leads
CREATE INDEX IF NOT EXISTS idx_marketing_leads_org_stage_created
  ON marketing_leads (org_id, stage_id, created_at DESC) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_marketing_leads_org_created
  ON marketing_leads (org_id, created_at DESC) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_marketing_leads_org_assigned_user
  ON marketing_leads (org_id, assigned_user_id, created_at DESC) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_marketing_leads_org_campaign
  ON marketing_leads (org_id, campaign_id) WHERE campaign_id IS NOT NULL AND NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_marketing_leads_org_outcome
  ON marketing_leads (org_id, outcome_id) WHERE outcome_id IS NOT NULL AND NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_marketing_leads_org_phone
  ON marketing_leads (org_id, phone) WHERE phone IS NOT NULL AND NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_marketing_leads_org_email
  ON marketing_leads (org_id, email) WHERE email IS NOT NULL AND NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_marketing_leads_fullname_trgm
  ON marketing_leads USING GIN (full_name gin_trgm_ops) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_marketing_leads_webhook_gin
  ON marketing_leads USING GIN (raw_webhook_data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_metadata_gin
  ON marketing_leads USING GIN (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_tags_gin
  ON marketing_leads USING GIN (tags);

-- lead_interactions
CREATE INDEX IF NOT EXISTS idx_lead_interactions_org_lead_occurred
  ON lead_interactions (org_id, lead_id, occurred_at DESC) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_id
  ON lead_interactions (lead_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_id_full
  ON lead_interactions (lead_id);

-- lead_follow_ups
CREATE INDEX IF NOT EXISTS idx_lead_follow_ups_org_user_scheduled
  ON lead_follow_ups (org_id, assigned_user_id, scheduled_at ASC, status_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_lead_follow_ups_lead_id
  ON lead_follow_ups (lead_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_lead_follow_ups_lead_id_full
  ON lead_follow_ups (lead_id);

-- lead_assignment_log
CREATE INDEX IF NOT EXISTS idx_lead_assignment_log_lead
  ON lead_assignment_log (org_id, lead_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_assignment_log_assigned_by
  ON lead_assignment_log (org_id, assigned_by_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_assignment_log_assigned_to
  ON lead_assignment_log (org_id, assigned_to_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_assignment_log_lead_id_full
  ON lead_assignment_log (lead_id);

-- ad_campaigns
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_org_platform
  ON ad_campaigns (org_id, platform_id) WHERE NOT is_deleted;

-- organizations
CREATE INDEX IF NOT EXISTS idx_organizations_tenant_id
  ON organizations (tenant_id) WHERE NOT is_deleted;

-- users
CREATE INDEX IF NOT EXISTS idx_users_org_role
  ON users (org_id, role_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_users_org_email
  ON users (org_id, email) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_users_email_trgm
  ON users USING GIN (email gin_trgm_ops) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_users_manager_id
  ON users (org_id, manager_id) WHERE manager_id IS NOT NULL AND NOT is_deleted;

-- Vector similarity stub — uncomment after pgvector confirmed and embedding column added
-- CREATE INDEX IF NOT EXISTS idx_marketing_leads_embedding_ivfflat
--   ON marketing_leads USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ===================================================================
-- GRANTS
-- ===================================================================

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL    ON SCHEMA public FROM PUBLIC;
GRANT  USAGE  ON SCHEMA public TO PUBLIC;
GRANT  USAGE  ON SCHEMA public TO app_user;
GRANT  USAGE  ON SCHEMA public TO tenant_admin;
GRANT  USAGE  ON SCHEMA public TO crm_service;

DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO crm_service', current_database()); END; $$;

-- app_user: DML on operational tables; SELECT-only on audit + lookups
GRANT SELECT, INSERT, UPDATE ON TABLE
  users, ad_campaigns, marketing_leads, lead_interactions, lead_follow_ups TO app_user;
REVOKE DELETE ON TABLE
  users, ad_campaigns, marketing_leads, lead_interactions, lead_follow_ups FROM app_user;

GRANT SELECT ON TABLE
  user_roles, lead_stage, lead_stage_outcome, interaction_types, follow_up_statuses,
  marketing_platforms, campaign_statuses, org_types, tenant_domains, tenant_plan_types,
  lead_sources, branches, organizations,
  countries, states, cities
TO app_user;

GRANT SELECT ON TABLE lead_assignment_log, lead_status_log, marketing_leads_history, audit_log TO app_user;
REVOKE INSERT, UPDATE, DELETE ON TABLE lead_assignment_log, lead_status_log, marketing_leads_history, audit_log FROM app_user;

GRANT SELECT ON TABLE
  vw_dashboard_leads, vw_user_org_chart, vw_user_team_members,
  vw_lead_followup_timeline, vw_lead_assignment_timeline,
  vw_sales_follow_up_pipeline, vw_followup_pipeline_enriched,
  vw_org_performance_snapshot
TO app_user;

GRANT EXECUTE ON FUNCTION can_assign_to(UUID,UUID,UUID) TO app_user;

-- tenant_admin: cross-org DML
GRANT SELECT, INSERT, UPDATE ON TABLE
  users, ad_campaigns, marketing_leads, lead_interactions, lead_follow_ups TO tenant_admin;
REVOKE DELETE ON TABLE
  users, ad_campaigns, marketing_leads, lead_interactions, lead_follow_ups FROM tenant_admin;

GRANT SELECT ON TABLE
  organizations, lead_assignment_log, lead_status_log, marketing_leads_history TO tenant_admin;
GRANT SELECT ON TABLE audit_log TO tenant_admin;
REVOKE INSERT, UPDATE, DELETE ON TABLE audit_log FROM tenant_admin;
GRANT SELECT ON TABLE
  user_roles, lead_stage, lead_stage_outcome, interaction_types, follow_up_statuses,
  marketing_platforms, campaign_statuses, org_types, tenant_domains, tenant_plan_types,
  lead_sources, branches,
  countries, states, cities
TO tenant_admin;

GRANT SELECT ON TABLE
  vw_dashboard_leads, vw_user_org_chart, vw_user_team_members,
  vw_lead_followup_timeline, vw_lead_assignment_timeline,
  vw_sales_follow_up_pipeline, vw_followup_pipeline_enriched,
  vw_tenant_campaign_summary, vw_tenant_full_dashboard,
  vw_org_performance_snapshot
TO tenant_admin;

GRANT EXECUTE ON FUNCTION can_assign_to(UUID,UUID,UUID) TO tenant_admin;

-- crm_service: unrestricted
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO crm_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO crm_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES    TO crm_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO crm_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO tenant_admin;

-- ===================================================================
-- SERVICE LOGIN ROLES  (per-microservice credentials)
-- Each service connects with its own login role, then does:
--   SET LOCAL ROLE app_user;          -- activates RLS + grants
--   SET LOCAL app.current_org_id = '...';
--   SET LOCAL app.current_user_id = '...';
-- ===================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lead_svc') THEN
    CREATE ROLE lead_svc WITH LOGIN PASSWORD 'LeadSvc_Dev2025' NOINHERIT;
  ELSE ALTER ROLE lead_svc WITH LOGIN PASSWORD 'LeadSvc_Dev2025' NOINHERIT; END IF;
END; $$;
GRANT app_user TO lead_svc;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'campaign_svc') THEN
    CREATE ROLE campaign_svc WITH LOGIN PASSWORD 'replace_in_env' NOINHERIT;
  ELSE ALTER ROLE campaign_svc WITH LOGIN NOINHERIT; END IF;
END; $$;
GRANT app_user TO campaign_svc;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'user_mgmt_svc') THEN
    CREATE ROLE user_mgmt_svc WITH LOGIN PASSWORD 'replace_in_env' NOINHERIT;
  ELSE ALTER ROLE user_mgmt_svc WITH LOGIN NOINHERIT; END IF;
END; $$;
GRANT app_user TO user_mgmt_svc;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'notif_svc') THEN
    CREATE ROLE notif_svc WITH LOGIN PASSWORD 'replace_in_env' NOINHERIT;
  ELSE ALTER ROLE notif_svc WITH LOGIN NOINHERIT; END IF;
END; $$;
GRANT app_user TO notif_svc;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'intake_svc') THEN
    CREATE ROLE intake_svc WITH LOGIN PASSWORD 'replace_in_env' NOINHERIT;
  ELSE ALTER ROLE intake_svc WITH LOGIN NOINHERIT; END IF;
END; $$;
GRANT app_user TO intake_svc;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenant_dash_svc') THEN
    CREATE ROLE tenant_dash_svc WITH LOGIN PASSWORD 'TenantSvc_Dev2025' NOINHERIT;
  ELSE ALTER ROLE tenant_dash_svc WITH LOGIN PASSWORD 'TenantSvc_Dev2025' NOINHERIT; END IF;
END; $$;
GRANT tenant_admin TO tenant_dash_svc;

-- analytics_svc: BYPASSRLS + SELECT only (read replica)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_svc') THEN
    CREATE ROLE analytics_svc WITH LOGIN PASSWORD 'replace_in_env' BYPASSRLS NOINHERIT;
  ELSE ALTER ROLE analytics_svc WITH LOGIN BYPASSRLS NOINHERIT; END IF;
END; $$;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_svc;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM analytics_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analytics_svc;

-- Schema + connect for all service roles
GRANT USAGE ON SCHEMA public TO
  lead_svc, campaign_svc, user_mgmt_svc,
  notif_svc, intake_svc, tenant_dash_svc, analytics_svc;

DO $$
DECLARE v_db TEXT := current_database();
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO lead_svc',        v_db);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO campaign_svc',    v_db);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO user_mgmt_svc',   v_db);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO notif_svc',       v_db);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO intake_svc',      v_db);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO tenant_dash_svc', v_db);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO analytics_svc',   v_db);
END; $$;

-- Production password rotation — run via psql with -v vars set:
--   psql ... -v LEAD_SVC_PWD=xxx -v TENANT_DASH_PWD=xxx -v CRM_SVC_PWD=xxx ...
-- Maps to .env: DATABASE_URL / DATABASE_URL_TENANT / DATABASE_URL_SERVICE
-- ALTER ROLE lead_svc        WITH PASSWORD :'LEAD_SVC_PWD';       -- → DATABASE_URL
-- ALTER ROLE tenant_dash_svc WITH PASSWORD :'TENANT_DASH_PWD';    -- → DATABASE_URL_TENANT
-- ALTER ROLE crm_service     WITH PASSWORD :'CRM_SVC_PWD';        -- → DATABASE_URL_SERVICE
-- ALTER ROLE campaign_svc    WITH PASSWORD :'CAMPAIGN_SVC_PWD';
-- ALTER ROLE user_mgmt_svc   WITH PASSWORD :'USER_MGMT_PWD';
-- ALTER ROLE notif_svc       WITH PASSWORD :'NOTIF_SVC_PWD';
-- ALTER ROLE intake_svc      WITH PASSWORD :'INTAKE_SVC_PWD';
-- ALTER ROLE analytics_svc   WITH PASSWORD :'ANALYTICS_SVC_PWD';

-- ===================================================================
-- v1.1: USER-ORG MAPPING + MULTI-ORG RLS FIX
-- ===================================================================

-- ── USER_ORG_MAPPING ──────────────────────────────────────────────
-- Source of truth for which orgs a user can access and at what role.
-- Replaces the single org_id + role_id on users for access control.
--
-- users.org_id  remains as the user's PRIMARY / home org (FK integrity
--               and fallback when no org is selected).
-- users.role_id remains as the user's DEFAULT role (mirrors the home
--               org row here; kept for backward-compat during transition).
CREATE TABLE IF NOT EXISTS user_org_mapping (
  user_id    UUID        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  org_id     UUID        NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  role_id    UUID        NOT NULL REFERENCES user_roles(id)     ON DELETE RESTRICT,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  granted_by UUID        REFERENCES users(id)                   ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  PRIMARY KEY (user_id, org_id)
);

DROP TRIGGER IF EXISTS trg_user_org_mapping_updated_at ON user_org_mapping;
CREATE TRIGGER trg_user_org_mapping_updated_at
  BEFORE UPDATE ON user_org_mapping
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_org_mapping_user_active
  ON user_org_mapping (user_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_user_org_mapping_org_active
  ON user_org_mapping (org_id)  WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_user_org_mapping_role
  ON user_org_mapping (role_id);

-- ── RLS HELPER FUNCTIONS (SECURITY DEFINER) ───────────────────────
-- These bypass RLS on user_org_mapping so they can be used safely
-- inside RLS policies on OTHER tables without recursive infinite loops.

DROP FUNCTION IF EXISTS fn_user_active_orgs(UUID);
CREATE FUNCTION fn_user_active_orgs(p_user_id UUID)
RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ARRAY(SELECT org_id FROM user_org_mapping WHERE user_id = p_user_id AND is_active)
$$;

DROP FUNCTION IF EXISTS fn_org_active_users(UUID);
CREATE FUNCTION fn_org_active_users(p_org_id UUID)
RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ARRAY(SELECT user_id FROM user_org_mapping WHERE org_id = p_org_id AND is_active)
$$;

-- Returns role rank of a user in an org (-1 if no active mapping).
CREATE OR REPLACE FUNCTION fn_user_org_rank(p_user_id UUID, p_org_id UUID)
RETURNS INT LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_rank INT;
BEGIN
  SELECT ur.rank INTO v_rank
  FROM user_org_mapping uom
  JOIN user_roles ur ON ur.id = uom.role_id
  WHERE uom.user_id = p_user_id AND uom.org_id = p_org_id AND uom.is_active;
  RETURN COALESCE(v_rank, -1);
END; $$;

-- ── AUTO-GRANT TRIGGER 1 ──────────────────────────────────────────
-- New org added to a tenant → all existing tenant_admins in that
-- tenant automatically receive a row for the new org.
CREATE OR REPLACE FUNCTION auto_grant_tenant_admins_on_new_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_org_mapping (user_id, org_id, role_id, is_active, granted_by)
  SELECT uom.user_id, NEW.id, uom.role_id, TRUE, NULL
  FROM user_org_mapping uom
  JOIN organizations    o  ON o.id  = uom.org_id
  JOIN user_roles       ur ON ur.id = uom.role_id
  WHERE o.tenant_id = NEW.tenant_id
    AND ur.name     = 'tenant_admin'
    AND uom.is_active
  ON CONFLICT (user_id, org_id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_grant_tenant_admins_on_new_org ON organizations;
CREATE TRIGGER trg_auto_grant_tenant_admins_on_new_org
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION auto_grant_tenant_admins_on_new_org();

-- ── AUTO-GRANT TRIGGER 2 ──────────────────────────────────────────
-- User first granted tenant_admin in any org → they automatically
-- receive rows for all other existing orgs in the same tenant.
-- pg_trigger_depth() guard prevents recursive re-firing when this
-- function's own INSERTs trigger the same event.
CREATE OR REPLACE FUNCTION auto_grant_all_orgs_on_tenant_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_tenant_id UUID;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles WHERE id = NEW.role_id AND name = 'tenant_admin'
  ) THEN RETURN NEW; END IF;

  SELECT tenant_id INTO v_tenant_id FROM organizations WHERE id = NEW.org_id;

  INSERT INTO user_org_mapping (user_id, org_id, role_id, is_active, granted_by)
  SELECT NEW.user_id, o.id, NEW.role_id, TRUE, NEW.granted_by
  FROM organizations o
  WHERE o.tenant_id = v_tenant_id
    AND o.id       <> NEW.org_id
    AND NOT o.is_deleted
  ON CONFLICT (user_id, org_id) DO NOTHING;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_grant_all_orgs_on_tenant_admin ON user_org_mapping;
CREATE TRIGGER trg_auto_grant_all_orgs_on_tenant_admin
  AFTER INSERT ON user_org_mapping
  FOR EACH ROW EXECUTE FUNCTION auto_grant_all_orgs_on_tenant_admin();

-- ── UPDATED FK SCOPE CHECKS ───────────────────────────────────────
-- Now validate via user_org_mapping so multi-org users (whose home
-- org_id differs from the working org) are not incorrectly rejected.

CREATE OR REPLACE FUNCTION check_lead_fk_org_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.campaign_id IS NOT NULL THEN
    PERFORM 1 FROM ad_campaigns
    WHERE id = NEW.campaign_id AND org_id = NEW.org_id AND NOT is_deleted;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'campaign_id % does not belong to org % or has been deleted.',
        NEW.campaign_id, NEW.org_id;
    END IF;
  END IF;
  IF NEW.assigned_user_id IS NOT NULL THEN
    PERFORM 1
    FROM user_org_mapping uom
    JOIN users u ON u.id = uom.user_id
    WHERE uom.user_id = NEW.assigned_user_id
      AND uom.org_id  = NEW.org_id
      AND uom.is_active
      AND u.is_active AND NOT u.is_deleted;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'assigned_user_id % has no active mapping to org % or has been deleted.',
        NEW.assigned_user_id, NEW.org_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION check_interaction_fk_org_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM marketing_leads
  WHERE id = NEW.lead_id AND org_id = NEW.org_id AND NOT is_deleted;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_id % does not belong to org % or has been deleted.',
      NEW.lead_id, NEW.org_id;
  END IF;
  PERFORM 1
  FROM user_org_mapping uom
  JOIN users u ON u.id = uom.user_id
  WHERE uom.user_id = NEW.user_id
    AND uom.org_id  = NEW.org_id
    AND uom.is_active
    AND u.is_active AND NOT u.is_deleted;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_id % has no active mapping to org % or has been deleted.',
      NEW.user_id, NEW.org_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION check_follow_up_fk_org_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM marketing_leads
  WHERE id = NEW.lead_id AND org_id = NEW.org_id AND NOT is_deleted;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_id % does not belong to org % or has been deleted.',
      NEW.lead_id, NEW.org_id;
  END IF;
  PERFORM 1
  FROM user_org_mapping uom
  JOIN users u ON u.id = uom.user_id
  WHERE uom.user_id = NEW.assigned_user_id
    AND uom.org_id  = NEW.org_id
    AND uom.is_active
    AND u.is_active AND NOT u.is_deleted;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assigned_user_id % has no active mapping to org % or has been deleted.',
      NEW.assigned_user_id, NEW.org_id;
  END IF;
  RETURN NEW;
END; $$;

-- ── UPDATED can_assign_to ─────────────────────────────────────────
-- Looks up role via user_org_mapping instead of users.org_id so that
-- multi-org users are evaluated for the org they are currently working in.
CREATE OR REPLACE FUNCTION can_assign_to(
  p_org_id         UUID,
  p_acting_user_id UUID,
  p_target_user_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role     TEXT;
  v_in_scope BOOLEAN;
BEGIN
  IF p_acting_user_id = p_target_user_id THEN RETURN TRUE; END IF;

  SELECT ur.name INTO v_role
  FROM user_org_mapping uom
  JOIN user_roles ur ON ur.id = uom.role_id
  JOIN users      u  ON u.id  = uom.user_id
  WHERE uom.user_id = p_acting_user_id
    AND uom.org_id  = p_org_id
    AND uom.is_active
    AND u.is_active AND NOT u.is_deleted;

  IF v_role IS NULL THEN RETURN FALSE; END IF;
  IF v_role IN ('super_admin','tenant_admin','org_admin') THEN RETURN TRUE; END IF;

  IF v_role IN ('org_manager','org_sr_manager','senior_sales_executive') THEN
    SELECT COUNT(*) > 0 INTO v_in_scope
    FROM vw_user_team_members
    WHERE manager_id = p_acting_user_id
      AND member_id  = p_target_user_id
      AND org_id     = p_org_id;
    RETURN COALESCE(v_in_scope, FALSE);
  END IF;

  RETURN FALSE;
END; $$;

-- ── RLS: organizations ────────────────────────────────────────────
-- Previously had no RLS — anyone with app_user could read all orgs.
-- Now: app_user sees only orgs they are mapped to; tenant_admin sees
-- all orgs within their tenant.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation_policy    ON organizations;
DROP POLICY IF EXISTS tenant_isolation_policy ON organizations;

CREATE POLICY org_isolation_policy ON organizations AS PERMISSIVE FOR SELECT TO app_user
  USING (
    NOT is_deleted AND
    id = ANY(fn_user_active_orgs(
      NULLIF(current_setting('app.current_user_id', true), '')::uuid
    ))
  );

CREATE POLICY tenant_isolation_policy ON organizations AS PERMISSIVE FOR ALL TO tenant_admin
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    AND NOT is_deleted
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    AND NOT is_deleted
  );

-- ── RLS: users — update SELECT to use user_org_mapping ────────────
-- Old policy: org_id = current_org_id (breaks for multi-org users
-- whose home org differs from the org they're currently working in).
-- New SELECT policy: see all users who have an active mapping to the
-- current org (regardless of their home org_id).
-- Write policies remain anchored to org_id for home-org assignment.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation_policy    ON users;
DROP POLICY IF EXISTS tenant_isolation_policy ON users;

CREATE POLICY users_org_select ON users AS PERMISSIVE FOR SELECT TO app_user
  USING (
    NOT is_deleted AND
    id = ANY(fn_org_active_users(
      NULLIF(current_setting('app.current_org_id', true), '')::uuid
    ))
  );

CREATE POLICY users_org_write ON users AS PERMISSIVE FOR INSERT TO app_user
  WITH CHECK (
    org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND NOT is_deleted
  );

CREATE POLICY users_org_update ON users AS PERMISSIVE FOR UPDATE TO app_user
  USING (
    org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND NOT is_deleted
  )
  WITH CHECK (
    org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND NOT is_deleted
  );

CREATE POLICY users_tenant_isolation ON users AS PERMISSIVE FOR ALL TO tenant_admin
  USING (
    org_id IN (
      SELECT id FROM organizations
      WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        AND NOT is_deleted
    ) AND NOT is_deleted
  )
  WITH CHECK (
    org_id IN (
      SELECT id FROM organizations
      WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        AND NOT is_deleted
    ) AND NOT is_deleted
  );

-- ── RLS: user_org_mapping ─────────────────────────────────────────
-- Policies use SECURITY DEFINER helpers to avoid recursive RLS
-- (a policy querying user_org_mapping would trigger its own RLS).
ALTER TABLE user_org_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_org_mapping FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS self_read_policy        ON user_org_mapping;
DROP POLICY IF EXISTS org_admin_manage_policy ON user_org_mapping;
DROP POLICY IF EXISTS tenant_isolation_policy ON user_org_mapping;

-- Any user can read their own mapping rows.
CREATE POLICY self_read_policy ON user_org_mapping AS PERMISSIVE FOR SELECT TO app_user
  USING (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

-- Org admins (rank >= 80) can manage mappings within their current org.
-- fn_user_org_rank is SECURITY DEFINER so it bypasses RLS on this table.
CREATE POLICY org_admin_manage_policy ON user_org_mapping AS PERMISSIVE FOR ALL TO app_user
  USING (
    org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND fn_user_org_rank(
      NULLIF(current_setting('app.current_user_id', true), '')::uuid,
      NULLIF(current_setting('app.current_org_id',  true), '')::uuid
    ) >= 80
  )
  WITH CHECK (
    org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND fn_user_org_rank(
      NULLIF(current_setting('app.current_user_id', true), '')::uuid,
      NULLIF(current_setting('app.current_org_id',  true), '')::uuid
    ) >= 80
  );

-- tenant_admin can manage all mappings across their tenant's orgs.
CREATE POLICY tenant_isolation_policy ON user_org_mapping AS PERMISSIVE FOR ALL TO tenant_admin
  USING (
    org_id IN (
      SELECT id FROM organizations
      WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        AND NOT is_deleted
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT id FROM organizations
      WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        AND NOT is_deleted
    )
  );

-- ── GRANTS: user_org_mapping ──────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON TABLE user_org_mapping TO app_user;
REVOKE DELETE ON TABLE user_org_mapping FROM app_user;

GRANT SELECT, INSERT, UPDATE ON TABLE user_org_mapping TO tenant_admin;
REVOKE DELETE ON TABLE user_org_mapping FROM tenant_admin;

GRANT ALL PRIVILEGES ON TABLE user_org_mapping TO crm_service;

-- tenant_admin can also INSERT/UPDATE organizations (create new branches/orgs)
GRANT INSERT, UPDATE ON TABLE organizations TO tenant_admin;

GRANT EXECUTE ON FUNCTION fn_user_active_orgs(UUID)  TO app_user, tenant_admin;
GRANT EXECUTE ON FUNCTION fn_org_active_users(UUID)  TO app_user, tenant_admin;
GRANT EXECUTE ON FUNCTION fn_user_org_rank(UUID,UUID) TO app_user, tenant_admin;
