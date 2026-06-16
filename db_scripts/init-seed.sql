-- ===================================================================
-- CRM Monorepo — Demo Seed Data
-- Run AFTER init-db.sql (schema + lookup seeds).
-- Covers: 2 tenants, 4 orgs, 31 users (all role levels),
--         8 ad campaigns, 36 leads, interactions, follow-ups, history.
-- All demo accounts password: Admin@123
-- Hash (bcrypt cost 12): $2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE throughout.
-- ===================================================================

SET client_encoding = 'UTF8';
BEGIN;

-- service_role bypasses RLS for cross-org seed writes.
SET LOCAL ROLE service_role;

-- ============================================================
-- TENANTS (2)
-- ============================================================
INSERT INTO tenants (id, name, domain_id, plan_type_id, metadata, is_active)
VALUES
    (
        'a1000000-0000-0000-0000-000000000001',
        'FitClass',
        (SELECT id FROM tenant_domains    WHERE name = 'fitness'),
        (SELECT id FROM tenant_plan_types WHERE name = 'growth'),
        '{"brand_color":"#E84B1A","whatsapp_number":"+91-9810001001","features":{"ai_lead_scoring":true,"bulk_sms":true}}',
        TRUE
    ),
    (
        'a2000000-0000-0000-0000-000000000001',
        'Velvet Boutique',
        (SELECT id FROM tenant_domains    WHERE name = 'retail'),
        (SELECT id FROM tenant_plan_types WHERE name = 'starter'),
        '{"brand_color":"#9B59B6","instagram_handle":"@velvetboutique_in","features":{"ai_lead_scoring":false,"bulk_sms":false}}',
        TRUE
    )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ORGANIZATIONS (4)
-- ============================================================
INSERT INTO organizations
    (id, tenant_id, name, org_type_id,
     address_line1, address_line2, landmark, pincode,
     city_id, state_id, country_id,
     timezone, metadata, is_active)
VALUES
    (
        'b1000000-0000-0000-0000-000000000001',
        'a1000000-0000-0000-0000-000000000001',
        'FitClass - Connaught Place',
        (SELECT id FROM org_types WHERE name = 'gym_location'),
        'A-12, Barakhamba Road', 'Basement Level', 'Near Statesman House', '110001',
        (SELECT id FROM cities  WHERE name = 'Connaught Place'),
        (SELECT id FROM states  WHERE name = 'Delhi'),
        (SELECT id FROM countries WHERE iso_code = 'IN'),
        'Asia/Kolkata',
        '{"capacity":250,"equipment_tier":"premium","manager_phone":"+91-9811001001"}',
        TRUE
    ),
    (
        'b1000000-0000-0000-0000-000000000002',
        'a1000000-0000-0000-0000-000000000001',
        'FitClass - Saket',
        (SELECT id FROM org_types WHERE name = 'gym_location'),
        'Shop 14, MGF Metropolitan Mall', 'Ground Floor', 'Near Select Citywalk', '110017',
        (SELECT id FROM cities  WHERE name = 'Saket'),
        (SELECT id FROM states  WHERE name = 'Delhi'),
        (SELECT id FROM countries WHERE iso_code = 'IN'),
        'Asia/Kolkata',
        '{"capacity":180,"equipment_tier":"standard","manager_phone":"+91-9811002001"}',
        TRUE
    ),
    (
        'b2000000-0000-0000-0000-000000000001',
        'a2000000-0000-0000-0000-000000000001',
        'Velvet Boutique - Khan Market',
        (SELECT id FROM org_types WHERE name = 'branch'),
        '32 Middle Lane, Khan Market', NULL, 'Near Airtel Store', '110003',
        (SELECT id FROM cities  WHERE name = 'New Delhi'),
        (SELECT id FROM states  WHERE name = 'Delhi'),
        (SELECT id FROM countries WHERE iso_code = 'IN'),
        'Asia/Kolkata',
        '{"floor_area_sqft":800,"speciality":"ethnic_wear","pos_terminal_id":"KM-POS-001"}',
        TRUE
    ),
    (
        'b2000000-0000-0000-0000-000000000002',
        'a2000000-0000-0000-0000-000000000001',
        'Velvet Boutique - Lajpat Nagar',
        (SELECT id FROM org_types WHERE name = 'branch'),
        'Shop 7B, Central Market', 'First Floor', 'Near Punjab National Bank', '110024',
        (SELECT id FROM cities  WHERE name = 'Lajpat Nagar'),
        (SELECT id FROM states  WHERE name = 'Delhi'),
        (SELECT id FROM countries WHERE iso_code = 'IN'),
        'Asia/Kolkata',
        '{"floor_area_sqft":650,"speciality":"fusion_wear","pos_terminal_id":"LN-POS-001"}',
        TRUE
    )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- USERS — 1 super_admin + 2 tenant_admins + 7 per org = 31 total
-- Hierarchy per org: org_admin → org_sr_manager → org_manager
--                    → senior_sales_executive → sales_representative (×2)
--                    read_only has no manager.
-- INSERT per rank level ensures self-referential FK ordering.
-- ============================================================

-- ── Super Admin ───────────────────────────────────────────────────────────
SET LOCAL app.current_org_id  = 'b1000000-0000-0000-0000-000000000001';
SET LOCAL app.current_user_id = 'c0000000-0000-0000-0000-000000000001';

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
     'Root', 'User', '+919900000000', 'root.user@root.com',
     (SELECT id FROM user_roles WHERE name = 'super_admin'), NULL,
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

-- ── Tenant Admins ─────────────────────────────────────────────────────────
SET LOCAL app.current_org_id  = 'b1000000-0000-0000-0000-000000000001';
SET LOCAL app.current_user_id = 'c1000000-0000-0000-0000-000000000001';

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
     'Nisha', 'Goyal', '+919900001001', 'nisha.goyal@fitclass.in',
     (SELECT id FROM user_roles WHERE name = 'tenant_admin'), NULL,
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

SET LOCAL app.current_org_id  = 'b2000000-0000-0000-0000-000000000001';
SET LOCAL app.current_user_id = 'c2000000-0000-0000-0000-000000000001';

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
     'Kavya', 'Aroraa', '+919900002001', 'kavya.aroraa@velvetboutique.in',
     (SELECT id FROM user_roles WHERE name = 'tenant_admin'), NULL,
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

-- ── FitClass — Connaught Place ────────────────────────────────────────────
SET LOCAL app.current_org_id  = 'b1000000-0000-0000-0000-000000000001';
SET LOCAL app.current_user_id = 'c1100000-0000-0000-0000-000000000001';

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c1100000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
     'Vikram', 'Malhotra', '+919811001001', 'vikram.malhotra@apexcp.in',
     (SELECT id FROM user_roles WHERE name = 'org_admin'), NULL,
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c1100000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001',
     'Mohan', 'Das', '+919811001004', 'mohan.das@apexcp.in',
     (SELECT id FROM user_roles WHERE name = 'org_sr_manager'), 'c1100000-0000-0000-0000-000000000001',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c1100000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000001',
     'Geeta', 'Krishnan', '+919811001005', 'geeta.krishnan@apexcp.in',
     (SELECT id FROM user_roles WHERE name = 'org_manager'), 'c1100000-0000-0000-0000-000000000004',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c1100000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000001',
     'Akash', 'Mehta', '+919811001006', 'akash.mehta@apexcp.in',
     (SELECT id FROM user_roles WHERE name = 'senior_sales_executive'), 'c1100000-0000-0000-0000-000000000005',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c1100000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001',
     'Priya', 'Kapoor', '+919811001002', 'priya.kapoor@apexcp.in',
     (SELECT id FROM user_roles WHERE name = 'sales_representative'), 'c1100000-0000-0000-0000-000000000006',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE),
    ('c1100000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001',
     'Rahul', 'Singh', '+919811001003', 'rahul.singh@apexcp.in',
     (SELECT id FROM user_roles WHERE name = 'sales_representative'), 'c1100000-0000-0000-0000-000000000006',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE),
    ('c1100000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000001',
     'Sunita', 'Rao', '+919811001007', 'sunita.rao@apexcp.in',
     (SELECT id FROM user_roles WHERE name = 'read_only'), NULL,
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

-- ── FitClass — Saket ──────────────────────────────────────────────────────
SET LOCAL app.current_org_id  = 'b1000000-0000-0000-0000-000000000002';
SET LOCAL app.current_user_id = 'c1200000-0000-0000-0000-000000000001';

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c1200000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002',
     'Ananya', 'Verma', '+919811002001', 'ananya.verma@apexskt.in',
     (SELECT id FROM user_roles WHERE name = 'org_admin'), NULL,
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c1200000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000002',
     'Divya', 'Menon', '+919811002004', 'divya.menon@apexskt.in',
     (SELECT id FROM user_roles WHERE name = 'org_sr_manager'), 'c1200000-0000-0000-0000-000000000001',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c1200000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000002',
     'Suresh', 'Pillai', '+919811002005', 'suresh.pillai@apexskt.in',
     (SELECT id FROM user_roles WHERE name = 'org_manager'), 'c1200000-0000-0000-0000-000000000004',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c1200000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000002',
     'Neha', 'Saxena', '+919811002006', 'neha.saxena@apexskt.in',
     (SELECT id FROM user_roles WHERE name = 'senior_sales_executive'), 'c1200000-0000-0000-0000-000000000005',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c1200000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002',
     'Kunal', 'Sharma', '+919811002002', 'kunal.sharma@apexskt.in',
     (SELECT id FROM user_roles WHERE name = 'sales_representative'), 'c1200000-0000-0000-0000-000000000006',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE),
    ('c1200000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002',
     'Sneha', 'Reddy', '+919811002003', 'sneha.reddy@apexskt.in',
     (SELECT id FROM user_roles WHERE name = 'sales_representative'), 'c1200000-0000-0000-0000-000000000006',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE),
    ('c1200000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000002',
     'Karthik', 'Nair', '+919811002007', 'karthik.nair@apexskt.in',
     (SELECT id FROM user_roles WHERE name = 'read_only'), NULL,
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

-- ── Velvet Boutique — Khan Market ─────────────────────────────────────────
SET LOCAL app.current_org_id  = 'b2000000-0000-0000-0000-000000000001';
SET LOCAL app.current_user_id = 'c2100000-0000-0000-0000-000000000001';

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c2100000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
     'Rajan', 'Mehta', '+919811003001', 'rajan.mehta@velvetkm.in',
     (SELECT id FROM user_roles WHERE name = 'org_admin'), NULL,
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c2100000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-000000000001',
     'Pradeep', 'Varma', '+919811003004', 'pradeep.varma@velvetkm.in',
     (SELECT id FROM user_roles WHERE name = 'org_sr_manager'), 'c2100000-0000-0000-0000-000000000001',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c2100000-0000-0000-0000-000000000005', 'b2000000-0000-0000-0000-000000000001',
     'Sheetal', 'Bansal', '+919811003005', 'sheetal.bansal@velvetkm.in',
     (SELECT id FROM user_roles WHERE name = 'org_manager'), 'c2100000-0000-0000-0000-000000000004',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c2100000-0000-0000-0000-000000000006', 'b2000000-0000-0000-0000-000000000001',
     'Vivek', 'Nanda', '+919811003006', 'vivek.nanda@velvetkm.in',
     (SELECT id FROM user_roles WHERE name = 'senior_sales_executive'), 'c2100000-0000-0000-0000-000000000005',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c2100000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000001',
     'Pooja', 'Agarwal', '+919811003002', 'pooja.agarwal@velvetkm.in',
     (SELECT id FROM user_roles WHERE name = 'sales_representative'), 'c2100000-0000-0000-0000-000000000006',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE),
    ('c2100000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000001',
     'Amit', 'Joshi', '+919811003003', 'amit.joshi@velvetkm.in',
     (SELECT id FROM user_roles WHERE name = 'sales_representative'), 'c2100000-0000-0000-0000-000000000006',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE),
    ('c2100000-0000-0000-0000-000000000007', 'b2000000-0000-0000-0000-000000000001',
     'Lakshmi', 'Choudhary', '+919811003007', 'lakshmi.choudhary@velvetkm.in',
     (SELECT id FROM user_roles WHERE name = 'read_only'), NULL,
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

-- ── Velvet Boutique — Lajpat Nagar ───────────────────────────────────────
SET LOCAL app.current_org_id  = 'b2000000-0000-0000-0000-000000000002';
SET LOCAL app.current_user_id = 'c2200000-0000-0000-0000-000000000001';

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c2200000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002',
     'Deepa', 'Nair', '+919811004001', 'deepa.nair@velvetln.in',
     (SELECT id FROM user_roles WHERE name = 'org_admin'), NULL,
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c2200000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-000000000002',
     'Sanjay', 'Tiwari', '+919811004004', 'sanjay.tiwari@velvetln.in',
     (SELECT id FROM user_roles WHERE name = 'org_sr_manager'), 'c2200000-0000-0000-0000-000000000001',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c2200000-0000-0000-0000-000000000005', 'b2000000-0000-0000-0000-000000000002',
     'Anita', 'Chauhan', '+919811004005', 'anita.chauhan@velvetln.in',
     (SELECT id FROM user_roles WHERE name = 'org_manager'), 'c2200000-0000-0000-0000-000000000004',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c2200000-0000-0000-0000-000000000006', 'b2000000-0000-0000-0000-000000000002',
     'Pankaj', 'Kumar', '+919811004006', 'pankaj.kumar@velvetln.in',
     (SELECT id FROM user_roles WHERE name = 'senior_sales_executive'), 'c2200000-0000-0000-0000-000000000005',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

INSERT INTO users (id, org_id, first_name, last_name, mobile, email, role_id, manager_id, password_hash, is_active, force_password_change)
VALUES
    ('c2200000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002',
     'Rohit', 'Gupta', '+919811004002', 'rohit.gupta@velvetln.in',
     (SELECT id FROM user_roles WHERE name = 'sales_representative'), 'c2200000-0000-0000-0000-000000000006',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE),
    ('c2200000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000002',
     'Meera', 'Pillai', '+919811004003', 'meera.pillai@velvetln.in',
     (SELECT id FROM user_roles WHERE name = 'sales_representative'), 'c2200000-0000-0000-0000-000000000006',
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE),
    ('c2200000-0000-0000-0000-000000000007', 'b2000000-0000-0000-0000-000000000002',
     'Asha', 'Tomar', '+919811004007', 'asha.tomar@velvetln.in',
     (SELECT id FROM user_roles WHERE name = 'read_only'), NULL,
     '$2b$12$djVQZqY0qvW5NCeJifECh.lqlfRuKRr1ejEPzqPRYcEOv7pIeApc6', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET
    mobile = EXCLUDED.mobile, manager_id = EXCLUDED.manager_id, password_hash = EXCLUDED.password_hash;

-- ============================================================
-- AD CAMPAIGNS (2 per org = 8 total)
-- ============================================================
INSERT INTO ad_campaigns (id, org_id, name, platform_id, status_id, budget, started_at, ended_at)
VALUES
    ('d1100000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001',
     'Iron Body Transformation - FB Q2',
     (SELECT id FROM marketing_platforms WHERE name='facebook'),
     (SELECT id FROM campaign_statuses   WHERE name='active'),
     45000.00,'2024-04-01 00:00:00+05:30',NULL),

    ('d1100000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001',
     'Apex CP Google Search Branded',
     (SELECT id FROM marketing_platforms WHERE name='google'),
     (SELECT id FROM campaign_statuses   WHERE name='paused'),
     18000.00,'2024-03-01 00:00:00+05:30',NULL),

    ('d1200000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002',
     'Apex Saket - Summer Fitness FB',
     (SELECT id FROM marketing_platforms WHERE name='facebook'),
     (SELECT id FROM campaign_statuses   WHERE name='active'),
     35000.00,'2024-05-01 00:00:00+05:30',NULL),

    ('d1200000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000002',
     'Apex Saket Google Display Q1',
     (SELECT id FROM marketing_platforms WHERE name='google'),
     (SELECT id FROM campaign_statuses   WHERE name='completed'),
     22000.00,'2024-01-10 00:00:00+05:30','2024-03-31 23:59:59+05:30'),

    ('d2100000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001',
     'Velvet KM - Festive Flash Sale FB',
     (SELECT id FROM marketing_platforms WHERE name='facebook'),
     (SELECT id FROM campaign_statuses   WHERE name='active'),
     28000.00,'2024-04-15 00:00:00+05:30',NULL),

    ('d2100000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000001',
     'Velvet KM Kurta Google Shopping',
     (SELECT id FROM marketing_platforms WHERE name='google'),
     (SELECT id FROM campaign_statuses   WHERE name='active'),
     20000.00,'2024-04-20 00:00:00+05:30',NULL),

    ('d2200000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002',
     'Velvet LN - Monsoon Collection FB',
     (SELECT id FROM marketing_platforms WHERE name='facebook'),
     (SELECT id FROM campaign_statuses   WHERE name='draft'),
     15000.00,NULL,NULL),

    ('d2200000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000002',
     'Velvet LN Google Ads - Ethnic',
     (SELECT id FROM marketing_platforms WHERE name='google'),
     (SELECT id FROM campaign_statuses   WHERE name='active'),
     18500.00,'2024-05-10 00:00:00+05:30',NULL)

ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- MARKETING LEADS — FitClass, Connaught Place (9 leads)
-- ============================================================
INSERT INTO marketing_leads
    (id, org_id,
     first_name, middle_name, last_name,
     phone, email,
     address_line1, landmark, pincode, city_id, state_id, country_id,
     campaign_id, stage_id, outcome_id, assigned_user_id,
     raw_webhook_data, metadata, tags, created_at)
VALUES
    ('e1100000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001',
     'Riya',NULL,'Sharma',
     '+91-9876543210','riya.sharma@gmail.com',
     NULL,NULL,NULL,
     (SELECT id FROM cities WHERE name='New Delhi'),
     (SELECT id FROM states WHERE name='Delhi'),
     (SELECT id FROM countries WHERE iso_code='IN'),
     'd1100000-0000-0000-0000-000000000001',
     (SELECT id FROM lead_stage WHERE name='new'),
     NULL,NULL,
     '{"form_id":"fb_form_apex_cp_001","page_id":"pg_apex_iron_gym","lead_gen_id":"lg_10001","field_data":[{"name":"full_name","values":["Riya Sharma"]},{"name":"phone_number","values":["+91-9876543210"]},{"name":"email","values":["riya.sharma@gmail.com"]},{"name":"interest","values":["Weight Loss Program"]}]}',
     '{"goal":"weight_loss","preferred_timing":"morning","referred_by":"instagram_story","fitness_level":"beginner"}',
     ARRAY['high_value','trial_requested'],'2024-05-20 09:15:00+05:30'),

    ('e1100000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001',
     'Arjun',NULL,'Mehta',
     '+91-9812345678','arjun.mehta@outlook.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd1100000-0000-0000-0000-000000000001',
     (SELECT id FROM lead_stage WHERE name='contacting'),
     NULL,'c1100000-0000-0000-0000-000000000002',
     '{"form_id":"fb_form_apex_cp_001","page_id":"pg_apex_iron_gym","lead_gen_id":"lg_10002","field_data":[{"name":"full_name","values":["Arjun Mehta"]},{"name":"phone_number","values":["+91-9812345678"]},{"name":"email","values":["arjun.mehta@outlook.com"]},{"name":"interest","values":["Muscle Building"]}]}',
     '{"goal":"muscle_gain","preferred_timing":"evening","fitness_level":"intermediate"}',
     ARRAY[]::TEXT[],'2024-04-15 11:00:00+05:30'),

    ('e1100000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000001',
     'Sunita',NULL,'Rao',
     '+91-9845678901','sunita.rao@yahoo.com',
     'B-47 Vasant Vihar','Near Priya Cinema','110057',
     (SELECT id FROM cities WHERE name='New Delhi'),
     (SELECT id FROM states WHERE name='Delhi'),
     (SELECT id FROM countries WHERE iso_code='IN'),
     'd1100000-0000-0000-0000-000000000002',
     (SELECT id FROM lead_stage WHERE name='qualified'),
     NULL,'c1100000-0000-0000-0000-000000000003',
     '{"source":"google_search","keyword":"gym near connaught place","device":"mobile"}',
     '{"goal":"overall_fitness","preferred_timing":"morning","sessions_per_week":5}',
     ARRAY['premium_interest'],'2024-03-10 14:30:00+05:30'),

    ('e1100000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000001',
     'Devesh',NULL,'Kumar',
     '+91-9867890123','devesh.kumar@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd1100000-0000-0000-0000-000000000001',
     (SELECT id FROM lead_stage WHERE name='converted'),
     NULL,'c1100000-0000-0000-0000-000000000002',
     '{"form_id":"fb_form_apex_cp_001","page_id":"pg_apex_iron_gym","lead_gen_id":"lg_10004","field_data":[{"name":"full_name","values":["Devesh Kumar"]},{"name":"phone_number","values":["+91-9867890123"]},{"name":"interest","values":["Annual Membership"]}]}',
     '{"goal":"weight_loss","membership_type":"annual","payment_mode":"upi","converted_amount":18000}',
     ARRAY['converted_q1','annual_member'],'2024-01-25 10:00:00+05:30'),

    ('e1100000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000001',
     'Kavya',NULL,'Nair',
     '+91-9898765432',NULL,
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd1100000-0000-0000-0000-000000000002',
     (SELECT id FROM lead_stage WHERE name='unqualified'),
     (SELECT lso.id FROM lead_stage_outcome lso JOIN lead_stage ls ON ls.id = lso.stage_id WHERE lso.name='wrong_number' AND ls.name='unqualified'),
     'c1100000-0000-0000-0000-000000000003',
     '{"source":"google_search","keyword":"best gym new delhi","device":"desktop"}',
     '{}',ARRAY[]::TEXT[],'2024-02-10 16:45:00+05:30'),

    ('e1100000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000001',
     'Manish',NULL,'Tripathi',
     '+91-9823456789','manish.tripathi@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     NULL,
     (SELECT id FROM lead_stage WHERE name='contacting'),
     NULL,NULL,
     '{"source":"website_form","page":"/contact","utm_source":"organic"}',
     '{"goal":"muscle_gain","preferred_timing":"afternoon","on_hold_reason":"relocating_in_3_months"}',
     ARRAY[]::TEXT[],'2024-05-01 13:20:00+05:30'),

    ('e1100000-0000-0000-0000-000000000007','b1000000-0000-0000-0000-000000000001',
     'Priti',NULL,'Sharma',
     '+91-9834567890','priti.sharma@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd1100000-0000-0000-0000-000000000001',
     (SELECT id FROM lead_stage WHERE name='contacting'),
     NULL,'c1100000-0000-0000-0000-000000000002',
     '{"form_id":"fb_form_apex_cp_001","lead_gen_id":"lg_10007","field_data":[{"name":"full_name","values":["Priti Sharma"]},{"name":"interest","values":["Zumba Classes"]}]}',
     '{"goal":"flexibility","preferred_timing":"morning","nurture_reason":"budget_finalising"}',
     ARRAY['re_engagement','trial_requested'],'2024-04-25 09:50:00+05:30'),

    ('e1100000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000001',
     'Vikash',NULL,'Gupta',
     '+91-9856789012','vikash.gupta@hotmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     NULL,
     (SELECT id FROM lead_stage WHERE name='new'),
     NULL,NULL,
     '{"source":"whatsapp_enquiry","message":"Hi, wanted to know about gym membership"}',
     '{}',ARRAY[]::TEXT[],'2024-05-28 08:35:00+05:30'),

    ('e1100000-0000-0000-0000-000000000009','b1000000-0000-0000-0000-000000000001',
     'Ananya',NULL,'Singh',
     '+91-9878901234','ananya.singh@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd1100000-0000-0000-0000-000000000002',
     (SELECT id FROM lead_stage WHERE name='contacting'),
     NULL,'c1100000-0000-0000-0000-000000000003',
     '{"source":"google_search","keyword":"gym membership connaught place price","gclid":"abc123xyz"}',
     '{"goal":"overall_fitness","referred_by_member":"Devesh Kumar","referred_by_member_id":"e1100000-0000-0000-0000-000000000004"}',
     ARRAY['high_value','vip_referral','trial_requested'],'2024-05-25 17:00:00+05:30')

ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- MARKETING LEADS — FitClass, Saket (9 leads)
-- ============================================================
INSERT INTO marketing_leads
    (id, org_id, first_name, middle_name, last_name,
     phone, email,
     address_line1, landmark, pincode, city_id, state_id, country_id,
     campaign_id, stage_id, outcome_id, assigned_user_id,
     raw_webhook_data, metadata, tags, created_at)
VALUES
    ('e1200000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002',
     'Nisha',NULL,'Bansal','+91-9901234567','nisha.bansal@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd1200000-0000-0000-0000-000000000001',
     (SELECT id FROM lead_stage WHERE name='new'),NULL,NULL,
     '{"form_id":"fb_form_apex_skt_001","lead_gen_id":"lg_s10001","field_data":[{"name":"full_name","values":["Nisha Bansal"]},{"name":"interest","values":["Trial Class"]}]}',
     '{"goal":"weight_loss","preferred_timing":"morning","fitness_level":"beginner"}',
     ARRAY['trial_requested'],'2024-05-22 10:00:00+05:30'),

    ('e1200000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000002',
     'Rajesh',NULL,'Patel','+91-9912345678','rajesh.patel@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd1200000-0000-0000-0000-000000000001',
     (SELECT id FROM lead_stage WHERE name='contacting'),NULL,
     'c1200000-0000-0000-0000-000000000002',
     '{"form_id":"fb_form_apex_skt_001","lead_gen_id":"lg_s10002","field_data":[{"name":"full_name","values":["Rajesh Patel"]},{"name":"interest","values":["Strength Training"]}]}',
     '{"goal":"muscle_gain","preferred_timing":"evening"}',
     ARRAY[]::TEXT[],'2024-04-18 14:00:00+05:30'),

    ('e1200000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000002',
     'Sonal',NULL,'Jain','+91-9923456789','sonal.jain@outlook.com',
     'C-12 Saket Block','Near Metro Station','110017',
     (SELECT id FROM cities WHERE name='Saket'),
     (SELECT id FROM states WHERE name='Delhi'),
     (SELECT id FROM countries WHERE iso_code='IN'),
     'd1200000-0000-0000-0000-000000000002',
     (SELECT id FROM lead_stage WHERE name='qualified'),NULL,
     'c1200000-0000-0000-0000-000000000003',
     '{"source":"google_display","campaign":"Apex Saket Google Display Q1","device":"tablet"}',
     '{"goal":"overall_fitness","sessions_per_week":4,"budget_range":"15000-20000"}',
     ARRAY['premium_interest','high_value'],'2024-02-14 11:30:00+05:30'),

    ('e1200000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000002',
     'Kartik',NULL,'Agarwal','+91-9934567890','kartik.agarwal@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd1200000-0000-0000-0000-000000000001',
     (SELECT id FROM lead_stage WHERE name='converted'),NULL,
     'c1200000-0000-0000-0000-000000000002',
     '{"form_id":"fb_form_apex_skt_001","lead_gen_id":"lg_s10004","field_data":[{"name":"full_name","values":["Kartik Agarwal"]},{"name":"interest","values":["6-Month Membership"]}]}',
     '{"goal":"weight_loss","membership_type":"half_yearly","converted_amount":10500,"payment_mode":"credit_card"}',
     ARRAY['converted_q2'],'2024-04-01 09:00:00+05:30'),

    ('e1200000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000002',
     'Divya',NULL,'Krishnan','+91-9945678901','divya.krishnan@yahoo.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd1200000-0000-0000-0000-000000000002',
     (SELECT id FROM lead_stage WHERE name='unqualified'),
     (SELECT lso.id FROM lead_stage_outcome lso JOIN lead_stage ls ON ls.id = lso.stage_id WHERE lso.name='not_interested' AND ls.name='unqualified'),
     'c1200000-0000-0000-0000-000000000003',
     '{"source":"google_display","device":"mobile"}',
     '{}',ARRAY[]::TEXT[],'2024-02-20 15:00:00+05:30'),

    ('e1200000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000002',
     'Ashok',NULL,'Tiwari','+91-9956789012',NULL,
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd1200000-0000-0000-0000-000000000001',
     (SELECT id FROM lead_stage WHERE name='contacting'),NULL,NULL,
     '{"form_id":"fb_form_apex_skt_001","lead_gen_id":"lg_s10006","field_data":[{"name":"full_name","values":["Ashok Tiwari"]},{"name":"interest","values":["Yoga Classes"]}]}',
     '{"goal":"stress_relief","on_hold_reason":"travelling_abroad"}',
     ARRAY[]::TEXT[],'2024-05-05 08:00:00+05:30'),

    ('e1200000-0000-0000-0000-000000000007','b1000000-0000-0000-0000-000000000002',
     'Ritika',NULL,'Sehgal','+91-9967890123','ritika.sehgal@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,NULL,
     (SELECT id FROM lead_stage WHERE name='contacting'),NULL,
     'c1200000-0000-0000-0000-000000000002',
     '{"source":"referral","referral_code":"APEX-KA-001"}',
     '{"goal":"weight_loss","nurture_reason":"comparing_with_competitors"}',
     ARRAY['high_value','referral_lead'],'2024-05-12 12:00:00+05:30'),

    ('e1200000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000002',
     'Suresh',NULL,'Yadav','+91-9978901234','suresh.yadav@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd1200000-0000-0000-0000-000000000001',
     (SELECT id FROM lead_stage WHERE name='new'),NULL,NULL,
     '{"form_id":"fb_form_apex_skt_001","lead_gen_id":"lg_s10008","field_data":[{"name":"interest","values":["Personal Training"]}]}',
     '{}',ARRAY[]::TEXT[],'2024-05-27 16:30:00+05:30'),

    ('e1200000-0000-0000-0000-000000000009','b1000000-0000-0000-0000-000000000002',
     'Meghna',NULL,'Chopra','+91-9989012345','meghna.chopra@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,NULL,
     (SELECT id FROM lead_stage WHERE name='contacting'),NULL,
     'c1200000-0000-0000-0000-000000000003',
     '{"source":"website_form","utm_source":"referral","utm_medium":"existing_member"}',
     '{"goal":"cardio_fitness","sessions_per_week":3}',
     ARRAY['referral_lead','trial_requested'],'2024-05-18 10:45:00+05:30')

ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- MARKETING LEADS — Velvet Boutique, Khan Market (9 leads)
-- ============================================================
INSERT INTO marketing_leads
    (id, org_id, first_name, middle_name, last_name,
     phone, email,
     address_line1, landmark, pincode, city_id, state_id, country_id,
     campaign_id, stage_id, outcome_id, assigned_user_id,
     raw_webhook_data, metadata, tags, created_at)
VALUES
    ('e2100000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001',
     'Ananya',NULL,'Gupta','+91-9801234567','ananya.gupta@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd2100000-0000-0000-0000-000000000001',
     (SELECT id FROM lead_stage WHERE name='new'),NULL,NULL,
     '{"form_id":"fb_form_velvet_km_001","lead_gen_id":"lg_v10001","field_data":[{"name":"full_name","values":["Ananya Gupta"]},{"name":"interest","values":["Festive Kurta Collection"]}]}',
     '{"product_interest":"kurta_sets","size_preference":"M","budget_range":"3000-6000","occasion":"wedding_season"}',
     ARRAY['high_value','festive_interest'],'2024-05-21 11:00:00+05:30'),

    ('e2100000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000001',
     'Isha',NULL,'Khanna','+91-9813456789','isha.khanna@outlook.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd2100000-0000-0000-0000-000000000001',
     (SELECT id FROM lead_stage WHERE name='contacting'),NULL,
     'c2100000-0000-0000-0000-000000000002',
     '{"form_id":"fb_form_velvet_km_001","lead_gen_id":"lg_v10002","field_data":[{"name":"interest","values":["Palazzo Sets"]}]}',
     '{"product_interest":"palazzo_sets","size_preference":"L","budget_range":"2000-4000"}',
     ARRAY[]::TEXT[],'2024-04-20 14:00:00+05:30'),

    ('e2100000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000001',
     'Sonali',NULL,'Kapoor','+91-9825678901','sonali.kapoor@gmail.com',
     'F-5 Golf Links','Near Khan Market','110003',
     (SELECT id FROM cities WHERE name='New Delhi'),
     (SELECT id FROM states WHERE name='Delhi'),
     (SELECT id FROM countries WHERE iso_code='IN'),
     'd2100000-0000-0000-0000-000000000002',
     (SELECT id FROM lead_stage WHERE name='qualified'),NULL,
     'c2100000-0000-0000-0000-000000000003',
     '{"source":"google_shopping","query":"buy kurta sets online delhi"}',
     '{"product_interest":"saree_blouses","size_preference":"S","budget_range":"4000-8000","style_preference":"contemporary"}',
     ARRAY['premium_interest','high_value'],'2024-04-22 10:30:00+05:30'),

    ('e2100000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000001',
     'Neha',NULL,'Sharma','+91-9837890123','neha.sharma@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd2100000-0000-0000-0000-000000000001',
     (SELECT id FROM lead_stage WHERE name='converted'),NULL,
     'c2100000-0000-0000-0000-000000000002',
     '{"form_id":"fb_form_velvet_km_001","lead_gen_id":"lg_v10004","field_data":[{"name":"interest","values":["Bridal Lehenga Consultation"]}]}',
     '{"product_interest":"bridal_lehenga","size_preference":"M","budget_range":"25000-50000","converted_order_value":38000}',
     ARRAY['converted_premium','bridal'],'2024-03-05 09:00:00+05:30'),

    ('e2100000-0000-0000-0000-000000000005','b2000000-0000-0000-0000-000000000001',
     'Sundar',NULL,'Iyer','+91-9849012345','sundar.iyer@yahoo.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd2100000-0000-0000-0000-000000000002',
     (SELECT id FROM lead_stage WHERE name='unqualified'),
     (SELECT lso.id FROM lead_stage_outcome lso JOIN lead_stage ls ON ls.id = lso.stage_id WHERE lso.name='budget_issue' AND ls.name='unqualified'),
     'c2100000-0000-0000-0000-000000000003',
     '{"source":"google_shopping","query":"designer kurta sets delhi price"}',
     '{}',ARRAY[]::TEXT[],'2024-04-25 16:00:00+05:30'),

    ('e2100000-0000-0000-0000-000000000006','b2000000-0000-0000-0000-000000000001',
     'Priyanka',NULL,'Dubey','+91-9861234567',NULL,
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd2100000-0000-0000-0000-000000000001',
     (SELECT id FROM lead_stage WHERE name='contacting'),NULL,NULL,
     '{"form_id":"fb_form_velvet_km_001","lead_gen_id":"lg_v10006","field_data":[{"name":"interest","values":["Casual Kurtis"]}]}',
     '{"product_interest":"casual_kurtis","size_preference":"XL","on_hold_reason":"waiting_for_salary_credit"}',
     ARRAY[]::TEXT[],'2024-05-10 12:00:00+05:30'),

    ('e2100000-0000-0000-0000-000000000007','b2000000-0000-0000-0000-000000000001',
     'Kavita',NULL,'Menon','+91-9873456789','kavita.menon@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,NULL,
     (SELECT id FROM lead_stage WHERE name='contacting'),NULL,
     'c2100000-0000-0000-0000-000000000002',
     '{"source":"instagram_story","utm_campaign":"festive_2024"}',
     '{"product_interest":"indo_western","size_preference":"M","nurture_reason":"comparing_prices"}',
     ARRAY['re_engagement','festive_interest'],'2024-05-08 11:30:00+05:30'),

    ('e2100000-0000-0000-0000-000000000008','b2000000-0000-0000-0000-000000000001',
     'Tarun',NULL,'Bhatia','+91-9885678901','tarun.bhatia@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,NULL,
     (SELECT id FROM lead_stage WHERE name='new'),NULL,NULL,
     '{"source":"website_form","utm_source":"organic"}',
     '{}',ARRAY[]::TEXT[],'2024-05-29 09:45:00+05:30'),

    ('e2100000-0000-0000-0000-000000000009','b2000000-0000-0000-0000-000000000001',
     'Pallavi',NULL,'Srivastava','+91-9897890123','pallavi.srivastava@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd2100000-0000-0000-0000-000000000002',
     (SELECT id FROM lead_stage WHERE name='contacting'),NULL,
     'c2100000-0000-0000-0000-000000000003',
     '{"source":"google_shopping","query":"best boutique khan market","device":"mobile"}',
     '{"product_interest":"anarkali_suits","size_preference":"S","budget_range":"3000-7000"}',
     ARRAY['high_value'],'2024-05-24 15:00:00+05:30')

ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- MARKETING LEADS — Velvet Boutique, Lajpat Nagar (9 leads)
-- ============================================================
INSERT INTO marketing_leads
    (id, org_id, first_name, middle_name, last_name,
     phone, email,
     address_line1, landmark, pincode, city_id, state_id, country_id,
     campaign_id, stage_id, outcome_id, assigned_user_id,
     raw_webhook_data, metadata, tags, created_at)
VALUES
    ('e2200000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002',
     'Rekha',NULL,'Tiwari','+91-9791234567','rekha.tiwari@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,NULL,
     (SELECT id FROM lead_stage WHERE name='new'),NULL,NULL,
     '{"source":"instagram_story","utm_campaign":"monsoon_collection"}',
     '{"product_interest":"cotton_kurtis","size_preference":"L","budget_range":"1500-3000"}',
     ARRAY['trial_requested','festive_interest'],'2024-05-26 10:00:00+05:30'),

    ('e2200000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000002',
     'Aarav',NULL,'Sharma','+91-9812345670','aarav.sharma@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd2200000-0000-0000-0000-000000000002',
     (SELECT id FROM lead_stage WHERE name='contacting'),NULL,
     'c2200000-0000-0000-0000-000000000002',
     '{"source":"google_ads","keyword":"boutique lajpat nagar","device":"mobile"}',
     '{"product_interest":"mens_kurta","size_preference":"42","budget_range":"2000-5000"}',
     ARRAY[]::TEXT[],'2024-05-15 13:00:00+05:30'),

    ('e2200000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000002',
     'Vidya',NULL,'Nambiar','+91-9823456780','vidya.nambiar@outlook.com',
     'H-3 Andrews Ganj','Near Lajpat Nagar Metro','110049',
     (SELECT id FROM cities WHERE name='Lajpat Nagar'),
     (SELECT id FROM states WHERE name='Delhi'),
     (SELECT id FROM countries WHERE iso_code='IN'),
     'd2200000-0000-0000-0000-000000000002',
     (SELECT id FROM lead_stage WHERE name='qualified'),NULL,
     'c2200000-0000-0000-0000-000000000003',
     '{"source":"google_ads","keyword":"designer sarees lajpat nagar"}',
     '{"product_interest":"kanjeevaram_sarees","size_preference":"free_size","budget_range":"8000-15000","style_preference":"traditional"}',
     ARRAY['premium_interest'],'2024-04-10 11:00:00+05:30'),

    ('e2200000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000002',
     'Shruti',NULL,'Pandey','+91-9834567801','shruti.pandey@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd2200000-0000-0000-0000-000000000002',
     (SELECT id FROM lead_stage WHERE name='converted'),NULL,
     'c2200000-0000-0000-0000-000000000002',
     '{"source":"google_ads","keyword":"buy lehenga lajpat nagar","gclid":"ln_gclid_004"}',
     '{"product_interest":"lehenga_choli","size_preference":"M","budget_range":"10000-20000","converted_order_value":15500}',
     ARRAY['converted_premium'],'2024-03-20 09:30:00+05:30'),

    ('e2200000-0000-0000-0000-000000000005','b2000000-0000-0000-0000-000000000002',
     'Manav',NULL,'Khanna','+91-9845678012',NULL,
     NULL,NULL,NULL,NULL,NULL,NULL,NULL,
     (SELECT id FROM lead_stage WHERE name='unqualified'),
     (SELECT lso.id FROM lead_stage_outcome lso JOIN lead_stage ls ON ls.id = lso.stage_id WHERE lso.name='no_response_after_multiple_attempts' AND ls.name='unqualified'),
     'c2200000-0000-0000-0000-000000000003',
     '{"source":"website_form","utm_source":"organic"}',
     '{}',ARRAY[]::TEXT[],'2024-03-28 17:00:00+05:30'),

    ('e2200000-0000-0000-0000-000000000006','b2000000-0000-0000-0000-000000000002',
     'Swati',NULL,'Arora','+91-9856789023','swati.arora@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,NULL,
     (SELECT id FROM lead_stage WHERE name='contacting'),NULL,NULL,
     '{"source":"referral","referral_note":"friend_of_Shruti_Pandey"}',
     '{"product_interest":"party_wear","on_hold_reason":"waiting_for_stock_restock"}',
     ARRAY[]::TEXT[],'2024-05-02 14:00:00+05:30'),

    ('e2200000-0000-0000-0000-000000000007','b2000000-0000-0000-0000-000000000002',
     'Karan',NULL,'Malhotra','+91-9867890234','karan.malhotra@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd2200000-0000-0000-0000-000000000002',
     (SELECT id FROM lead_stage WHERE name='contacting'),NULL,
     'c2200000-0000-0000-0000-000000000002',
     '{"source":"google_ads","keyword":"sherwani lajpat nagar price"}',
     '{"product_interest":"sherwani_set","size_preference":"40","budget_range":"8000-12000","nurture_reason":"comparing_fabrics"}',
     ARRAY['high_value','festive_interest'],'2024-04-28 10:15:00+05:30'),

    ('e2200000-0000-0000-0000-000000000008','b2000000-0000-0000-0000-000000000002',
     'Deepika',NULL,'Roy','+91-9878901245','deepika.roy@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,
     'd2200000-0000-0000-0000-000000000002',
     (SELECT id FROM lead_stage WHERE name='new'),NULL,NULL,
     '{"source":"google_ads","keyword":"boutique near lajpat nagar metro","device":"mobile"}',
     '{}',ARRAY[]::TEXT[],'2024-05-28 11:00:00+05:30'),

    ('e2200000-0000-0000-0000-000000000009','b2000000-0000-0000-0000-000000000002',
     'Neelam',NULL,'Dubey','+91-9889012356','neelam.dubey@gmail.com',
     NULL,NULL,NULL,NULL,NULL,NULL,NULL,
     (SELECT id FROM lead_stage WHERE name='contacting'),NULL,
     'c2200000-0000-0000-0000-000000000003',
     '{"source":"whatsapp_enquiry","message":"Interested in cotton salwar kameez sets"}',
     '{"product_interest":"salwar_kameez","size_preference":"XL","budget_range":"1500-3500"}',
     ARRAY['referral_lead','trial_requested'],'2024-05-20 14:10:00+05:30')

ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- LEAD INTERACTIONS
-- ============================================================
INSERT INTO lead_interactions
    (id, org_id, lead_id, user_id, interaction_type_id, notes, duration_seconds, occurred_at)
VALUES
    ('f1100000-0000-0000-0001-000000000001','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000001','c1100000-0000-0000-0000-000000000001',
     (SELECT id FROM interaction_types WHERE name='whatsapp'),
     'Welcome WhatsApp sent. Lead acknowledged and asked for morning batch timings.',NULL,
     '2024-05-20 09:30:00+05:30'),
    ('f1100000-0000-0000-0001-000000000002','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000001','c1100000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='call'),
     'Introduced Weight Loss Program. Lead interested in 6 AM batch. Shared fee structure.',210,
     '2024-05-21 10:15:00+05:30'),

    ('f1100000-0000-0000-0002-000000000001','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000002','c1100000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='whatsapp'),
     'Welcome message sent. Lead replied asking about evening slots and PT add-on.',NULL,
     '2024-04-15 11:30:00+05:30'),
    ('f1100000-0000-0000-0002-000000000002','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000002','c1100000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='call'),
     'Discussed muscle building program and PT add-on pricing. Lead asked for pricing PDF.',255,
     '2024-04-16 11:00:00+05:30'),
    ('f1100000-0000-0000-0002-000000000003','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000002','c1100000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='email'),
     'Sent membership pricing brochure and weekly schedule PDF. Follow-up call scheduled.',NULL,
     '2024-04-18 09:30:00+05:30'),

    ('f1100000-0000-0000-0003-000000000001','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000003','c1100000-0000-0000-0000-000000000003',
     (SELECT id FROM interaction_types WHERE name='call'),
     'First call. Lead enquired about annual membership with diet consultation. Very engaged.',320,
     '2024-03-10 15:00:00+05:30'),
    ('f1100000-0000-0000-0003-000000000002','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000003','c1100000-0000-0000-0000-000000000003',
     (SELECT id FROM interaction_types WHERE name='in_person'),
     'Lead visited for trial session. Completed 45-min strength training. Very positive feedback.',NULL,
     '2024-03-13 07:00:00+05:30'),

    ('f1100000-0000-0000-0004-000000000001','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000004','c1100000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='call'),
     'Initial contact. Lead expressed strong interest in annual membership.',340,
     '2024-01-25 15:30:00+05:30'),
    ('f1100000-0000-0000-0004-000000000002','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000004','c1100000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='in_person'),
     'Trial session completed. Lead loved equipment quality and trainer professionalism.',NULL,
     '2024-01-26 07:30:00+05:30'),
    ('f1100000-0000-0000-0004-000000000003','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000004','c1100000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='call'),
     'Membership confirmed. Annual plan Rs.18000. UPI payment received. Welcome kit dispatched.',195,
     '2024-01-27 12:00:00+05:30'),

    ('f1100000-0000-0000-0005-000000000001','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000005','c1100000-0000-0000-0000-000000000003',
     (SELECT id FROM interaction_types WHERE name='call'),
     'Called provided number — non-existent. Attempted 3 times over 2 days.',0,
     '2024-02-11 10:00:00+05:30'),
    ('f1100000-0000-0000-0005-000000000002','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000005','c1100000-0000-0000-0000-000000000003',
     (SELECT id FROM interaction_types WHERE name='email'),
     'Sent email follow-up. No bounce, no reply. Marked failed — wrong_number.',NULL,
     '2024-02-13 11:00:00+05:30'),

    ('f1100000-0000-0000-0007-000000000001','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000007','c1100000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='whatsapp'),
     'Sent Zumba class schedule and introductory offer. Lead responded positively.',NULL,
     '2024-04-25 10:00:00+05:30'),
    ('f1100000-0000-0000-0007-000000000002','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000007','c1100000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='call'),
     'Follow-up call. Lead interested but finalising budget. Decision by end of month.',175,
     '2024-05-02 11:30:00+05:30'),

    ('f1100000-0000-0000-0009-000000000001','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000009','c1100000-0000-0000-0000-000000000003',
     (SELECT id FROM interaction_types WHERE name='whatsapp'),
     'Welcome WhatsApp. Mentioned referral by existing member Devesh. Lead replied immediately.',NULL,
     '2024-05-25 17:15:00+05:30'),
    ('f1100000-0000-0000-0009-000000000002','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000009','c1100000-0000-0000-0000-000000000003',
     (SELECT id FROM interaction_types WHERE name='call'),
     'Explained annual membership and 10% referral discount. Very interested. Trial booked next week.',280,
     '2024-05-26 10:00:00+05:30'),

    ('f1200000-0000-0000-0003-000000000001','b1000000-0000-0000-0000-000000000002',
     'e1200000-0000-0000-0000-000000000003','c1200000-0000-0000-0000-000000000003',
     (SELECT id FROM interaction_types WHERE name='call'),
     'First call. Lead enquired about premium membership + personal trainer. Budget Rs.18-20K.',310,
     '2024-02-14 12:00:00+05:30'),
    ('f1200000-0000-0000-0003-000000000002','b1000000-0000-0000-0000-000000000002',
     'e1200000-0000-0000-0000-000000000003','c1200000-0000-0000-0000-000000000003',
     (SELECT id FROM interaction_types WHERE name='whatsapp'),
     'Sent annual membership + PT package brochure. Lead acknowledged.',NULL,
     '2024-02-15 09:00:00+05:30'),

    ('f1200000-0000-0000-0004-000000000001','b1000000-0000-0000-0000-000000000002',
     'e1200000-0000-0000-0000-000000000004','c1200000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='call'),
     'First call. Very motivated. Asked about half-yearly membership pricing.',290,
     '2024-04-01 10:00:00+05:30'),
    ('f1200000-0000-0000-0004-000000000002','b1000000-0000-0000-0000-000000000002',
     'e1200000-0000-0000-0000-000000000004','c1200000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='in_person'),
     'Trial class attended. Loved it. Proceeded to enrol same day.',NULL,
     '2024-04-03 07:00:00+05:30'),
    ('f1200000-0000-0000-0004-000000000003','b1000000-0000-0000-0000-000000000002',
     'e1200000-0000-0000-0000-000000000004','c1200000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='call'),
     'Half-yearly membership confirmed at Rs.10500. Credit card payment processed.',160,
     '2024-04-03 11:00:00+05:30'),

    ('f2100000-0000-0000-0003-000000000001','b2000000-0000-0000-0000-000000000001',
     'e2100000-0000-0000-0000-000000000003','c2100000-0000-0000-0000-000000000003',
     (SELECT id FROM interaction_types WHERE name='call'),
     'First call. Interested in saree blouses and contemporary kurta sets. Budget comfortable.',265,
     '2024-04-22 11:30:00+05:30'),
    ('f2100000-0000-0000-0003-000000000002','b2000000-0000-0000-0000-000000000001',
     'e2100000-0000-0000-0000-000000000003','c2100000-0000-0000-0000-000000000003',
     (SELECT id FROM interaction_types WHERE name='in_person'),
     'In-store visit. Tried 4 pieces. Very happy with quality. Taking time to decide.',NULL,
     '2024-04-25 12:00:00+05:30'),

    ('f2100000-0000-0000-0004-000000000001','b2000000-0000-0000-0000-000000000001',
     'e2100000-0000-0000-0000-000000000004','c2100000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='call'),
     'Call to discuss bridal lehenga consultation. High intent — upcoming wedding.',385,
     '2024-03-05 10:00:00+05:30'),
    ('f2100000-0000-0000-0004-000000000002','b2000000-0000-0000-0000-000000000001',
     'e2100000-0000-0000-0000-000000000004','c2100000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='in_person'),
     'Bridal consultation. Tried 6 lehenga options. Selected final design.',NULL,
     '2024-03-08 11:00:00+05:30'),
    ('f2100000-0000-0000-0004-000000000003','b2000000-0000-0000-0000-000000000001',
     'e2100000-0000-0000-0000-000000000004','c2100000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='call'),
     'Order confirmed Rs.38000. 50% advance paid. Delivery in 3 weeks.',215,
     '2024-03-08 15:00:00+05:30'),

    ('f2200000-0000-0000-0003-000000000001','b2000000-0000-0000-0000-000000000002',
     'e2200000-0000-0000-0000-000000000003','c2200000-0000-0000-0000-000000000003',
     (SELECT id FROM interaction_types WHERE name='call'),
     'First call. Enquired about Kanjeevaram sarees. Serious buyer, knows her weaves.',340,
     '2024-04-10 12:00:00+05:30'),
    ('f2200000-0000-0000-0003-000000000002','b2000000-0000-0000-0000-000000000002',
     'e2200000-0000-0000-0000-000000000003','c2200000-0000-0000-0000-000000000003',
     (SELECT id FROM interaction_types WHERE name='in_person'),
     'In-store appointment. Viewed 5 sarees. Narrowed to 2 options. Will confirm this weekend.',NULL,
     '2024-04-13 11:00:00+05:30'),

    ('f2200000-0000-0000-0004-000000000001','b2000000-0000-0000-0000-000000000002',
     'e2200000-0000-0000-0000-000000000004','c2200000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='call'),
     'Initial call. Looking for reception lehenga. Good budget range.',295,
     '2024-03-20 10:30:00+05:30'),
    ('f2200000-0000-0000-0004-000000000002','b2000000-0000-0000-0000-000000000002',
     'e2200000-0000-0000-0000-000000000004','c2200000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='in_person'),
     'Store visit. Tried 3 lehengas. Loved rose-gold embroidered piece. Ordered on the spot.',NULL,
     '2024-03-22 12:00:00+05:30'),
    ('f2200000-0000-0000-0004-000000000003','b2000000-0000-0000-0000-000000000002',
     'e2200000-0000-0000-0000-000000000004','c2200000-0000-0000-0000-000000000002',
     (SELECT id FROM interaction_types WHERE name='whatsapp'),
     'WhatsApp confirmation with order receipt. Alteration appointment booked.',NULL,
     '2024-03-22 16:00:00+05:30')

ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- LEAD FOLLOW-UPS
-- 'completed' status requires completed_at (enforced by trigger).
-- ============================================================
INSERT INTO lead_follow_ups
    (id, org_id, lead_id, assigned_user_id, status_id, scheduled_at, completed_at, notes)
VALUES
    ('f1100000-0000-0000-0001-000000000001','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000001','c1100000-0000-0000-0000-000000000002',
     (SELECT id FROM follow_up_statuses WHERE name='pending'),
     '2026-06-10 10:00:00+05:30',NULL,
     'Call to check if lead attended info session. Offer trial class.'),

    ('f1100000-0000-0000-0001-000000000002','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000001','c1100000-0000-0000-0000-000000000002',
     (SELECT id FROM follow_up_statuses WHERE name='pending'),
     '2026-06-17 10:00:00+05:30',NULL,
     'Second follow-up if no response. Try WhatsApp.'),

    ('f1100000-0000-0000-0002-000000000001','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000002','c1100000-0000-0000-0000-000000000002',
     (SELECT id FROM follow_up_statuses WHERE name='completed'),
     '2024-04-20 11:00:00+05:30','2024-04-20 11:15:00+05:30',
     'Sent pricing brochure and confirmed interest. Lead to visit for trial next week.'),

    ('f1100000-0000-0000-0003-000000000001','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000003','c1100000-0000-0000-0000-000000000003',
     (SELECT id FROM follow_up_statuses WHERE name='completed'),
     '2024-03-15 09:00:00+05:30','2024-03-15 09:10:00+05:30',
     'Post-trial follow-up. Lead confirmed strong interest. Awaiting decision by weekend.'),
    ('f1100000-0000-0000-0003-000000000002','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000003','c1100000-0000-0000-0000-000000000003',
     (SELECT id FROM follow_up_statuses WHERE name='pending'),
     '2026-06-12 09:00:00+05:30',NULL,
     'Close the deal — offer 5% discount if membership confirmed this week.'),

    ('f1100000-0000-0000-0005-000000000001','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000005','c1100000-0000-0000-0000-000000000003',
     (SELECT id FROM follow_up_statuses WHERE name='missed'),
     '2024-02-12 10:00:00+05:30',NULL,
     'Retry contact via email after phone failure. No response — marked missed.'),

    ('f1100000-0000-0000-0007-000000000001','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000007','c1100000-0000-0000-0000-000000000002',
     (SELECT id FROM follow_up_statuses WHERE name='pending'),
     '2026-06-15 11:00:00+05:30',NULL,
     'Check if lead finalised budget. Offer early-bird Zumba batch discount.'),

    ('f1100000-0000-0000-0009-000000000001','b1000000-0000-0000-0000-000000000001',
     'e1100000-0000-0000-0000-000000000009','c1100000-0000-0000-0000-000000000003',
     (SELECT id FROM follow_up_statuses WHERE name='pending'),
     '2026-06-09 10:00:00+05:30',NULL,
     'Confirm trial visit. Remind of 10% referral discount.'),

    ('f1200000-0000-0000-0002-000000000001','b1000000-0000-0000-0000-000000000002',
     'e1200000-0000-0000-0000-000000000002','c1200000-0000-0000-0000-000000000002',
     (SELECT id FROM follow_up_statuses WHERE name='pending'),
     '2026-06-11 14:00:00+05:30',NULL,
     'Follow up on pricing query. Lead was evaluating competitor gyms.'),

    ('f1200000-0000-0000-0003-000000000001','b1000000-0000-0000-0000-000000000002',
     'e1200000-0000-0000-0000-000000000003','c1200000-0000-0000-0000-000000000003',
     (SELECT id FROM follow_up_statuses WHERE name='completed'),
     '2024-02-18 10:00:00+05:30','2024-02-18 10:20:00+05:30',
     'Post-brochure follow-up. Lead confirmed reviewing package. Very positive.'),

    ('f1200000-0000-0000-0005-000000000001','b1000000-0000-0000-0000-000000000002',
     'e1200000-0000-0000-0000-000000000005','c1200000-0000-0000-0000-000000000003',
     (SELECT id FROM follow_up_statuses WHERE name='missed'),
     '2024-02-25 15:00:00+05:30',NULL,
     'Final attempt to re-engage. Lead had already declined. Missed.'),

    ('f1200000-0000-0000-0008-000000000001','b1000000-0000-0000-0000-000000000002',
     'e1200000-0000-0000-0000-000000000008','c1200000-0000-0000-0000-000000000002',
     (SELECT id FROM follow_up_statuses WHERE name='pending'),
     '2026-06-10 14:00:00+05:30',NULL,
     'First contact for personal training enquiry. Qualify budget and availability.'),

    ('f2100000-0000-0000-0002-000000000001','b2000000-0000-0000-0000-000000000001',
     'e2100000-0000-0000-0000-000000000002','c2100000-0000-0000-0000-000000000002',
     (SELECT id FROM follow_up_statuses WHERE name='pending'),
     '2026-06-13 11:00:00+05:30',NULL,
     'Follow up on palazzo sets. Check if lead wants an in-store appointment.'),

    ('f2100000-0000-0000-0003-000000000001','b2000000-0000-0000-0000-000000000001',
     'e2100000-0000-0000-0000-000000000003','c2100000-0000-0000-0000-000000000003',
     (SELECT id FROM follow_up_statuses WHERE name='completed'),
     '2024-04-28 12:00:00+05:30','2024-04-28 12:30:00+05:30',
     'Post-visit follow-up. Lead deciding between two pieces. Offered 3-day hold.'),
    ('f2100000-0000-0000-0003-000000000002','b2000000-0000-0000-0000-000000000001',
     'e2100000-0000-0000-0000-000000000003','c2100000-0000-0000-0000-000000000003',
     (SELECT id FROM follow_up_statuses WHERE name='pending'),
     '2026-06-14 12:00:00+05:30',NULL,
     'Final close call. 3-day hold expires. Confirm selection.'),

    ('f2100000-0000-0000-0005-000000000001','b2000000-0000-0000-0000-000000000001',
     'e2100000-0000-0000-0000-000000000005','c2100000-0000-0000-0000-000000000003',
     (SELECT id FROM follow_up_statuses WHERE name='missed'),
     '2024-05-02 16:00:00+05:30',NULL,
     'Tried with budget-friendly alternative. No response — missed.'),

    ('f2200000-0000-0000-0002-000000000001','b2000000-0000-0000-0000-000000000002',
     'e2200000-0000-0000-0000-000000000002','c2200000-0000-0000-0000-000000000002',
     (SELECT id FROM follow_up_statuses WHERE name='pending'),
     '2026-06-16 13:00:00+05:30',NULL,
     'Follow up on mens kurta enquiry. Invite for store visit.'),

    ('f2200000-0000-0000-0003-000000000001','b2000000-0000-0000-0000-000000000002',
     'e2200000-0000-0000-0000-000000000003','c2200000-0000-0000-0000-000000000003',
     (SELECT id FROM follow_up_statuses WHERE name='completed'),
     '2024-04-16 11:00:00+05:30','2024-04-16 11:30:00+05:30',
     'Post-visit follow-up. Lead confirmed she wants the Kanjivaram. Visit Saturday.'),

    ('f2200000-0000-0000-0005-000000000001','b2000000-0000-0000-0000-000000000002',
     'e2200000-0000-0000-0000-000000000005','c2200000-0000-0000-0000-000000000003',
     (SELECT id FROM follow_up_statuses WHERE name='missed'),
     '2024-04-05 17:00:00+05:30',NULL,
     'Final outreach after 7 days of silence. No response — marked missed.'),

    ('f2200000-0000-0000-0008-000000000001','b2000000-0000-0000-0000-000000000002',
     'e2200000-0000-0000-0000-000000000008','c2200000-0000-0000-0000-000000000002',
     (SELECT id FROM follow_up_statuses WHERE name='pending'),
     '2026-06-10 11:00:00+05:30',NULL,
     'First contact for new lead. Qualify interest and budget range.')

ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- MARKETING_LEADS_HISTORY (lifecycle audit trail)
-- operation='U' only — stage/assignment transitions.
-- ============================================================
INSERT INTO marketing_leads_history
    (id, lead_id, changed_by_user_id, operation, changed_at, changed_fields)
VALUES
    ('01100000-0000-0000-0002-000000000001',
     'e1100000-0000-0000-0000-000000000002',
     'c1100000-0000-0000-0000-000000000002',
     'U', '2024-04-15 11:05:00+05:30',
     '{"stage_id": {"old": 1, "new": 2}, "assigned_user_id": {"old": null, "new": "c1100000-0000-0000-0000-000000000002"}}'),

    ('01100000-0000-0000-0003-000000000001',
     'e1100000-0000-0000-0000-000000000003',
     'c1100000-0000-0000-0000-000000000003',
     'U', '2024-03-10 15:10:00+05:30',
     '{"stage_id": {"old": 1, "new": 2}, "assigned_user_id": {"old": null, "new": "c1100000-0000-0000-0000-000000000003"}}'),

    ('01100000-0000-0000-0003-000000000002',
     'e1100000-0000-0000-0000-000000000003',
     'c1100000-0000-0000-0000-000000000003',
     'U', '2024-03-13 07:30:00+05:30',
     '{"stage_id": {"old": 2, "new": 3}}'),

    ('01100000-0000-0000-0004-000000000001',
     'e1100000-0000-0000-0000-000000000004',
     'c1100000-0000-0000-0000-000000000002',
     'U', '2024-01-25 15:40:00+05:30',
     '{"stage_id": {"old": 1, "new": 2}, "assigned_user_id": {"old": null, "new": "c1100000-0000-0000-0000-000000000002"}}'),

    ('01100000-0000-0000-0004-000000000002',
     'e1100000-0000-0000-0000-000000000004',
     'c1100000-0000-0000-0000-000000000002',
     'U', '2024-01-26 08:00:00+05:30',
     '{"stage_id": {"old": 2, "new": 3}}'),

    ('01100000-0000-0000-0004-000000000003',
     'e1100000-0000-0000-0000-000000000004',
     'c1100000-0000-0000-0000-000000000002',
     'U', '2024-01-27 12:05:00+05:30',
     '{"stage_id": {"old": 3, "new": 4}, "metadata": {"old": {"goal": "weight_loss", "membership_type": "annual", "payment_mode": "upi"}, "new": {"goal": "weight_loss", "membership_type": "annual", "payment_mode": "upi", "converted_amount": 18000}}}'),

    ('01100000-0000-0000-0005-000000000001',
     'e1100000-0000-0000-0000-000000000005',
     'c1100000-0000-0000-0000-000000000003',
     'U', '2024-02-13 11:10:00+05:30',
     '{"stage_id": {"old": 1, "new": 5}, "outcome_id": {"old": null, "new": 8}, "assigned_user_id": {"old": null, "new": "c1100000-0000-0000-0000-000000000003"}}'),

    ('01100000-0000-0000-0007-000000000001',
     'e1100000-0000-0000-0000-000000000007',
     'c1100000-0000-0000-0000-000000000002',
     'U', '2024-04-25 10:05:00+05:30',
     '{"stage_id": {"old": 1, "new": 2}, "assigned_user_id": {"old": null, "new": "c1100000-0000-0000-0000-000000000002"}}'),

    ('01100000-0000-0000-0007-000000000002',
     'e1100000-0000-0000-0000-000000000007',
     'c1100000-0000-0000-0000-000000000002',
     'U', '2024-05-02 11:45:00+05:30',
     '{"stage_id": {"old": 2, "new": 2}}'),

    ('01200000-0000-0000-0004-000000000001',
     'e1200000-0000-0000-0000-000000000004',
     'c1200000-0000-0000-0000-000000000002',
     'U', '2024-04-01 10:10:00+05:30',
     '{"stage_id": {"old": 1, "new": 2}, "assigned_user_id": {"old": null, "new": "c1200000-0000-0000-0000-000000000002"}}'),

    ('01200000-0000-0000-0004-000000000002',
     'e1200000-0000-0000-0000-000000000004',
     'c1200000-0000-0000-0000-000000000002',
     'U', '2024-04-03 07:30:00+05:30',
     '{"stage_id": {"old": 2, "new": 3}}'),

    ('01200000-0000-0000-0004-000000000003',
     'e1200000-0000-0000-0000-000000000004',
     'c1200000-0000-0000-0000-000000000002',
     'U', '2024-04-03 11:05:00+05:30',
     '{"stage_id": {"old": 3, "new": 4}, "metadata": {"old": {"goal": "weight_loss", "membership_type": "half_yearly", "payment_mode": "credit_card"}, "new": {"goal": "weight_loss", "membership_type": "half_yearly", "payment_mode": "credit_card", "converted_amount": 10500}}}'),

    ('02100000-0000-0000-0004-000000000001',
     'e2100000-0000-0000-0000-000000000004',
     'c2100000-0000-0000-0000-000000000002',
     'U', '2024-03-05 10:10:00+05:30',
     '{"stage_id": {"old": 1, "new": 2}, "assigned_user_id": {"old": null, "new": "c2100000-0000-0000-0000-000000000002"}}'),

    ('02100000-0000-0000-0004-000000000002',
     'e2100000-0000-0000-0000-000000000004',
     'c2100000-0000-0000-0000-000000000002',
     'U', '2024-03-08 11:30:00+05:30',
     '{"stage_id": {"old": 2, "new": 3}}'),

    ('02100000-0000-0000-0004-000000000003',
     'e2100000-0000-0000-0000-000000000004',
     'c2100000-0000-0000-0000-000000000002',
     'U', '2024-03-08 15:10:00+05:30',
     '{"stage_id": {"old": 3, "new": 4}, "metadata": {"old": {"product_interest": "bridal_lehenga", "size_preference": "M", "budget_range": "25000-50000"}, "new": {"product_interest": "bridal_lehenga", "size_preference": "M", "budget_range": "25000-50000", "converted_order_value": 38000}}}')

ON CONFLICT (id) DO NOTHING;

COMMIT;
