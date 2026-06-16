# PostgreSQL Templates Reference

## Table of Contents
1. [updated_at Trigger](#updated_at-trigger)
2. [Lookup Table Full Template](#lookup-table-full-template)
3. [Domain Table Full Template](#domain-table-full-template)
4. [View Template](#view-template)
5. [Multi-Tenant Pattern](#multi-tenant-pattern)
6. [Soft Delete Pattern](#soft-delete-pattern)
7. [Full Example: E-Commerce Schema](#full-example-e-commerce-schema)

---

## updated_at Trigger

Apply once per database (the function), then one trigger per table.

```sql
-- Create the function once
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to each table
CREATE TRIGGER trg_{table}_updated_at
    BEFORE UPDATE ON {table}
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
```

---

## Lookup Table Full Template

```sql
CREATE TABLE {entity}_types (
    id          SMALLINT     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        VARCHAR(50)  NOT NULL,
    label       VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order  SMALLINT     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_{entity}_types_code UNIQUE (code)
);

-- Seed immediately after DDL
INSERT INTO {entity}_types (code, label, description, sort_order) VALUES
    ('active',   'Active',   'Currently active',   1),
    ('inactive', 'Inactive', 'No longer active',   2),
    ('pending',  'Pending',  'Awaiting activation', 3);
```

---

## Domain Table Full Template (UUID)

```sql
CREATE TABLE {entities} (
    id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    -- FK columns
    {ref}_id        SMALLINT     NOT NULL,
    -- own columns
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    -- audit
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- constraints
    CONSTRAINT pk_{entities} PRIMARY KEY (id),  -- already set above, explicit for clarity
    CONSTRAINT fk_{entities}_{ref_table} FOREIGN KEY ({ref}_id)
        REFERENCES {ref_table}(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX idx_{entities}_{ref}_id ON {entities} ({ref}_id);
CREATE INDEX idx_{entities}_is_active ON {entities} (is_active);
CREATE INDEX idx_{entities}_created_at ON {entities} (created_at DESC);

-- Trigger
CREATE TRIGGER trg_{entities}_updated_at
    BEFORE UPDATE ON {entities}
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## Domain Table Full Template (INT IDENTITY)

```sql
CREATE TABLE {entities} (
    id          INT          GENERATED ALWAYS AS IDENTITY,
    {ref}_id    SMALLINT     NOT NULL,
    name        VARCHAR(200) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_{entities} PRIMARY KEY (id),
    CONSTRAINT fk_{entities}_{ref_table} FOREIGN KEY ({ref}_id)
        REFERENCES {ref_table}(id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);
```

---

## View Template

```sql
CREATE OR REPLACE VIEW {table}_vw AS
SELECT
    t.id,
    t.name,
    t.description,

    -- Resolve FK lookup IDs to human-readable labels
    st.code             AS status_code,
    st.label            AS status_label,
    ct.code             AS category_code,
    ct.label            AS category_label,

    -- Audit
    t.is_active,
    t.created_at,
    t.updated_at
FROM {table} t
LEFT JOIN status_types  st ON st.id = t.status_id
LEFT JOIN category_types ct ON ct.id = t.category_id;

COMMENT ON VIEW {table}_vw IS 'Human-readable view of {table} with all FK labels resolved.';
```

---

## Multi-Tenant Pattern

Add `tenant_id` as the first non-PK column. Create composite indexes with `tenant_id` first.

```sql
CREATE TABLE {entities} (
    id          UUID         DEFAULT gen_random_uuid(),
    tenant_id   UUID         NOT NULL,
    -- ... other columns
    CONSTRAINT pk_{entities} PRIMARY KEY (id),
    CONSTRAINT fk_{entities}_tenants FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- Composite index: tenant_id first for row-level isolation
CREATE INDEX idx_{entities}_tenant_id     ON {entities} (tenant_id);
CREATE INDEX idx_{entities}_tenant_status ON {entities} (tenant_id, status_id);
```

---

## Soft Delete Pattern

Use instead of `ON DELETE CASCADE` when historical records must be preserved.

```sql
ALTER TABLE {entities}
    ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Index for filtering out deleted rows efficiently
CREATE INDEX idx_{entities}_deleted_at ON {entities} (deleted_at)
    WHERE deleted_at IS NULL;

-- Soft-delete view (excludes deleted rows)
CREATE OR REPLACE VIEW {entities}_vw AS
SELECT * FROM {entities}
WHERE deleted_at IS NULL;

-- To soft-delete:
-- UPDATE {entities} SET deleted_at = NOW() WHERE id = $1;
```

---

## Full Example: E-Commerce Schema

A complete worked example demonstrating all patterns together.

```sql
-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid() on older PG

-- ============================================================
-- TRIGGER FUNCTION (once per DB)
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- LOOKUP TABLES
-- ============================================================

CREATE TABLE order_statuses (
    id          SMALLINT     GENERATED ALWAYS AS IDENTITY,
    code        VARCHAR(50)  NOT NULL,
    label       VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order  SMALLINT     NOT NULL DEFAULT 0,
    CONSTRAINT pk_order_statuses  PRIMARY KEY (id),
    CONSTRAINT uq_order_statuses_code UNIQUE (code)
);

INSERT INTO order_statuses (code, label, description, sort_order) VALUES
    ('pending',    'Pending',    'Order placed, awaiting payment',    1),
    ('paid',       'Paid',       'Payment confirmed',                 2),
    ('processing', 'Processing', 'Being prepared for shipment',       3),
    ('shipped',    'Shipped',    'Dispatched to carrier',             4),
    ('delivered',  'Delivered',  'Received by customer',              5),
    ('cancelled',  'Cancelled',  'Cancelled before shipment',         6),
    ('refunded',   'Refunded',   'Payment returned to customer',      7);


CREATE TABLE product_categories (
    id          SMALLINT     GENERATED ALWAYS AS IDENTITY,
    code        VARCHAR(50)  NOT NULL,
    label       VARCHAR(100) NOT NULL,
    CONSTRAINT pk_product_categories      PRIMARY KEY (id),
    CONSTRAINT uq_product_categories_code UNIQUE (code)
);

INSERT INTO product_categories (code, label) VALUES
    ('electronics', 'Electronics'),
    ('clothing',    'Clothing'),
    ('books',       'Books'),
    ('home',        'Home & Garden'),
    ('sports',      'Sports & Outdoors');

-- ============================================================
-- CORE DOMAIN TABLES
-- ============================================================

CREATE TABLE users (
    id            UUID         DEFAULT gen_random_uuid(),
    email         VARCHAR(320) NOT NULL,
    display_name  VARCHAR(200) NOT NULL,
    phone         VARCHAR(20),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_users       PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_users_email     ON users (email);
CREATE INDEX idx_users_is_active ON users (is_active);

-- Seed users
INSERT INTO users (id, email, display_name, phone, is_active) VALUES
    ('a1b2c3d4-0000-0000-0000-000000000001', 'alice@example.com',  'Alice Sharma',  '+919810000001', TRUE),
    ('a1b2c3d4-0000-0000-0000-000000000002', 'bob@example.com',    'Bob Verma',     '+919810000002', TRUE),
    ('a1b2c3d4-0000-0000-0000-000000000003', 'charlie@example.com','Charlie Singh', NULL,            TRUE),
    ('a1b2c3d4-0000-0000-0000-000000000004', 'diana@example.com',  'Diana Kapoor',  '+919810000004', FALSE), -- inactive user edge case
    ('a1b2c3d4-0000-0000-0000-000000000005', 'eve@example.com',    'Eve Joshi',     '+919810000005', TRUE);


CREATE TABLE products (
    id            UUID           DEFAULT gen_random_uuid(),
    category_id   SMALLINT       NOT NULL,
    sku           VARCHAR(100)   NOT NULL,
    name          VARCHAR(300)   NOT NULL,
    description   TEXT,
    unit_price    NUMERIC(15,2)  NOT NULL CHECK (unit_price >= 0),
    stock_qty     INT            NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    is_active     BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_products            PRIMARY KEY (id),
    CONSTRAINT uq_products_sku        UNIQUE (sku),
    CONSTRAINT fk_products_categories FOREIGN KEY (category_id)
        REFERENCES product_categories(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_products_category_id ON products (category_id);
CREATE INDEX idx_products_is_active   ON products (is_active);
CREATE INDEX idx_products_sku         ON products (sku);
CREATE INDEX idx_products_name_gin    ON products USING gin(to_tsvector('english', name));

-- Seed products (one per category, plus edge cases)
INSERT INTO products (category_id, sku, name, unit_price, stock_qty, is_active) VALUES
    (1, 'ELEC-001', 'Wireless Headphones',        2999.00, 150, TRUE),
    (1, 'ELEC-002', 'USB-C Hub 7-port',            999.00,   0, TRUE),   -- zero stock edge case
    (2, 'CLTH-001', 'Cotton T-Shirt (L)',           499.00, 300, TRUE),
    (3, 'BOOK-001', 'PostgreSQL: Up and Running',   799.00,  50, TRUE),
    (4, 'HOME-001', 'Bamboo Cutting Board',         349.00,  75, TRUE),
    (5, 'SPRT-001', 'Yoga Mat 6mm',                 699.00,  20, FALSE);  -- inactive product edge case


CREATE TABLE orders (
    id            UUID          DEFAULT gen_random_uuid(),
    user_id       UUID          NOT NULL,
    status_id     SMALLINT      NOT NULL,
    total_amount  NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    notes         TEXT,
    placed_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_orders         PRIMARY KEY (id),
    CONSTRAINT fk_orders_users   FOREIGN KEY (user_id)
        REFERENCES users(id)   ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_orders_statuses FOREIGN KEY (status_id)
        REFERENCES order_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_orders_user_id    ON orders (user_id);
CREATE INDEX idx_orders_status_id  ON orders (status_id);
CREATE INDEX idx_orders_placed_at  ON orders (placed_at DESC);
CREATE INDEX idx_orders_user_status ON orders (user_id, status_id);

-- Seed orders (cover every status)
INSERT INTO orders (id, user_id, status_id, total_amount, notes) VALUES
    ('b2c3d4e5-0000-0000-0000-000000000001', 'a1b2c3d4-0000-0000-0000-000000000001', 1, 2999.00, NULL),           -- pending
    ('b2c3d4e5-0000-0000-0000-000000000002', 'a1b2c3d4-0000-0000-0000-000000000001', 2, 1498.00, 'Gift wrap'),   -- paid
    ('b2c3d4e5-0000-0000-0000-000000000003', 'a1b2c3d4-0000-0000-0000-000000000002', 3,  499.00, NULL),           -- processing
    ('b2c3d4e5-0000-0000-0000-000000000004', 'a1b2c3d4-0000-0000-0000-000000000002', 4,  799.00, NULL),           -- shipped
    ('b2c3d4e5-0000-0000-0000-000000000005', 'a1b2c3d4-0000-0000-0000-000000000003', 5,  349.00, NULL),           -- delivered
    ('b2c3d4e5-0000-0000-0000-000000000006', 'a1b2c3d4-0000-0000-0000-000000000003', 6,    0.00, 'Customer request'), -- cancelled (zero amount edge case)
    ('b2c3d4e5-0000-0000-0000-000000000007', 'a1b2c3d4-0000-0000-0000-000000000005', 7,  999.00, NULL);           -- refunded


CREATE TABLE order_items (
    id            UUID           DEFAULT gen_random_uuid(),
    order_id      UUID           NOT NULL,
    product_id    UUID           NOT NULL,
    quantity      SMALLINT       NOT NULL CHECK (quantity > 0),
    unit_price    NUMERIC(15,2)  NOT NULL CHECK (unit_price >= 0),  -- snapshot price at order time
    line_total    NUMERIC(15,2)  GENERATED ALWAYS AS (quantity * unit_price) STORED,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_order_items          PRIMARY KEY (id),
    CONSTRAINT fk_order_items_orders   FOREIGN KEY (order_id)
        REFERENCES orders(id)   ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_order_items_products FOREIGN KEY (product_id)
        REFERENCES products(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX idx_order_items_order_id   ON order_items (order_id);
CREATE INDEX idx_order_items_product_id ON order_items (product_id);

-- Seed order items
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
    ('b2c3d4e5-0000-0000-0000-000000000001', (SELECT id FROM products WHERE sku='ELEC-001'), 1, 2999.00),
    ('b2c3d4e5-0000-0000-0000-000000000002', (SELECT id FROM products WHERE sku='ELEC-002'), 1,  999.00),
    ('b2c3d4e5-0000-0000-0000-000000000002', (SELECT id FROM products WHERE sku='CLTH-001'), 1,  499.00),
    ('b2c3d4e5-0000-0000-0000-000000000003', (SELECT id FROM products WHERE sku='CLTH-001'), 1,  499.00),
    ('b2c3d4e5-0000-0000-0000-000000000004', (SELECT id FROM products WHERE sku='BOOK-001'), 1,  799.00),
    ('b2c3d4e5-0000-0000-0000-000000000005', (SELECT id FROM products WHERE sku='HOME-001'), 1,  349.00),
    ('b2c3d4e5-0000-0000-0000-000000000007', (SELECT id FROM products WHERE sku='ELEC-002'), 1,  999.00);

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW users_vw AS
SELECT
    id,
    email,
    display_name,
    phone,
    is_active,
    created_at,
    updated_at
FROM users;

CREATE OR REPLACE VIEW products_vw AS
SELECT
    p.id,
    p.sku,
    p.name,
    p.description,
    pc.code         AS category_code,
    pc.label        AS category_label,
    p.unit_price,
    p.stock_qty,
    p.stock_qty > 0 AS in_stock,
    p.is_active,
    p.created_at,
    p.updated_at
FROM products p
JOIN product_categories pc ON pc.id = p.category_id;

CREATE OR REPLACE VIEW orders_vw AS
SELECT
    o.id,
    o.user_id,
    u.email           AS user_email,
    u.display_name    AS user_name,
    os.code           AS status_code,
    os.label          AS status_label,
    o.total_amount,
    o.notes,
    o.placed_at,
    o.created_at,
    o.updated_at
FROM orders o
JOIN users          u  ON u.id  = o.user_id
JOIN order_statuses os ON os.id = o.status_id;

CREATE OR REPLACE VIEW order_items_vw AS
SELECT
    oi.id,
    oi.order_id,
    oi.product_id,
    p.sku             AS product_sku,
    p.name            AS product_name,
    pc.label          AS category_label,
    oi.quantity,
    oi.unit_price,
    oi.line_total,
    oi.created_at
FROM order_items oi
JOIN products          p  ON p.id  = oi.product_id
JOIN product_categories pc ON pc.id = p.category_id;
```
