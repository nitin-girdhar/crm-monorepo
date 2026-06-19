---
name: pg-database-dev
description: >
  Use this skill for ALL PostgreSQL database design, development, and refactoring tasks. Triggers include: designing schemas, writing migrations, creating tables, normalization, adding indexes, building views, seeding data, or any mention of PostgreSQL, Postgres, database schema, SQL schema, or DB design. Also trigger for tasks like "model this data in a database", "design a schema for X", "set up tables for Y", or any request that involves structuring relational data — even if the word 'PostgreSQL' isn't used but a relational DB is implied. ALSO trigger for any refactoring request: "audit my schema", "improve my database", "refactor my SQL", "check my migrations", "what's missing from my schema", or any request to review existing SQL files for compliance, missing views, missing lookup tables, missing indexes, or naming issues.
---

# PostgreSQL Database Development Skill

A strict, opinionated standard for PostgreSQL schema design. Follow every rule in this document every time — do not skip sections or apply rules selectively.

---

## Core Principle: Normalize Everything

**The default answer to "should I normalize this?" is always YES.**

Before writing any column definition, ask: *"Can this value repeat across rows, belong to a bounded set, or be described with a label a product would display?"* If yes — it goes into a lookup table. This includes (but is not limited to):

- Statuses (`active`, `inactive`, `pending`, `archived`)
- Types and categories (user types, product categories, order types)
- Roles and permissions
- Countries, currencies, languages, timezones
- Priority levels, severity levels
- Payment methods, delivery methods
- Any column whose value list is managed by configuration, not by end-user free text

**Never store enum-like values as raw `TEXT` or `VARCHAR` in the main table.** The FK to a lookup table is mandatory.

---

## Rule 1 — Naming Conventions

All identifiers must use `snake_case`. No exceptions.

| Object | Convention | Example |
|---|---|---|
| Tables | Plural nouns | `users`, `order_items` |
| Lookup/reference tables | `{concept}_types` or `{concept}_statuses` | `user_types`, `order_statuses` |
| Views | `{table_name}_vw` | `users_vw`, `order_items_vw` |
| Primary keys | `pk_{table}` | `pk_orders` |
| Foreign keys | `fk_{table}_{referenced_table}` | `fk_orders_users` |
| Unique constraints | `uq_{table}_{column(s)}` | `uq_users_email` |
| Indexes | `idx_{table}_{column(s)}` | `idx_orders_user_id` |
| Triggers | `trg_{table}_{action}` | `trg_users_updated_at` |

---

## Rule 2 — Primary Key ID Types

Choose the right ID type based on the table's role and expected growth. Never default to UUID for everything.

| Table Type | ID Type | Reasoning |
|---|---|---|
| Lookup / reference tables (roles, statuses, types, categories) | `SMALLINT` (≤ ~32K rows) or `INT` (≤ ~2B rows) | Compact, fast joins, human-readable in joins and debug |
| Config / settings tables | `INT` | Bounded, internal only |
| Core domain tables (users, products, orders, tenants) | `UUID` | Safe for external exposure, multi-tenant isolation, prevents enumeration |
| High-volume tables (events, logs, audit trails, messages) | `UUID` | Avoids hotspot inserts; safe for distributed systems |
| Junction / many-to-many tables | Composite PK of the two FKs; no surrogate needed unless queried independently | Minimal overhead |

**Decision rule in plain English:**
- Is it a lookup/config table managed internally? → `INT` or `SMALLINT`
- Will it ever appear in a URL, be shared across tenants, or be exported externally? → `UUID`
- Could it grow beyond millions of rows and is append-heavy? → `UUID`

```sql
-- Lookup table PK
id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

-- Domain / API-facing table PK
id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
```

---

## Rule 3 — Lookup Tables (Mandatory Normalization)

Every bounded-value column must be extracted into its own lookup table. Create one lookup table per concept — do not share a generic "reference data" table across unrelated concepts.

### Required Columns on Every Lookup Table

```sql
CREATE TABLE {concept}_types (
    id          SMALLINT     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        VARCHAR(50)  NOT NULL,   -- machine-readable key used in app logic (e.g. 'ACTIVE', 'PENDING')
    label       VARCHAR(100) NOT NULL,   -- human-readable label shown in the product UI (e.g. 'Active', 'Pending Review')
    description TEXT,                   -- optional longer explanation shown in tooltips, admin panels, etc.
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order  SMALLINT     NOT NULL DEFAULT 0,
    CONSTRAINT uq_{concept}_types_code UNIQUE (code)
);
```

**Column purposes:**
- `code` — stable machine identifier used in application logic and API filters. Never change a `code` value after launch.
- `label` — what the product displays to end users. Can be updated freely without touching application code.
- `description` — optional detail for admin UIs, tooltips, onboarding copy.
- `is_active` — soft-disables a lookup value without deleting rows that reference it.
- `sort_order` — controls display order in dropdowns and lists without relying on alphabetical sort.

### Referencing a Lookup Table

In the parent table, the FK column name should clearly indicate what it points to:

```sql
-- Naming: {concept}_id
status_id    SMALLINT NOT NULL,
category_id  SMALLINT NOT NULL,
priority_id  SMALLINT,  -- nullable if optional

CONSTRAINT fk_{table}_order_statuses
    FOREIGN KEY (status_id) REFERENCES order_statuses(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
```

---

## Rule 4 — Views Are Mandatory for Every Table

Every table (domain and lookup) must have a corresponding `_vw` view. The view is the contract between the database and the application — it must return human-readable data directly, without requiring the application layer to do join resolution.

### What a View Must Do

1. Join every FK to its lookup table and expose `code` and `label` columns from the lookup (aliased clearly)
2. Resolve user FKs to display names where relevant (`created_by_name`, `assigned_to_name`)
3. Format timestamps as `TIMESTAMPTZ` (no reformatting needed — the application handles display formatting)
4. Exclude internal technical columns that should not leak to the API layer (e.g. internal routing keys, raw hash columns)
5. Never expose raw FK integer IDs alone — always accompany them with the resolved `label` and `code`

### View Template

```sql
CREATE OR REPLACE VIEW {table}_vw AS
SELECT
    t.id,

    -- Scalar columns
    t.name,
    t.description,

    -- Lookup resolution: always include both the raw _id, the code, and the label
    t.status_id,
    st.code         AS status_code,
    st.label        AS status_label,

    t.category_id,
    ct.code         AS category_code,
    ct.label        AS category_label,

    -- User resolution (if applicable)
    t.created_by,
    u.full_name     AS created_by_name,

    -- Audit columns
    t.created_at,
    t.updated_at

FROM {table} t
LEFT JOIN {status_lookup} st  ON st.id  = t.status_id
LEFT JOIN {category_lookup} ct ON ct.id = t.category_id
LEFT JOIN users u              ON u.id  = t.created_by;
```

**Naming conventions inside views:**
- `{concept}_code` — the machine-readable `code` from the lookup table
- `{concept}_label` — the display label from the lookup table
- `{concept}_name` — used for resolved user/entity names (not lookup tables)

### Lookup Table Views

Lookup tables also get `_vw` views, primarily to support admin UIs and consistent querying:

```sql
CREATE OR REPLACE VIEW order_statuses_vw AS
SELECT
    id,
    code,
    label,
    description,
    is_active,
    sort_order
FROM order_statuses
WHERE is_active = TRUE
ORDER BY sort_order, label;
```

---

## Rule 5 — Data Types

Always pick the smallest correct type. Over-sizing columns wastes storage, slows indexes, and increases I/O.

| Data | Use | Avoid |
|---|---|---|
| True/false | `BOOLEAN` | `SMALLINT`, `CHAR(1)` |
| Short codes, slugs (≤ 50 chars) | `VARCHAR(n)` with tight `n` | `TEXT` |
| Long freeform text | `TEXT` | `VARCHAR(10000)` |
| Small whole numbers | `SMALLINT` | `INT` |
| Normal whole numbers | `INT` | `BIGINT` |
| Large counters or high-volume IDs | `BIGINT` | `INT` |
| Money / currency | `NUMERIC(15,2)` | `FLOAT`, `REAL` |
| Timestamps (most cases) | `TIMESTAMPTZ` | `TIMESTAMP` (no tz) |
| Date only | `DATE` | `TIMESTAMPTZ` |
| JSON blobs | `JSONB` | `JSON`, `TEXT` |
| IP addresses | `INET` | `VARCHAR` |
| UUIDs | `UUID` | `VARCHAR(36)` |
| Binary data | `BYTEA` | `TEXT` |

---

## Rule 6 — Audit Columns on Every Table

```sql
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Every table — including lookup tables — must carry both columns. Add a trigger to keep `updated_at` current automatically (see trigger template in Rule 9).

---

## Rule 7 — Foreign Keys

All FK constraints must be declared explicitly with a name and a deliberate `ON DELETE` action.

```sql
CONSTRAINT fk_{table}_{ref_table}
    FOREIGN KEY ({col}) REFERENCES {ref_table}({col})
    ON DELETE {RESTRICT | CASCADE | SET NULL}
    ON UPDATE CASCADE
```

| Action | When to use |
|---|---|
| `RESTRICT` | Default safe choice — prevent deletion of a parent that has children |
| `CASCADE` | Child rows are meaningless without the parent (e.g. order items when an order is deleted) |
| `SET NULL` | The relationship is optional; losing the parent is acceptable (e.g. assigned_to when a user is deleted) |

---

## Rule 8 — Indexes

Required indexes:

1. Every FK column (`idx_{table}_{fk_col}`)
2. Columns used in `WHERE` filters for common application queries
3. Columns used in `ORDER BY` for paginated result sets
4. Multi-tenant systems: composite `(tenant_id, {other_col})` indexes

```sql
-- Single column
CREATE INDEX idx_{table}_{col} ON {table} ({col});

-- Composite (multi-tenant pattern)
CREATE INDEX idx_{table}_tenant_{col} ON {table} (tenant_id, {col});

-- Full-text search
CREATE INDEX idx_{table}_{col}_gin ON {table} USING gin(to_tsvector('english', {col}));
```

---

## Rule 9 — updated_at Trigger (Required)

Create one shared trigger function and reuse it across all tables:

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to each table:
CREATE TRIGGER trg_{table}_updated_at
    BEFORE UPDATE ON {table}
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## Rule 10 — Seed Data

Seed data is a first-class deliverable, not an afterthought.

**Lookup tables:** Seed every meaningful `code` and `label` combination. Cover inactive/deprecated entries too.

**Domain tables:** Provide at least 5–10 realistic records per major table, including:
- At least one record per status/type combination (to exercise every branch)
- Null values on every nullable column (at least one record)
- Boundary values: max-length strings, zero amounts, past/future dates
- Soft-deleted records where applicable
- In multi-tenant systems: records across at least two tenant IDs

---

## Refactoring & Audit Mode

This skill applies equally to **fresh schemas** and **existing codebases**. When the task involves reviewing or improving existing SQL, follow this structured audit process before writing any output.

---

### Step 0 — Locate and Read All SQL Files First

Before producing any SQL, scan the project for every SQL file:

```
migrations/
schema/
db/
sql/
database/
*.sql
**/*.sql
seed*.sql
```

Read every file completely. Do not guess at structure from partial reads. The existing schema is the authoritative source of truth — understand it fully before proposing any change.

---

### Step 1 — Build the Inventory

After reading all files, produce a structured inventory:

```
TABLES FOUND:         [list every table name]
VIEWS FOUND:          [list every _vw view name]
LOOKUP TABLES FOUND:  [list tables identified as lookup/reference tables]
INDEXES FOUND:        [list all explicit index definitions]
TRIGGERS FOUND:       [list all triggers]
```

This inventory is shown to the user before any fixes are proposed. It confirms you have read the full schema correctly.

---

### Step 2 — Run the Compliance Gap Analysis

Check every table against each rule in this skill. For each gap found, record:

| Gap Type | Table / Column | Issue | Fix Required |
|---|---|---|---|
| Missing view | `orders` | No `orders_vw` exists | Create view with lookup joins |
| Unnormalized column | `users.status` | Raw `VARCHAR` storing `'active'/'inactive'` — no lookup table | Extract to `user_statuses` lookup, add FK |
| Missing lookup columns | `order_types` | Has `name` but missing `code`, `is_active`, `sort_order` | Add missing columns |
| Missing index | `orders.user_id` | FK column has no index | Add `idx_orders_user_id` |
| Missing audit columns | `product_categories` | No `created_at` / `updated_at` | Add both columns + trigger |
| Wrong ID type | `order_statuses.id` | Using `UUID` on a lookup table | Should be `SMALLINT` |
| Missing trigger | `products` | No `updated_at` trigger | Add trigger |
| Unnamed FK | `order_items` | FK constraint has no explicit name | Add constraint name |
| Missing label column | `priority_levels` | Has `name` but no `label` column for UI display | Add `label` column |
| Naming violation | `OrderItems` | Table uses PascalCase | Rename to `order_items` |

Present this gap table to the user before writing any fix SQL.

---

### Step 3 — Classify Each Gap by Risk

Not all gaps are equal. Before applying fixes, classify each one:

| Risk Level | Description | Examples |
|---|---|---|
| **Safe** | Additive only — no existing data or queries break | Adding a missing view, adding an index, adding a trigger, adding audit columns to an empty table |
| **Migration needed** | Structural change to an existing table with data | Extracting a `VARCHAR` column into a lookup table, renaming a column, changing an ID type |
| **Breaking** | Removes or renames something the application may depend on | Dropping a column, renaming a table, removing a view the app queries |

For **Safe** gaps: generate the fix SQL directly.
For **Migration needed** gaps: generate the migration SQL AND include a data migration step that populates the new lookup table from existing values and back-fills the FK column.
For **Breaking** gaps: flag them clearly, explain the risk, and ask the user to confirm before generating any SQL.

---

### Step 4 — Generate Fix SQL

Produce fix SQL in this order:

```
1. New lookup tables (with seed data) for any unnormalized columns
2. ALTER TABLE statements to add missing columns (audit columns, FK columns)
3. Data migration statements (populate lookup tables from existing data, back-fill FKs)
4. New FK constraints
5. New indexes
6. New or updated triggers
7. New or updated views (_vw) — lookup views first, then domain views
```

Each fix block must be preceded by a comment identifying what gap it resolves:

```sql
-- FIX: orders — missing status lookup table (was bare VARCHAR 'status' column)
CREATE TABLE order_statuses ( ... );

-- FIX: orders — data migration from VARCHAR status to order_statuses FK
INSERT INTO order_statuses (code, label) SELECT DISTINCT status, initcap(status) FROM orders;
ALTER TABLE orders ADD COLUMN status_id SMALLINT;
UPDATE orders o SET status_id = s.id FROM order_statuses s WHERE s.code = o.status;
ALTER TABLE orders ALTER COLUMN status_id SET NOT NULL;
ALTER TABLE orders DROP COLUMN status;

-- FIX: orders — missing view
CREATE OR REPLACE VIEW orders_vw AS ...
```

---

### Step 5 — Refactor Summary

After all fix SQL is produced, output a concise summary:

```
REFACTOR SUMMARY
================
Tables audited:       12
Gaps found:           18
  Safe fixes:          9  (views, indexes, triggers)
  Migration needed:    7  (lookup table extractions, audit columns)
  Breaking / flagged:  2  (column renames — awaiting confirmation)

Files changed:
  migrations/004_add_lookup_tables.sql   [new]
  migrations/005_add_missing_views.sql   [new]
  migrations/006_add_indexes_triggers.sql [new]
```

---

### Refactoring Rules (Non-Negotiable)

1. **Never drop a column without explicit user confirmation.** Flag it, explain the risk, wait.
2. **Never rename a table or column without explicit user confirmation.** Application code and existing queries will break.
3. **Always generate a data migration step** when extracting a lookup table from an existing column. Don't leave orphaned data.
4. **Always wrap destructive migrations in a transaction** so they can be rolled back cleanly.
5. **Preserve existing constraint names** unless they violate the naming convention and the user has confirmed renaming is safe.
6. **Do not rewrite migrations that have already been applied** (i.e. files with a timestamp or sequence number that implies they're in production). Add new migration files instead.

```sql
-- Wrap destructive changes in a transaction
BEGIN;

  -- data migration steps here

COMMIT;
```

---

Always deliver SQL in this sequence:

```
1. Extensions          (e.g. CREATE EXTENSION IF NOT EXISTS "pgcrypto";)
2. Lookup tables       + seed data immediately after each
3. Core domain tables  + seed data immediately after each
4. Indexes
5. updated_at triggers
6. Views (_vw)         — lookup table views first, then domain table views
```

---

## Delivery Checklist

### Fresh Schema
Before finalizing any schema output, verify every item:

- [ ] All identifiers are `snake_case`
- [ ] Every table has a PK with the correct type (`SMALLINT` / `INT` / `UUID`)
- [ ] **Every bounded-value column is extracted into a dedicated lookup table** with `code`, `label`, `description`, `is_active`, `sort_order`
- [ ] Lookup tables use `INT` or `SMALLINT` PKs; domain/API-facing tables use `UUID`
- [ ] All FK constraints are named and declared explicitly with deliberate `ON DELETE` actions
- [ ] Data types are the smallest correct type per column
- [ ] Every table has `created_at` and `updated_at` with `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- [ ] `updated_at` trigger is created for every table
- [ ] Index exists on every FK column + every query-critical column
- [ ] **A `_vw` view exists for every table** — lookup and domain alike
- [ ] Views expose `{concept}_code` and `{concept}_label` for every FK to a lookup table
- [ ] Seed data covers all lookup values + at least one record per status/type combination + edge cases

### Refactor / Audit
Before finalizing a refactoring output, verify:

- [ ] All SQL files in the project have been read (not just the ones that seem relevant)
- [ ] Inventory of all tables, views, indexes, triggers, and lookup tables has been produced
- [ ] Gap analysis table has been presented to the user before any SQL was written
- [ ] Every gap has been classified as Safe / Migration needed / Breaking
- [ ] Breaking changes have been explicitly flagged and confirmed before SQL was generated
- [ ] Every lookup table extraction includes a data migration step
- [ ] Destructive migrations are wrapped in `BEGIN; ... COMMIT;`
- [ ] Fix SQL is organized into new migration files, not edits to existing applied migrations
- [ ] Refactor summary has been produced at the end

---

## Quick Reference Cards

### ID Type Decision
```
Lookup table (statuses, roles, types, categories)?   → SMALLINT or INT
Config / settings table?                             → INT
Domain table visible in URLs or shared externally?   → UUID
Event / log / audit table?                           → UUID
Multi-tenant system?                                 → UUID on all domain tables
```

### Normalization Decision
```
Does this column hold a value from a bounded list?   → Lookup table + FK
Can this value be described with a display label?    → Lookup table + FK
Will this value repeat across many rows?             → Lookup table + FK
Is it truly free-form user input (names, notes)?     → TEXT or VARCHAR in-place
```

### View Completeness Check
```
Every FK to a lookup table?    → Resolve code + label in the view
Every FK to users?             → Resolve full_name or display_name in the view
Raw integer lookup IDs?        → Keep in view alongside their resolved label (don't drop the ID)
Sensitive internal columns?    → Exclude from the view
```
