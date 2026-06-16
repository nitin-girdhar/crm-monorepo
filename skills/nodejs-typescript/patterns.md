# Node.js Enterprise — Patterns Reference

Generic, copy-paste templates. Replace `[Domain]`, `[Entity]`, `[domain]`, `[JobName]` etc.
with your actual names throughout.

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

// Augment Express once, globally
declare global {
  namespace Express {
    interface Request {
      session: AppSession;
      id:      string;         // request correlation ID
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

  await db.$connect();   // verify DB connectivity at startup
  logger.info('Database connected');

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'Server started');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(async () => {
      await db.$disconnect();
      logger.info('Server stopped');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);  // force quit after 10s
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
  return {
    page, limit, total, totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export function paginationToOffset(page: number, limit: number): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}
```

---

## Token Helpers (JWT)

```ts
// lib/utils/token.ts
import jwt            from 'jsonwebtoken';
import { config }     from '@/config';
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

Use for high-volume lists where offset pagination becomes slow.

```ts
// lib/utils/cursor.ts
export function encodeCursor(id: string): string {
  return Buffer.from(id).toString('base64url');
}

export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf8');
}

// Repository usage (Prisma example):
// const rows = await db.entity.findMany({
//   take:   limit + 1,
//   cursor: cursor ? { id: decodeCursor(cursor) } : undefined,
//   skip:   cursor ? 1 : 0,
//   orderBy: { created_at: 'desc' },
// });
// const hasMore = rows.length > limit;
// if (hasMore) rows.pop();
// return { data: rows, nextCursor: hasMore ? encodeCursor(rows.at(-1)!.id) : null };
```

---

## Transactional Service Pattern

```ts
// api/v1/[domain]/[domain].service.ts  — operation spanning multiple repos
import { db } from '@/lib/db/client';

async function transferOwnership(entityId: string, fromUserId: string, toUserId: string, session: AppSession): Promise<void> {
  await db.$transaction(async (tx) => {
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

Decouples side-effects (sending emails, updating caches) from core service logic.

```ts
// lib/events.ts
import { EventEmitter } from 'node:events';

export const domainEvents = new EventEmitter();
domainEvents.setMaxListeners(50);

// Type-safe emitter wrappers
export const events = {
  emit: <T>(event: string, payload: T) => domainEvents.emit(event, payload),
  on:   <T>(event: string, handler: (payload: T) => void | Promise<void>) =>
    domainEvents.on(event, handler),
};

// ── Usage in service ──
// events.emit<EntityCreatedPayload>('entity.created', { entityId: item.id, tenantId: session.tenantId });

// ── Listener (registered in server.ts or a dedicated listeners/index.ts) ──
// events.on<EntityCreatedPayload>('entity.created', async ({ entityId }) => {
//   await emailService.sendWelcome(entityId);
// });
```

---

## Integration Test Setup

```ts
// tests/helpers/setup.ts
import { createApp }  from '@/server';
import { db }         from '@/lib/db/client';
import supertest      from 'supertest';

export const app     = createApp();
export const request = supertest(app);

// Sign a test JWT without hitting the DB
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

// Run before all tests in a suite
export async function setupTestDb() {
  await db.$executeRaw`BEGIN`;
}

// Run after all tests in a suite — rollback keeps test DB clean
export async function teardownTestDb() {
  await db.$executeRaw`ROLLBACK`;
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
        .send({ name: '' });  // violates min(1)
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
      id:        faker.string.uuid(),
      name:      faker.company.name(),
      slug:      faker.helpers.slugify(faker.company.name()).toLowerCase(),
      status:    'active',
      createdAt: faker.date.past().toISOString(),
      updatedAt: faker.date.recent().toISOString(),
      ...overrides,
    };
  },
};
```
