---
name: pg-database-dev
description: >
  Use this skill for ALL PostgreSQL database design and development tasks. Triggers include: designing schemas, writing migrations, creating tables, normalization, adding indexes, building views, seeding data, or any mention of PostgreSQL, Postgres, database schema, SQL schema, or DB design. Also trigger for tasks like "model this data in a database", "design a schema for X", "set up tables for Y", or any request that involves structuring relational data — even if the word 'PostgreSQL' isn't used but a relational DB is implied.
---

# PostgreSQL Database Development Skill

A strict, opinionated standard for PostgreSQL schema design. Follow every rule in this document every time — do not skip sections or apply rules selectively.

---

## Core Rules (Non-Negotiable)

### 1. Naming Conventions
- **All identifiers** (tables, columns, constraints, indexes, views, functions) must use `snake_case`
- Table names: **plural nouns** (`users`, `order_items`, `product_categories`)
- View names: table name + `_vw` suffix (`users_vw`, `order_items_vw`)
- Index names: `idx_{table}_{column(s)}` (`idx_orders_user_id`)
- FK constraint names: `fk_{table}_{referenced_table}` (`fk_orders_users`)
- PK constraint names: `pk_{table}` (`pk_orders`)
- Unique constraint names: `uq_{table}_{column(s)}` (`uq_users_email`)

### 2. Primary Keys — Choose the Right Type

| Situation | ID Type | Reasoning |
|---|---|---|
| Lookup / reference tables (roles, statuses, types) with bounded records | `SMALLINT` (≤ 32K rows) or `INT` (≤ 2B rows) | Compact, fast joins, human-readable |
| Core domain tables with moderate growth (users, products, orders) | `INT` or `BIGINT` | Balance of size vs. range |
| High-volume tables (events, logs, audit trails, messages) | `UUID` (`gen_random_uuid()`) | Avoids hotspot inserts, safe for distributed systems |
| Tables shared across tenants or exported externally | `UUID` | Prevents ID enumeration and collision |

Always declare PK explicitly:
```sql
id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
-- or
id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
```

### 3. Normalization & Lookup Tables
- Identify **any column that holds a bounded set of values** (status, type, category, role, priority, country, currency, etc.) — **extract it into a lookup table**
- Lookup tables use `INT` or `SMALLINT` PKs
- The referencing column becomes a FK to that lookup table
- **Never use bare `VARCHAR` or `TEXT` for enum-like values** that repeat across rows

#### Lookup Table Template
```sql
CREATE TABLE {entity}_types (
    id          SMALLINT    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        VARCHAR(50) NOT NULL,
    label       VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    sort_order  SMALLINT    NOT NULL DEFAULT 0,
    CONSTRAINT uq_{entity}_types_code UNIQUE (code)
);
```

### 4. Optimized Data Types — Always Pick the Smallest Correct Type

| Data | Use | Avoid |
|---|---|---|
| True/false | `BOOLEAN` | `SMALLINT`, `CHAR(1)` |
| Short codes, slugs (≤ 50 chars) | `VARCHAR(n)` with tight `n` | `TEXT` |
| Long freeform text | `TEXT` | `VARCHAR(10000)` |
| Whole numbers, small | `SMALLINT` | `INT` |
| Whole numbers, normal | `INT` | `BIGINT` |
| Money / currency | `NUMERIC(15,2)` | `FLOAT`, `REAL` |
| Timestamps | `TIMESTAMPTZ` | `TIMESTAMP` (no tz) |
| Date only | `DATE` | `TIMESTAMPTZ` |
| JSON blobs | `JSONB` | `JSON`, `TEXT` |
| Enums that never change | `PostgreSQL ENUM type` or lookup table | bare `TEXT` |
| IP addresses | `INET` | `VARCHAR` |
| UUIDs | `UUID` | `VARCHAR(36)` |
| Binary data | `BYTEA` | `TEXT` |

### 5. Every Table Must Have Audit Columns
```sql
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```
Add a trigger to auto-update `updated_at` on every row change (see reference file for trigger template).

### 6. Foreign Keys — Always Explicit
```sql
CONSTRAINT fk_{table}_{ref_table}
    FOREIGN KEY ({col}) REFERENCES {ref_table}({col})
    ON DELETE {RESTRICT | CASCADE | SET NULL}   -- choose deliberately
    ON UPDATE CASCADE
```
- Use `RESTRICT` when deleting a parent should be blocked (default safe choice)
- Use `CASCADE` only when child rows are meaningless without the parent
- Use `SET NULL` for optional relationships

### 7. Indexes — Required Patterns
Always create indexes on:
1. Every FK column
2. Columns used in `WHERE` clauses for common queries
3. Columns used in `ORDER BY` for paginated queries
4. `(tenant_id, other_col)` composites for multi-tenant systems

```sql
CREATE INDEX idx_{table}_{col} ON {table} ({col});
CREATE INDEX idx_{table}_{col1}_{col2} ON {table} ({col1}, {col2});
```

For text search:
```sql
CREATE INDEX idx_{table}_{col}_gin ON {table} USING gin(to_tsvector('english', {col}));
```

### 8. Views — Required for Every Table
Create a `_vw` view that:
- Joins lookup table IDs to human-readable `label` columns
- Formats timestamps in ISO 8601
- Aliases FK IDs to meaningful names (e.g., `status_label`, `category_name`)
- Excludes internal/sensitive columns as needed

```sql
CREATE OR REPLACE VIEW {table}_vw AS
SELECT
    t.id,
    t.some_column,
    st.label       AS status_label,
    ct.label       AS category_label,
    t.created_at,
    t.updated_at
FROM {table} t
LEFT JOIN status_types st ON st.id = t.status_id
LEFT JOIN category_types ct ON ct.id = t.category_id;
```

### 9. Seed Data — Always Include
Seed data must cover:
- All lookup/reference table rows (every code and label)
- At least 5–10 realistic domain records per major table
- Edge cases: null optionals, max-length strings, boundary dates, zero/negative amounts where valid
- At least one record per status/type combination to test all branches

---

## Delivery Checklist

Before finalizing any schema output, verify:

- [ ] All names are `snake_case`
- [ ] Every table has a PK with the right type (`SMALLINT/INT/BIGINT/UUID`)
- [ ] All bounded-value columns extracted to lookup tables with FK references
- [ ] All FK constraints named and declared explicitly
- [ ] Data types are the smallest correct type for each column
- [ ] `created_at` / `updated_at` on every table
- [ ] `updated_at` trigger created
- [ ] Index on every FK column + query-critical columns
- [ ] `_vw` view for every table with lookup joins resolved to labels
- [ ] Seed data covers all lookup values + edge cases

---

## Output Structure

Deliver SQL in this order:

```
1. Extensions (if needed)
2. Lookup / reference tables  (with seed data immediately after each)
3. Core domain tables         (with seed data immediately after each)
4. FK constraints             (if deferred; else inline above)
5. Indexes
6. updated_at triggers
7. Views (_vw)
```

Read `references/templates.md` for copy-paste templates for triggers, views, and common patterns.

---

## Quick Reference — When to Use UUID vs INT

```
Lookup table (statuses, roles, types)?         → SMALLINT
Config/settings table?                         → INT
User-facing domain table (users, products)?    → INT or UUID (prefer UUID if exported/shared)
Event/log/audit table?                         → UUID
Multi-tenant or distributed system?            → UUID everywhere
```
