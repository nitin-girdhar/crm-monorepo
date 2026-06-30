-- ===================================================================
-- CRM Monorepo - Lookup / Reference Seed Data
-- Prerequisite: Run 01_init-db.sql first (schema must already exist).
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING / DO UPDATE SET)
-- ===================================================================

-- ===================================================================
-- SCHEMA VERSION TRACKING
-- ===================================================================

INSERT INTO public.schema_versions (version, description) VALUES
  ('1.0.0', 'Merged monorepo + EXISTING_WORKING_CODE: geo tables, soft-delete, business-rule triggers, audit triggers, service logins'),
  ('1.1.0', 'iam.user_org_mapping table, legal_entity_name/brand_name on entity.organizations, fixed multi-org RLS gaps')
ON CONFLICT (version) DO NOTHING;


-- ===================================================================
-- GEOGRAPHIC DATA
-- ===================================================================

-- ── Geographic seed data ────────────────────────────────────────────
INSERT INTO geo.countries (name, iso_code) VALUES
  ('India',                'IN'),
  ('United States',        'US'),
  ('United Kingdom',       'GB'),
  ('United Arab Emirates', 'AE')
ON CONFLICT (name) DO NOTHING;

INSERT INTO geo.states (country_id, name, code)
SELECT c.id, s.name, s.code
FROM geo.countries c
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

INSERT INTO geo.cities (state_id, name)
SELECT s.id, c.name
FROM geo.states s
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
-- IAM -- USER ROLES
-- ===================================================================

INSERT INTO iam.user_roles (name, label, description, rank) VALUES
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


-- ===================================================================
-- CRM -- LEAD STAGES, OUTCOMES, INTERACTION TYPES, FOLLOW-UP STATUSES, SOURCES
-- ===================================================================

INSERT INTO crm.lead_stage (name, label, description, sort_order, followup_required, is_rejected, is_terminated) VALUES
  ('new',            'New',            'Lead just received — not yet contacted',                       1, FALSE, FALSE, FALSE),
  ('contacting',     'Contacting',     'Active outreach in progress — calls, WhatsApp, or email',      2, TRUE,  FALSE, FALSE),
  ('on_hold',        'On Hold',        'Follow-up temporarily paused — lead asked to be contacted later or is unreachable', 3, TRUE,  FALSE, FALSE),
  ('qualified',      'Qualified',      'Lead confirmed as a genuine prospect with intent and budget',  4, TRUE,  FALSE, FALSE),
  ('converted',      'Converted',      'Lead became a paying customer',                                5, FALSE, FALSE, TRUE),
  ('unqualified',    'Unqualified',    'Lead did not qualify — outcome and note must be recorded',     6, FALSE, TRUE,  TRUE),
  ('transferred_out','Transferred Out','Lead transferred to another org or partner',                   7, FALSE, FALSE, TRUE)
ON CONFLICT (name) DO UPDATE SET
  label             = EXCLUDED.label,
  description       = EXCLUDED.description,
  sort_order        = EXCLUDED.sort_order,
  followup_required = EXCLUDED.followup_required,
  is_rejected       = EXCLUDED.is_rejected,
  is_terminated     = EXCLUDED.is_terminated;

-- Seed all outcomes using name subqueries (never hardcoded IDs)
DO $$
DECLARE
  v_contacting  UUID;
  v_qualified   UUID;
  v_converted   UUID;
  v_unqualified UUID;
  v_transferred UUID;
BEGIN
  SELECT id INTO v_contacting  FROM crm.lead_stage WHERE name = 'contacting';
  SELECT id INTO v_qualified   FROM crm.lead_stage WHERE name = 'qualified';
  SELECT id INTO v_converted   FROM crm.lead_stage WHERE name = 'converted';
  SELECT id INTO v_unqualified FROM crm.lead_stage WHERE name = 'unqualified';
  SELECT id INTO v_transferred FROM crm.lead_stage WHERE name = 'transferred_out';

  -- contacting outcomes
  INSERT INTO crm.lead_stage_outcome (stage_id, name, label, sort_order) VALUES
    (v_contacting, 'not_connected',   'Not Connected',   1),
    (v_contacting, 'switch_off',      'Switch Off',      2),
    (v_contacting, 'not_answered',    'Not Answered',    3),
    (v_contacting, 'call_back_later', 'Call Back Later', 4)
  ON CONFLICT (stage_id, name) DO NOTHING;

  -- qualified outcomes
  INSERT INTO crm.lead_stage_outcome (stage_id, name, label, sort_order) VALUES
    (v_qualified, 'visit_scheduled', 'Visit Scheduled', 1),
    (v_qualified, 'visited',         'Visited',         2)
  ON CONFLICT (stage_id, name) DO NOTHING;

  -- converted outcomes
  INSERT INTO crm.lead_stage_outcome (stage_id, name, label, sort_order) VALUES
    (v_converted, 'membership_sold', 'Membership Sold', 1)
  ON CONFLICT (stage_id, name) DO NOTHING;

  -- unqualified outcomes
  INSERT INTO crm.lead_stage_outcome (stage_id, name, label, requires_comment, sort_order) VALUES
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
  INSERT INTO crm.lead_stage_outcome (stage_id, name, label, sort_order) VALUES
    (v_transferred, 'transferred_to_other_branch', 'Transferred to Other Branch', 1)
  ON CONFLICT (stage_id, name) DO NOTHING;
END;
$$;

INSERT INTO crm.interaction_types (name, description) VALUES
  ('call',          'Outbound or inbound phone call'),
  ('whatsapp',      'WhatsApp message (text, audio, or media)'),
  ('email',         'Email sent or received'),
  ('sms',           'SMS or text message'),
  ('in_person',     'Face-to-face meeting at store, office, or event'),
  ('video_call',    'Video call via Zoom, Google Meet, WhatsApp Video, etc.'),
  ('chat',          'Live chat on website or social media platform'),
  ('internal_note', 'Internal note or annotation added by a team member')
ON CONFLICT (name) DO NOTHING;

INSERT INTO crm.follow_up_statuses (name, label, description) VALUES
  ('pending',     'Pending',     'Follow-up scheduled and not yet actioned'),
  ('completed',   'Completed',   'Follow-up actioned within the scheduled window'),
  ('missed',      'Missed',      'Follow-up was not actioned before the scheduled time'),
  ('rescheduled', 'Rescheduled', 'Follow-up postponed to a new scheduled_at datetime')
ON CONFLICT (name) DO NOTHING;


-- ===================================================================
-- MARKETING -- PLATFORMS & CAMPAIGN STATUSES
-- ===================================================================

INSERT INTO marketing.marketing_platforms (name, description) VALUES
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

INSERT INTO marketing.campaign_statuses (name, description) VALUES
  ('draft',     'Campaign created but not yet submitted for review or activation'),
  ('active',    'Campaign is live and currently running'),
  ('paused',    'Campaign temporarily paused; can be resumed'),
  ('completed', 'Campaign ran its full duration and ended normally'),
  ('archived',  'Campaign permanently closed and moved to archive')
ON CONFLICT (name) DO NOTHING;


-- ===================================================================
-- ENTITY -- ORG TYPES, TENANT DOMAINS, TENANT PLAN TYPES
-- ===================================================================

INSERT INTO entity.org_types (name, description) VALUES
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

INSERT INTO entity.tenant_domains (name, description) VALUES
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

INSERT INTO entity.tenant_plan_types (name, description) VALUES
  ('free_trial', 'Up to 3 iam.users, 1 org, 100 leads — 30-day trial'),
  ('starter',    'Up to 10 iam.users, 2 orgs, 1 000 leads/month'),
  ('growth',     'Up to 50 iam.users, 10 orgs, 10 000 leads/month, AI scoring'),
  ('enterprise', 'Unlimited iam.users and orgs, dedicated support, custom SLA')
ON CONFLICT (name) DO NOTHING;

INSERT INTO crm.lead_sources (name) VALUES
  ('facebook'),('google'),('instagram'),('whatsapp'),('website_form'),
  ('referral'),('walk_in'),('cold_call'),('other')
ON CONFLICT (name) DO NOTHING;


-- ===================================================================
-- SCHEMA VERSION TRACKING (Meta CAPI additions)
-- ===================================================================

INSERT INTO public.schema_versions (version, description) VALUES
  ('1.2.0', 'Meta Conversion API: ext.meta_org_config, ext.meta_leads, ext.meta_lead_custom_fields, ext.meta_capi_outbound_logs')
ON CONFLICT (version) DO NOTHING;

INSERT INTO public.schema_versions (version, description) VALUES
  ('1.3.0', 'Meta Conversion API: ext.meta_lead_addresses, ext.meta_lead_professional, ext.meta_lead_demographics, ext.meta_org_config.field_mappings, extended ext.view_meta_leads_complete')
ON CONFLICT (version) DO NOTHING;
