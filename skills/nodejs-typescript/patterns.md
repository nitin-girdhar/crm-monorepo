# Node.js Enterprise — Patterns Reference

Generic, copy-paste templates. Replace `[Domain]`, `[Entity]`, `[domain]`, `[JobName]`, `[view_name]` etc. with your actual names throughout.

---

## Table of Contents
1. [Shared API Types](#shared-api-types)
2. [App Entry Point](#app-entry-point)
3. [Request ID Middleware](#request-id-middleware)
4. [Pagination Utility](#pagination-utility)
5. [Token Helpers (JWT)](#token-helpers-jwt)
6. [Password Helpers (bcrypt)](#password-helpers)
7. [Cursor-Based Pagination](#cursor-based-pagination)
8. [Transactional Service Pattern](#transactional-service-pattern)
9. [Event Emitter / Domain Events](#domain-events)
10. [Integration Test Setup](#integration-test-setup)
11. [Entity Factory (testing)](#entity-factory)
12. [Drizzle Table Schema](#drizzle-table-schema)
13. [PostgreSQL View — Migration SQL](#postgresql-view-migration-sql)
14. [Drizzle View Schema (.existing())](#drizzle-view-schema)
15. [Repository Reading From a View](#repository-reading-from-a-view)
16. [View Extension — Before You Proceed](#view-extension-checklist)
17. [Refactor — Violation Audit Template](#refactor-violation-audit-template)
18. [Refactor — Before/After Examples](#refactor-before-after-examples)
19. [Refactor — Summary Table Template](#refactor-summary-table-template)

---

## Shared API Types

```ts
// types/index.ts
export interface Paginated<T> {
  data:  T[];
  total: number;
  page:  number;
  limit: number;
}

export interface AppSession {
  userId:   string;
  tenantId: string;
  role:     'admin' | 'manager' | 'viewer';
  email:    string;
}

declare global {
  namespace Express {
    interface Request {
      session: AppSession;
      id:      string;
    }
  }
}
```

---

## App Entry Point

```ts
// index.ts
import { createApp } from './server';
import { config }    from '@/config';
import { logger }    from '@/lib/logger';
import { db }        from '@/lib/db/client';

async function main() {
  const app = createApp();

  await db.$connect();
  logger.info('Database connected');

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'Server started');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(async () => {
      await db.$disconnect();
      logger.info('Server stopped');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
```

---

## Request ID Middleware

```ts
// middleware/request-id.middleware.ts
import { v4 as uuid }               from 'uuid';
import type { Request, Response, NextFunction } from 'express';

export function attachRequestId(req: Request, res: Response, next: NextFunction): void {
  req.id = (req.headers['x-request-id'] as string) ?? uuid();
  res.setHeader('x-request-id', req.id);
  next();
}
```

---

## Pagination Utility

```ts
// lib/utils/pagination.ts
export interface PaginationMeta {
  page:        number;
  limit:       number;
  total:       number;
  totalPages:  number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function paginate(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 };
}

export function paginationToOffset(page: number, limit: number): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}
```

---

## Token Helpers (JWT)

```ts
// lib/utils/token.ts
import jwt        from 'jsonwebtoken';
import { config } from '@/config';
import type { AppSession } from '@/types';

export function signAccessToken(payload: AppSession): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: 'refresh' }, config.JWT_SECRET, { expiresIn: '30d' });
}

export function verifyAccessToken(token: string): AppSession {
  return jwt.verify(token, config.JWT_SECRET) as AppSession;
}
```

---

## Password Helpers

```ts
// lib/utils/password.ts
import bcrypt     from 'bcrypt';
import { config } from '@/config';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

---

## Cursor-Based Pagination

```ts
// lib/utils/cursor.ts
export function encodeCursor(id: string): string {
  return Buffer.from(id).toString('base64url');
}

export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf8');
}

// Repository usage (Drizzle example querying a view):
// const rows = await db.select().from([viewName]View)
//   .where(and(
//     eq([viewName]View.tenantId, tenantId),
//     cursor ? gt([viewName]View.id, decodeCursor(cursor)) : undefined,
//   ))
//   .limit(limit + 1)
//   .orderBy(desc([viewName]View.createdAt));
//
// const hasMore = rows.length > limit;
// if (hasMore) rows.pop();
// return { data: rows, nextCursor: hasMore ? encodeCursor(rows.at(-1)!.id) : null };
```

---

## Transactional Service Pattern

```ts
// api/v1/[domain]/[domain].service.ts — operation spanning multiple repos
import { db } from '@/lib/db/client';

async function transferOwnership(
  entityId: string,
  fromUserId: string,
  toUserId: string,
  session: AppSession,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Pass the transaction client into repositories, not the global db singleton
    const entity = await entityRepo.findByIdTx(entityId, session.tenantId, tx);
    if (!entity) throw new NotFoundError('Entity not found');
    if (entity.ownerId !== fromUserId) throw new ForbiddenError('Not the current owner');

    await entityRepo.updateOwnerTx(entityId, toUserId, tx);
    await auditRepo.logTx({ action: 'ownership_transfer', entityId, fromUserId, toUserId, actorId: session.userId }, tx);
  });

  logger.info({ entityId, fromUserId, toUserId }, 'Ownership transferred');
}
```

---

## Domain Events

```ts
// lib/events.ts
import { EventEmitter } from 'node:events';

export const domainEvents = new EventEmitter();
domainEvents.setMaxListeners(50);

export const events = {
  emit: <T>(event: string, payload: T) => domainEvents.emit(event, payload),
  on:   <T>(event: string, handler: (payload: T) => void | Promise<void>) =>
    domainEvents.on(event, handler),
};

// ── Usage in service ──
// events.emit<EntityCreatedPayload>('entity.created', { entityId: item.id, tenantId: session.tenantId });

// ── Listener (registered in server.ts or listeners/index.ts) ──
// events.on<EntityCreatedPayload>('entity.created', async ({ entityId }) => {
//   await emailService.sendWelcome(entityId);
// });
```

---

## Integration Test Setup

```ts
// tests/helpers/setup.ts
import { createApp }     from '@/server';
import { db }            from '@/lib/db/client';
import supertest         from 'supertest';
import { signAccessToken } from '@/lib/utils/token';

export const app     = createApp();
export const request = supertest(app);

export function authHeader(role: AppRole = 'admin', overrides: Partial<AppSession> = {}): string {
  const session: AppSession = {
    userId:   'test-user-id',
    tenantId: 'test-tenant-id',
    email:    'test@example.com',
    role,
    ...overrides,
  };
  return `Bearer ${signAccessToken(session)}`;
}

export async function setupTestDb() {
  await db.execute(sql`BEGIN`);
}

export async function teardownTestDb() {
  await db.execute(sql`ROLLBACK`);
}
```

```ts
// tests/integration/[domain]/[domain].api.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request, authHeader, setupTestDb, teardownTestDb } from '@/tests/helpers/setup';
import { [entity]Factory } from '@/tests/helpers/factories/[entity].factory';

describe('[Domain] API', () => {
  beforeAll(setupTestDb);
  afterAll(teardownTestDb);

  describe('GET /api/v1/[domain]', () => {
    it('returns paginated list for authenticated user', async () => {
      const res = await request
        .get('/api/v1/[domain]')
        .set('Authorization', authHeader('viewer'));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns 401 without token', async () => {
      const res = await request.get('/api/v1/[domain]');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/[domain]', () => {
    it('creates entity for admin', async () => {
      const payload = [entity]Factory.buildCreateInput();
      const res = await request
        .post('/api/v1/[domain]')
        .set('Authorization', authHeader('admin'))
        .send(payload);
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe(payload.name);
    });

    it('returns 403 for viewer role', async () => {
      const res = await request
        .post('/api/v1/[domain]')
        .set('Authorization', authHeader('viewer'))
        .send([entity]Factory.buildCreateInput());
      expect(res.status).toBe(403);
    });

    it('returns 422 for invalid payload', async () => {
      const res = await request
        .post('/api/v1/[domain]')
        .set('Authorization', authHeader('admin'))
        .send({ name: '' });
      expect(res.status).toBe(422);
      expect(res.body.details).toBeDefined();
    });
  });
});
```

---

## Entity Factory (testing)

```ts
// tests/helpers/factories/[entity].factory.ts
import { faker } from '@faker-js/faker';
import type { Create[Entity]Input, [Entity]View } from '@/api/v1/[domain]/[domain].types';

export const [entity]Factory = {
  buildCreateInput(overrides: Partial<Create[Entity]Input> = {}): Create[Entity]Input {
    return {
      name:     faker.company.name(),
      slug:     faker.helpers.slugify(faker.company.name()).toLowerCase(),
      statusId: 1,
      ...overrides,
    };
  },

  buildView(overrides: Partial<[Entity]View> = {}): [Entity]View {
    return {
      id:          faker.string.uuid(),
      name:        faker.company.name(),
      slug:        faker.helpers.slugify(faker.company.name()).toLowerCase(),
      status:      'active',
      statusLabel: 'Active',
      createdAt:   faker.date.past().toISOString(),
      updatedAt:   faker.date.recent().toISOString(),
      ...overrides,
    };
  },
};
```

---

## Drizzle Table Schema

Base table schema — writes always target this.

```ts
// lib/db/schema/tables/[entity].table.ts
import { pgTable, uuid, varchar, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const [entity]Table = pgTable('[entity]', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId:  uuid('tenant_id').notNull(),
  name:      varchar('name', { length: 200 }).notNull(),
  slug:      varchar('slug',  { length: 100 }).notNull(),
  statusId:  integer('status_id').notNull(),
  metadata:  jsonb('metadata'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});
```

---

## PostgreSQL View — Migration SQL

Use the **PostgreSQL DB skill** to generate and run this migration. Never hand-write migration SQL outside that skill.

```sql
-- lib/db/migrations/YYYYMMDD_create_[view_name]_view.sql

CREATE OR REPLACE VIEW [view_name] AS
SELECT
  e.id,
  e.tenant_id,
  e.name,
  e.slug,
  e.created_by,
  e.created_at,
  e.updated_at,
  e.deleted_at,
  s.code   AS status,
  s.label  AS status_label,
  u.email  AS created_by_email,
  t.name   AS tenant_name
FROM [entity]        e
JOIN statuses        s ON s.id = e.status_id
JOIN users           u ON u.id = e.created_by
JOIN tenants         t ON t.id = e.tenant_id;

-- Required: document every view's purpose and consumers
COMMENT ON VIEW [view_name] IS
  'Read-only projection of [entity] joined with status, creator, and tenant. '
  'Consumed by [domain] repository (findMany, findById). '
  'tenantId and deleted_at filters are applied in the repository, not here.';
```

**View SQL rules:**
- Never filter by `tenant_id` inside the view — keep views tenant-agnostic.
- Never filter `deleted_at IS NULL` inside the view — let repositories apply it.
- Always include `deleted_at` as a raw column so repositories can filter.
- Every join must be `JOIN`, not `LEFT JOIN`, unless `NULL` is a valid state your TypeScript types already handle.
- Use `CREATE OR REPLACE VIEW` so re-running the migration is safe.

---

## Drizzle View Schema

Register the view so TypeScript knows its shape. Always use `.existing()`.

```ts
// lib/db/schema/views/[view-name].view.ts
import { pgView }  from 'drizzle-orm/pg-core';
import { uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const [viewName]View = pgView('[view_name]', {
  // ── Mirror the exact columns returned by the SQL view — no extras ──
  id:             uuid('id'),
  tenantId:       uuid('tenant_id'),
  name:           varchar('name',           { length: 200 }),
  slug:           varchar('slug',           { length: 100 }),
  status:         varchar('status',         { length: 50  }),
  statusLabel:    varchar('status_label',   { length: 100 }),
  createdByEmail: varchar('created_by_email', { length: 320 }),
  tenantName:     varchar('tenant_name',    { length: 200 }),
  createdAt:      timestamp('created_at'),
  updatedAt:      timestamp('updated_at'),
  deletedAt:      timestamp('deleted_at'),
}).existing();
// .existing() = Drizzle won't try to CREATE this view in migrations — it already exists in the DB
```

---

## Repository Reading From a View

Full canonical repository using a view for reads and the base table for writes.

```ts
// api/v1/[domain]/[domain].repository.ts
// ── Multi-table reads → [viewName]View  |  Writes → [entity]Table ──────────
import { db }                  from '@/lib/db/client';
import { [viewName]View }      from '@/lib/db/schema/views/[view-name].view';
import { [entity]Table }       from '@/lib/db/schema/tables/[entity].table';
import { eq, and, ilike, sql, isNull } from 'drizzle-orm';
import type { Create[Entity]Input, Update[Entity]Input, [Domain]Filters, [Entity]View } from './[domain].types';
import type { Paginated } from '@/types';

export class [Domain]Repository {

  // ── READS — always from the view ─────────────────────────────────────────

  async findMany(filters: [Domain]Filters & { tenantId: string }): Promise<Paginated<[Entity]View>> {
    const { tenantId, page = 1, limit = 20, search, status } = filters;

    const where = and(
      eq([viewName]View.tenantId, tenantId),
      isNull([viewName]View.deletedAt),
      status ? eq([viewName]View.status, status) : undefined,
      search ? ilike([viewName]View.name, `%${search}%`) : undefined,
    );

    const [rows, [{ count }]] = await Promise.all([
      db.select().from([viewName]View)
        .where(where)
        .limit(limit)
        .offset((page - 1) * limit)
        .orderBy([viewName]View.createdAt),
      db.select({ count: sql<number>`count(*)::int` })
        .from([viewName]View)
        .where(where),
    ]);

    return { data: rows as [Entity]View[], total: count, page, limit };
  }

  async findById(id: string, tenantId: string): Promise<[Entity]View | null> {
    const rows = await db.select()
      .from([viewName]View)
      .where(and(
        eq([viewName]View.id, id),
        eq([viewName]View.tenantId, tenantId),
        isNull([viewName]View.deletedAt),
      ))
      .limit(1);
    return (rows[0] as [Entity]View) ?? null;
  }

  // ── WRITES — always to the base table ────────────────────────────────────

  async create(input: Create[Entity]Input & { tenantId: string; createdBy: string }): Promise<[Entity]View> {
    const [row] = await db
      .insert([entity]Table)
      .values(input)
      .returning({ id: [entity]Table.id });
    // Re-read from the view so the response includes all joined fields
    return this.findById(row.id, input.tenantId) as Promise<[Entity]View>;
  }

  async update(id: string, input: Update[Entity]Input, tenantId: string): Promise<[Entity]View> {
    await db.update([entity]Table)
      .set({ ...input, updatedAt: new Date() })
      .where(eq([entity]Table.id, id));
    return this.findById(id, tenantId) as Promise<[Entity]View>;
  }

  async softDelete(id: string): Promise<void> {
    await db.update([entity]Table)
      .set({ deletedAt: new Date() })
      .where(eq([entity]Table.id, id));
  }

  // ── TRANSACTIONAL variant (for use inside db.transaction()) ──────────────

  async findByIdTx(id: string, tenantId: string, tx: typeof db): Promise<[Entity]View | null> {
    const rows = await tx.select()
      .from([viewName]View)
      .where(and(eq([viewName]View.id, id), eq([viewName]View.tenantId, tenantId)))
      .limit(1);
    return (rows[0] as [Entity]View) ?? null;
  }
}
```

---

## View Extension Checklist

Before modifying an existing view to add columns, run through this:

```
1. Which view am I modifying? _______________
2. Which files currently import this view?
   Run: grep -r "[view-name].view" src/ --include="*.ts"
   Files found: _______________
3. Will the new column(s) break any existing TypeScript consumers? (y/n) ___
4. Is this change backward-compatible (additive only)? (y/n) ___
5. STOP — ask the human for confirmation before proceeding if:
   - Any existing file imports the view (risk of breaking consumers)
   - The change is not purely additive
   - You are unsure whether a new view vs. extension is cleaner
```

**Template question to ask the human:**

> "The `[view_name]` view already joins `[existing_tables]`. I need `[new_column]` from `[new_table]`. Should I:
> (A) Extend `[view_name]` in-place (additive change, no breaking impact), or
> (B) Create a new `[proposed_new_view_name]` view for this use case?
> The existing view is used by: `[list files]`."


---

## Refactor — Violation Audit Template

Paste this block as a comment at the top of a refactor task. Fill it in after reading all files, before writing any code.

```
REFACTOR AUDIT — [domain or file range]
========================================

CRITICAL
--------
[ ] [filename] — [violation description]
    Fix: [what needs to happen]

HIGH
----
[ ] [filename] — [violation description]
    Fix: [what needs to happen]

MEDIUM
------
[ ] [filename] — [violation description]
    Fix: [what needs to happen]

LOW
---
[ ] [filename] — [violation description]
    Fix: [what needs to happen]

VIEW CHANGES REQUIRED
---------------------
New views needed:    [view_name] — joins [table_a] + [table_b] for [use case]
Views to extend:     [view_name] — add [column] from [table]  ← needs user confirmation
Views unchanged:     [view_name]

LAYER ORDER FOR THIS REFACTOR
------------------------------
1. [ ] config/index.ts
2. [ ] lib/errors.ts
3. [ ] lib/db/schema/tables/[entity].table.ts
4. [ ] lib/db/schema/views/[view-name].view.ts   ← confirm SQL with user first
5. [ ] [domain].repository.ts
6. [ ] [domain].service.ts
7. [ ] [domain].schema.ts
8. [ ] [domain].controller.ts
9. [ ] [domain].router.ts
10. [ ] middleware/
```

---

## Refactor — Before/After Examples

### DB query in a service (Critical violation)

**Before (wrong):**
```ts
// orders.service.ts — VIOLATION: DB query in service
async getOrder(id: string, session: AppSession) {
  const order = await db.query(`
    SELECT o.*, c.name as customer_name, s.label as status_label
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    JOIN statuses  s ON s.id = o.status_id
    WHERE o.id = $1 AND o.tenant_id = $2
  `, [id, session.tenantId]);
  if (!order.rows[0]) throw new Error('Not found');  // also wrong: raw Error
  return order.rows[0];
}
```

**After (correct):**
```ts
// orders.service.ts — clean: delegates to repo, throws typed error
async getOrder(id: string, session: AppSession): Promise<OrderView> {
  const order = await this.repo.findById(id, session.tenantId);
  if (!order) throw new NotFoundError('Order not found');
  return order;
}

// orders.repository.ts — reads from view
async findById(id: string, tenantId: string): Promise<OrderView | null> {
  const rows = await db.select()
    .from(orderSummaryView)
    .where(and(
      eq(orderSummaryView.id, id),
      eq(orderSummaryView.tenantId, tenantId),
      isNull(orderSummaryView.deletedAt),
    ))
    .limit(1);
  return (rows[0] as OrderView) ?? null;
}

// lib/db/schema/views/order-summary.view.ts
export const orderSummaryView = pgView('order_summary', {
  id:           uuid('id'),
  tenantId:     uuid('tenant_id'),
  customerName: varchar('customer_name', { length: 200 }),
  statusLabel:  varchar('status_label',  { length: 100 }),
  // ... etc
}).existing();
```

---

### Business logic in a controller (Critical violation)

**Before (wrong):**
```ts
// orders.controller.ts — VIOLATION: business logic in controller
create = async (req, res, next) => {
  try {
    const existing = await db.query('SELECT id FROM orders WHERE slug = $1', [req.body.slug]);
    if (existing.rows.length) return res.status(409).json({ success: false, error: 'Already exists' });
    const order = await db.query('INSERT INTO orders ...', [...]);
    res.status(201).json({ success: true, data: order.rows[0] });
  } catch (err) { next(err); }
};
```

**After (correct):**
```ts
// orders.controller.ts — clean: parse, delegate, respond only
create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const order = await this.svc.create(req.body, req.session);
    res.status(HttpStatus.CREATED).json({ success: true, data: order });
  } catch (err) { next(err); }
};

// orders.service.ts — business rule lives here
async create(input: CreateOrderInput, session: AppSession): Promise<OrderView> {
  const existing = await this.repo.findBySlug(input.slug, session.tenantId);
  if (existing) throw new ConflictError('Order already exists');
  return this.repo.create({ ...input, tenantId: session.tenantId, createdBy: session.userId });
}
```

---

### `process.env` outside config (High violation)

**Before (wrong):**
```ts
// orders.service.ts — VIOLATION: direct env access
const secret = process.env.STRIPE_SECRET_KEY;
```

**After (correct):**
```ts
// config/index.ts — add to Zod schema
STRIPE_SECRET_KEY: z.string().min(1),

// orders.service.ts — import from config
import { config } from '@/config';
const secret = config.STRIPE_SECRET_KEY;
```

---

### Inline multi-table join in TypeScript (High violation)

**Before (wrong):**
```ts
// orders.repository.ts — VIOLATION: join logic in TypeScript
async findMany(tenantId: string) {
  return db.select({
    id:           orders.id,
    customerName: customers.name,
    statusLabel:  statuses.label,
  })
  .from(orders)
  .innerJoin(customers, eq(orders.customerId, customers.id))
  .innerJoin(statuses,  eq(orders.statusId,  statuses.id))
  .where(eq(orders.tenantId, tenantId));
}
```

**After (correct):**
```
Action required before writing code:
1. Ask user: "I need to create an `order_summary` view joining orders, customers, statuses.
   Should I proceed, or does a similar view already exist?"
2. Once confirmed → write migration SQL using PostgreSQL DB skill
3. Register as Drizzle .existing() view
4. Query the view in the repository
```

```ts
// orders.repository.ts — clean: reads from view
async findMany(tenantId: string): Promise<OrderView[]> {
  return db.select()
    .from(orderSummaryView)
    .where(and(
      eq(orderSummaryView.tenantId, tenantId),
      isNull(orderSummaryView.deletedAt),
    ));
}
```

---

## Refactor — Summary Table Template

Output this table at the end of every refactor task.

```markdown
## Refactor Complete — Summary

| File | Action | Reason |
|------|--------|--------|
| `src/api/v1/orders/orders.service.ts` | Removed DB query; delegated to repository | DB queries must not live in services |
| `src/api/v1/orders/orders.repository.ts` | Replaced 3-table Drizzle join with `order_summary` view query | Multi-table reads must use a PG view |
| `src/lib/db/schema/views/order-summary.view.ts` | Created | Drizzle `.existing()` schema for new view |
| `src/lib/db/migrations/20240601_create_order_summary_view.sql` | Created | PostgreSQL view definition |
| `src/api/v1/orders/orders.controller.ts` | Removed duplicate slug-check logic | Business rules belong in the service |
| `src/config/index.ts` | Added `STRIPE_SECRET_KEY` to Zod schema | `process.env` was accessed directly in service |

### Violations Fixed
- [x] Critical: DB query in `orders.service.ts`
- [x] High: Inline 3-table join in `orders.repository.ts` → replaced with `order_summary` view
- [x] High: `process.env.STRIPE_SECRET_KEY` accessed directly → moved to `config/index.ts`
- [x] Medium: Duplicate slug check in controller → moved to service

### Items Not Changed (require separate PR or user decision)
- `orders.router.ts` — endpoint paths are correct but auth middleware order should be reviewed separately
```
