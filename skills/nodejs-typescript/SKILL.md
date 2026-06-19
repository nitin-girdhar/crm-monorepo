## When This Skill Applies

Trigger this skill for **any** of the following:
- New feature development (new domain, new route, new service)
- Refactoring existing Node.js backend code
- Adding data-fetching logic that spans more than one table
- Designing or modifying the repository layer
- Any request containing: "build an API", "add an endpoint", "refactor service", "create a module", "I need to fetch X with Y data"

---

## Refactor Protocol — When the User Says "Refactor"

When the user asks to refactor existing code, follow this exact sequence. Do not skip steps or reorder them.

### Step 1 — Read Before Writing

Before touching a single line of code:
1. Read every file the user references or that is clearly in scope.
2. Identify which files exist on disk vs. which are missing from the expected structure.
3. Map what currently exists to the canonical layer it *should* live in (router / controller / service / repository / middleware).

### Step 2 — Surface Violations, Then Ask

After reading, list every violation of the guidelines you found — do not silently fix them without the user knowing. Group them by severity:

| Severity | Examples |
|---|---|
| **Critical** | DB queries in a service, business logic in a controller, `process.env` outside config, missing tenant scoping |
| **High** | Multi-table joins in TypeScript instead of a view, `as any` / `@ts-ignore`, raw `new Error()` in services |
| **Medium** | Missing Zod validation on a route, wrong response envelope shape, no rate limit on auth |
| **Low** | Naming inconsistencies, missing log statements, missing soft-delete guard |

Then ask: *"I found N violations. Should I fix all of them now, or do you want to review the list first?"*

If the user says "just do it" or "fix everything" upfront — proceed without asking. If scope is ambiguous — ask.

### Step 3 — Refactor in Layer Order

Always refactor in this order to avoid cascading type errors:

```
1. config/index.ts          — fix env var access first; everything imports this
2. lib/errors.ts            — fix error classes; services depend on them
3. lib/db/schema/tables/    — fix table schemas; views depend on them
4. lib/db/schema/views/     — create/fix views; repositories depend on them
5. [domain].repository.ts   — fix DB access; services depend on this
6. [domain].service.ts      — fix business logic; controllers depend on this
7. [domain].schema.ts       — fix Zod schemas; routers and controllers depend on this
8. [domain].controller.ts   — fix HTTP layer
9. [domain].router.ts       — fix route declarations last
10. middleware/              — fix cross-cutting concerns
```

### Step 4 — Migration SQL for Any View Changes

If the refactor requires creating or modifying a PostgreSQL view:
- **Stop and ask** the user to confirm the view definition before writing migration SQL.
- Use the PostgreSQL DB skill to produce the migration file.
- Never proceed with a view change that affects other consumers without explicit confirmation.

### Step 5 — Produce a Refactor Summary

After all changes, output a summary table:

```
| File | Change | Reason |
|------|--------|--------|
| orders.service.ts | Moved DB query to orders.repository.ts | DB queries must not live in services |
| orders.repository.ts | Replaced inline join with order_summary view | Multi-table reads must use a PG view |
| lib/db/schema/views/order-summary.view.ts | Created | Drizzle schema for new view |
| config/index.ts | Added STRIPE_SECRET_KEY validation | process.env access was inline in service |
```

### Refactor Rules

- **Never silently change behaviour** — a refactor moves code, it does not change what it does.
- **Never rename public API endpoints** during a structural refactor — raise it as a separate suggestion.
- **Never delete a file** without confirming with the user, even if it's clearly dead code.
- **One layer at a time** — if refactoring service + repository at once would create a broken intermediate state, finish one before starting the other.
- **If a view needs to be created** for the first time during a refactor (because a repository had inline joins), follow the full DB View Protocol in Section 13 and ask the user to confirm the SQL before running it.

---

## ⚠️ DB View Rule — Read Before Writing Any Repository

> **If data for a response requires joining more than one table, you must never build that join logic in TypeScript.**
> Instead: create a PostgreSQL view, then query that view via Drizzle ORM.

This is a hard architectural rule, not a preference. See Section 13 for the full protocol.

---

## 1. Project Structure

This structure is mandatory. Deviate only when the project already has an established convention, and document the deviation explicitly.

```
src/
├── api/
│   └── v1/                              ← Version-prefix all routes from day one
│       ├── [domain]/
│       │   ├── [domain].router.ts       ← Route declarations only — no logic
│       │   ├── [domain].controller.ts   ← HTTP layer: parse req → call service → send res
│       │   ├── [domain].service.ts      ← Business logic — no req/res objects ever
│       │   ├── [domain].repository.ts   ← All DB queries — no business logic
│       │   ├── [domain].schema.ts       ← Zod schemas for request validation + response types
│       │   └── [domain].types.ts        ← Domain-specific interfaces and type aliases
│       └── index.ts                     ← Mounts all domain routers onto /api/v1
│
├── middleware/
│   ├── auth.middleware.ts               ← JWT / session verification; attaches session to req
│   ├── validate.middleware.ts           ← Zod request validation wrapper (body / query / params)
│   ├── error.middleware.ts              ← Global error handler — MUST be registered last
│   ├── rate-limit.middleware.ts         ← Per-route or global rate limiting
│   └── request-id.middleware.ts         ← Attach unique ID to every request for log correlation
│
├── lib/
│   ├── db/
│   │   ├── client.ts                    ← Drizzle ORM client singleton
│   │   ├── schema/
│   │   │   ├── tables/                  ← One file per table: [entity].table.ts
│   │   │   └── views/                   ← One file per view: [view-name].view.ts  ← CRITICAL
│   │   └── migrations/                  ← Database migration files (drizzle-kit)
│   ├── cache/
│   │   └── client.ts                    ← Redis client singleton
│   ├── queue/
│   │   └── client.ts                    ← Job queue client (BullMQ / etc.)
│   ├── logger.ts                        ← Structured logger singleton (Pino)
│   ├── errors.ts                        ← AppError class + typed subclasses + HttpStatus map
│   └── utils/                           ← Pure utility functions — no side effects, no I/O
│
├── jobs/                                ← Background job processors
│   └── [job-name].job.ts
│
├── config/
│   └── index.ts                         ← Env-validated config via Zod; single import everywhere
│
├── types/
│   └── index.ts                         ← Shared types: augmented Express Request, API envelopes
│
├── server.ts                            ← App factory function; exported for testing
└── index.ts                             ← Entry point: calls server.ts, binds to port
```

### Layer responsibilities — enforced without exception

| Layer          | Allowed to know about                                          | Never allowed to know about                       |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| **Router**     | HTTP verbs, URL paths, middleware chain order                  | Business rules, DB queries                        |
| **Controller** | `req`, `res`, `next`; calls one Service method per handler     | DB queries, business rules, other controllers     |
| **Service**    | Business logic; calls Repository and other Services            | `req`, `res`, HTTP status codes                   |
| **Repository** | DB client, SQL / ORM queries; returns domain types             | Business logic, HTTP, other repositories directly |
| **Middleware** | Cross-cutting concerns (auth, logging, validation, rate-limit) | Domain business rules                             |

---

## 2. Layered Architecture — Canonical Implementations

### Router

```ts
// api/v1/[domain]/[domain].router.ts
import { Router }               from 'express';
import { authenticate, authorize } from '@/middleware/auth.middleware';
import { validate }             from '@/middleware/validate.middleware';
import { [Domain]Controller }   from './[domain].controller';
import {
  create[Entity]Schema,
  update[Entity]Schema,
  list[Entity]Schema,
} from './[domain].schema';

const router = Router();
const ctrl   = new [Domain]Controller();

router.get   ('/',    authenticate,                                           ctrl.list);
router.get   ('/:id', authenticate,                                           ctrl.getById);
router.post  ('/',    authenticate, authorize('admin','manager'),
                      validate({ body: create[Entity]Schema }),               ctrl.create);
router.patch ('/:id', authenticate, authorize('admin','manager'),
                      validate({ body: update[Entity]Schema }),               ctrl.update);
router.delete('/:id', authenticate, authorize('admin'),                       ctrl.delete);

export { router as [domain]Router };
```

### Controller

```ts
// api/v1/[domain]/[domain].controller.ts
import type { Request, Response, NextFunction } from 'express';
import { [Domain]Service } from './[domain].service';
import { HttpStatus }      from '@/lib/errors';

export class [Domain]Controller {
  private svc = new [Domain]Service();

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.svc.list(req.query as [Domain]Filters, req.session);
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const item = await this.svc.getById(req.params.id, req.session);
      res.json({ success: true, data: item });
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const item = await this.svc.create(req.body, req.session);
      res.status(HttpStatus.CREATED).json({ success: true, data: item });
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const item = await this.svc.update(req.params.id, req.body, req.session);
      res.json({ success: true, data: item });
    } catch (err) { next(err); }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.svc.delete(req.params.id, req.session);
      res.status(HttpStatus.NO_CONTENT).send();
    } catch (err) { next(err); }
  };
}
```

### Service

```ts
// api/v1/[domain]/[domain].service.ts
import { [Domain]Repository }                        from './[domain].repository';
import { NotFoundError, ConflictError }              from '@/lib/errors';
import { logger }                                    from '@/lib/logger';
import type { AppSession }                           from '@/types';
import type { Create[Entity]Input, Update[Entity]Input, [Domain]Filters, [Entity]View } from './[domain].types';

export class [Domain]Service {
  private repo = new [Domain]Repository();

  async list(filters: [Domain]Filters, session: AppSession): Promise<Paginated<[Entity]View>> {
    // Apply tenancy automatically — service always scopes by tenantId
    return this.repo.findMany({ ...filters, tenantId: session.tenantId });
  }

  async getById(id: string, session: AppSession): Promise<[Entity]View> {
    const item = await this.repo.findById(id, session.tenantId);
    if (!item) throw new NotFoundError('[Entity] not found');
    return item;
  }

  async create(input: Create[Entity]Input, session: AppSession): Promise<[Entity]View> {
    // ── Business rules go here, not in controller or repository ──
    const existing = await this.repo.findBySlug(input.slug, session.tenantId);
    if (existing) throw new ConflictError('[Entity] already exists');

    const item = await this.repo.create({ ...input, tenantId: session.tenantId, createdBy: session.userId });
    logger.info({ entityId: item.id, tenantId: session.tenantId, userId: session.userId }, '[Entity] created');
    return item;
  }

  async update(id: string, input: Update[Entity]Input, session: AppSession): Promise<[Entity]View> {
    await this.getById(id, session);   // validates ownership; throws 404 if not found
    const item = await this.repo.update(id, input);
    logger.info({ entityId: id, tenantId: session.tenantId }, '[Entity] updated');
    return item;
  }

  async delete(id: string, session: AppSession): Promise<void> {
    await this.getById(id, session);
    await this.repo.softDelete(id);
    logger.info({ entityId: id, tenantId: session.tenantId }, '[Entity] deleted');
  }
}
```

### Repository

```ts
// api/v1/[domain]/[domain].repository.ts
// ──────────────────────────────────────────────────────────────────────────────
// READ BEFORE EDITING: If this method fetches data from more than one table,
// it MUST query a PostgreSQL view — not join tables in TypeScript/Drizzle.
// See Section 13: DB View Protocol.
// ──────────────────────────────────────────────────────────────────────────────
import { db }              from '@/lib/db/client';
import { [domain]View }    from '@/lib/db/schema/views/[domain].view';
import { [domain]Table }   from '@/lib/db/schema/tables/[domain].table';
import { eq, and, ilike } from 'drizzle-orm';
import type { Create[Entity]Input, [Domain]Filters, [Entity]View } from './[domain].types';
import type { Paginated } from '@/types';

export class [Domain]Repository {

  // ── READ: always from the view (multi-table shape) ────────────────────────
  async findMany(filters: [Domain]Filters & { tenantId: string }): Promise<Paginated<[Entity]View>> {
    const { tenantId, page = 1, limit = 20, search, status } = filters;
    const offset = (page - 1) * limit;

    const conditions = [
      eq([domain]View.tenantId, tenantId),
      eq([domain]View.deletedAt, null),
      ...(status ? [eq([domain]View.status, status)] : []),
      ...(search ? [ilike([domain]View.name, `%${search}%`)] : []),
    ];

    const [rows, [{ count }]] = await Promise.all([
      db.select().from([domain]View).where(and(...conditions))
        .limit(limit).offset(offset).orderBy([domain]View.createdAt),
      db.select({ count: sql<number>`count(*)::int` }).from([domain]View).where(and(...conditions)),
    ]);

    return { data: rows as [Entity]View[], total: count, page, limit };
  }

  async findById(id: string, tenantId: string): Promise<[Entity]View | null> {
    const rows = await db.select().from([domain]View)
      .where(and(eq([domain]View.id, id), eq([domain]View.tenantId, tenantId)))
      .limit(1);
    return (rows[0] as [Entity]View) ?? null;
  }

  // ── WRITE: always to the base table, never to a view ─────────────────────
  async create(input: Create[Entity]Input & { tenantId: string; createdBy: string }): Promise<[Entity]View> {
    const [row] = await db.insert([domain]Table).values(input).returning({ id: [domain]Table.id });
    return this.findById(row.id, input.tenantId) as Promise<[Entity]View>;
  }

  async update(id: string, input: Update[Entity]Input): Promise<[Entity]View> {
    await db.update([domain]Table)
      .set({ ...input, updatedAt: new Date() })
      .where(eq([domain]Table.id, id));
    return this.findById(id, '*') as Promise<[Entity]View>;
  }

  async softDelete(id: string): Promise<void> {
    await db.update([domain]Table)
      .set({ deletedAt: new Date() })
      .where(eq([domain]Table.id, id));
  }
}
```

---

## 3. Request Validation — Zod at Every Entry Point

Every route that accepts input must have a Zod schema. Validation runs in middleware before the controller executes. Raw, unvalidated input never reaches a controller.

```ts
// api/v1/[domain]/[domain].schema.ts
import { z } from 'zod';

export const create[Entity]Schema = z.object({
  name:     z.string().min(1, 'Name is required').max(200).trim(),
  slug:     z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens').trim(),
  statusId: z.number().int().positive(),
  metadata: z.record(z.unknown()).optional(),
});

export const update[Entity]Schema = create[Entity]Schema.partial();

export const list[Entity]Schema = z.object({
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).trim().optional(),
  status: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt'),
  order:  z.enum(['asc', 'desc']).default('desc'),
});

export type Create[Entity]Input = z.infer<typeof create[Entity]Schema>;
export type Update[Entity]Input = z.infer<typeof update[Entity]Schema>;
export type [Domain]Filters     = z.infer<typeof list[Entity]Schema>;
```

```ts
// middleware/validate.middleware.ts
import type { Request, Response, NextFunction } from "express";
import { z, type ZodSchema } from "zod";
import { ValidationError } from "@/lib/errors";

interface ValidateOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: ValidateOptions) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query) as any;
      if (schemas.params) req.params = schemas.params.parse(req.params) as any;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        next(new ValidationError("Validation failed", err.flatten().fieldErrors));
      } else {
        next(err);
      }
    }
  };
}
```

---

## 4. Typed Error Hierarchy

```ts
// lib/errors.ts
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
} as const;

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = HttpStatus.INTERNAL,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError    extends AppError { constructor(m = "Not found")         { super(m, HttpStatus.NOT_FOUND); } }
export class UnauthorizedError extends AppError { constructor(m = "Unauthorized")      { super(m, HttpStatus.UNAUTHORIZED); } }
export class ForbiddenError    extends AppError { constructor(m = "Forbidden")         { super(m, HttpStatus.FORBIDDEN); } }
export class ConflictError     extends AppError { constructor(m = "Conflict")          { super(m, HttpStatus.CONFLICT); } }
export class BadRequestError   extends AppError { constructor(m: string, d?: unknown)  { super(m, HttpStatus.BAD_REQUEST, d); } }
export class ValidationError   extends AppError { constructor(m: string, d?: unknown)  { super(m, HttpStatus.UNPROCESSABLE, d); } }
export class TooManyRequestsError extends AppError { constructor(m = "Too many requests") { super(m, HttpStatus.TOO_MANY_REQUESTS); } }
```

```ts
// middleware/error.middleware.ts  ← register LAST in server.ts
import type { Request, Response, NextFunction } from "express";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export function globalErrorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    const level = err.statusCode >= 500 ? "error" : "warn";
    logger[level]({ err, reqId: req.id, path: req.path, method: req.method }, err.message);
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(err.details && { details: err.details }),
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
    return;
  }
  logger.error({ err, reqId: req.id }, "Unhandled error");
  res.status(500).json({ success: false, error: "Internal server error" });
}
```

---

## 5. Environment Config — Validated at Startup

```ts
// config/index.ts
import { z } from "zod";

const schema = z.object({
  NODE_ENV:       z.enum(["development", "test", "production"]).default("development"),
  PORT:           z.coerce.number().default(3001),
  DATABASE_URL:   z.string().url(),
  REDIS_URL:      z.string().url().optional(),
  JWT_SECRET:     z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGINS:   z.string().transform((v) => v.split(",").map((s) => s.trim())),
  LOG_LEVEL:      z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  BCRYPT_ROUNDS:  z.coerce.number().min(10).default(12),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error("❌  Invalid environment variables:\n", result.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = result.data;
```

**Rules:** `process.env` is never accessed directly anywhere except `config/index.ts`.

---

## 6. Authentication & Authorisation Middleware

```ts
// middleware/auth.middleware.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";
import { config } from "@/config";

export interface AppSession {
  userId:   string;
  tenantId: string;
  role:     AppRole;
  email:    string;
}

export type AppRole = "admin" | "manager" | "viewer";

declare global {
  namespace Express {
    interface Request {
      session: AppSession;
      id:      string;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(new UnauthorizedError("Missing or malformed Authorization header"));
  try {
    req.session = jwt.verify(header.slice(7), config.JWT_SECRET) as AppSession;
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired token"));
  }
}

export function authorize(...roles: AppRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!roles.includes(req.session.role)) return next(new ForbiddenError(`Access requires role: ${roles.join(" or ")}`));
    next();
  };
}
```

---

## 7. Structured Logging

```ts
// lib/logger.ts
import pino   from "pino";
import { config } from "@/config";

export const logger = pino({
  level: config.LOG_LEVEL,
  base:  { service: process.env.SERVICE_NAME ?? "api", env: config.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.NODE_ENV === "development" && {
    transport: { target: "pino-pretty", options: { colorize: true } },
  }),
});
```

**Logging rules:**
- Log every create / update / delete with `{ entityId, tenantId, userId }`.
- Log errors with the full `err` object and `reqId` for correlation.
- **Never log passwords, raw tokens, credit card numbers, or PII** — log IDs only.
- Use levels correctly: `info` for normal flow, `warn` for expected client errors, `error` for unexpected server errors.

---

## 8. API Response Contract

Every response follows this envelope — never deviate, never return naked arrays or objects.

```
// Success with single resource
{ "success": true, "data": { … } }

// Success with paginated list
{ "success": true, "data": [ … ], "total": 150, "page": 1, "limit": 20 }

// Success with no body  →  HTTP 204, empty body

// Error
{ "success": false, "error": "Human-readable message", "details": { … } }
```

```ts
// types/index.ts
export interface ApiResponse<T>     { success: true; data: T; }
export interface ApiListResponse<T> { success: true; data: T[]; total: number; page: number; limit: number; }
export interface ApiError           { success: false; error: string; details?: unknown; }
export interface Paginated<T>       { data: T[]; total: number; page: number; limit: number; }
```

---

## 9. Server Bootstrap & Security

```ts
// server.ts
import express    from "express";
import helmet     from "helmet";
import cors       from "cors";
import rateLimit  from "express-rate-limit";
import { v4 as uuid } from "uuid";
import { config } from "@/config";
import { globalErrorHandler } from "@/middleware/error.middleware";
import { v1Router } from "@/api/v1";
import { logger }  from "@/lib/logger";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use((req, _res, next) => { req.id = uuid(); next(); });
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));
  app.use("/api/v1/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
  app.use("/api/v1", v1Router);
  app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

  app.use(globalErrorHandler);   // MUST be last
  return app;
}
```

---

## 10. Background Jobs

```ts
// jobs/[job-name].job.ts
import { Queue, Worker, type Job } from 'bullmq';
import { redis }  from '@/lib/cache/client';
import { logger } from '@/lib/logger';

export const [jobName]Queue = new Queue('[job-name]', { connection: redis });

export async function enqueue[JobName](payload: [JobName]Payload): Promise<void> {
  await [jobName]Queue.add('[job-name]', payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 500 },
  });
}

export const [jobName]Worker = new Worker<[JobName]Payload>(
  '[job-name]',
  async (job: Job<[JobName]Payload>) => {
    logger.info({ jobId: job.id, payload: job.data }, '[JobName] started');
    try {
      // … job logic here …
      logger.info({ jobId: job.id }, '[JobName] completed');
    } catch (err) {
      logger.error({ err, jobId: job.id }, '[JobName] failed');
      throw err;   // rethrow so BullMQ retries
    }
  },
  { connection: redis, concurrency: 5 },
);
```

---

## 11. Testing Strategy

```
tests/
├── unit/
│   └── [domain]/
│       └── [domain].service.test.ts      ← Service logic with mocked repository
├── integration/
│   └── [domain]/
│       └── [domain].api.test.ts          ← Full HTTP round-trips against a real test DB
└── helpers/
    ├── setup.ts                           ← Create app, seed DB, teardown after suite
    └── factories/
        └── [entity].factory.ts            ← Type-safe test data builders (faker.js)
```

**Rules:**
- **Unit tests** — mock the repository; test service business rules in isolation.
- **Integration tests** — spin up the real Express app + a dedicated test database; assert full HTTP responses end-to-end. Never mock the DB in integration tests.
- Every new service method gets a unit test.
- Every new route gets integration tests covering: happy path, 401 (no token), 403 (wrong role), 404 (not found), 422 (bad input).

---

## 12. Absolute Prohibitions

Raise a flag and redesign if a requirement appears to demand any of these:

- Put business logic in a controller
- Put DB queries in a service (any `db.` call → that's the repository)
- Let a repository import HTTP status codes or reference `req` / `res`
- Access `process.env` anywhere except `config/index.ts`
- Concatenate user input into a SQL string — parameterised queries always
- Store plain-text passwords — always hash before persisting
- Log tokens, raw passwords, or PII — log IDs and metadata only
- Return different response envelope shapes from different endpoints
- Ship auth endpoints without rate limiting
- Register the global error handler anywhere except last in `server.ts`
- Use `as any` or suppress TypeScript errors with `// @ts-ignore`
- **Write join logic across multiple tables in TypeScript — use a PostgreSQL view instead (see Section 13)**

---

## 13. DB View Protocol — Multi-Table Data Fetching

### The Rule

Whenever a response requires data from **more than one table**, the join logic lives in the database as a PostgreSQL view, not in TypeScript. The repository queries the view via Drizzle ORM. This is non-negotiable.

**Bad (never do this):**
```ts
// ❌ Joining tables in TypeScript / Drizzle query builder
const rows = await db
  .select({ id: orders.id, customerName: customers.name, statusLabel: statuses.label })
  .from(orders)
  .innerJoin(customers, eq(orders.customerId, customers.id))
  .innerJoin(statuses, eq(orders.statusId, statuses.id));
```

**Good:**
```ts
// ✅ Query a view — all join logic lives in PostgreSQL
const rows = await db.select().from(orderSummaryView)
  .where(eq(orderSummaryView.tenantId, tenantId));
```

### Decision Checklist Before Touching the Repository

Before writing any repository method that fetches data, ask:

1. **Does this fetch from more than one table?** → Must use a view.
2. **Does a view already exist that covers (some of) these tables?** → Check `lib/db/schema/views/`. If yes, **ask the human** before creating a new one — the existing view may be extendable.
3. **Can an existing view be extended (add columns, add a joined table)?** → Prefer extending over duplicating. Ask the human to confirm before changing a view that other repositories already use.
4. **Is this genuinely new data that no existing view covers?** → Create a new view following the pattern below. Use the PostgreSQL DB skill to produce the migration SQL.

> **When in doubt, ask.** Creating duplicate views or silently modifying shared views causes hidden regressions. Always surface the question.

### Step-by-Step: Creating a New View

**Step 1 — Write the SQL (use the PostgreSQL DB skill)**

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
FROM [entity] e
JOIN statuses  s ON s.id = e.status_id
JOIN users     u ON u.id = e.created_by
JOIN tenants   t ON t.id = e.tenant_id;

-- Always add a comment describing the view's purpose
COMMENT ON VIEW [view_name] IS 'Read-only projection of [entity] with status label, creator email, and tenant name. Used by [domain] API.';
```

**Step 2 — Register the view with Drizzle ORM**

```ts
// lib/db/schema/views/[view-name].view.ts
import { pgView }   from 'drizzle-orm/pg-core';
import { sql }      from 'drizzle-orm';

// Mirror only the columns returned by the view — no extra columns, no guessing
export const [viewName]View = pgView('[view_name]', {
  id:             uuid('id'),
  tenantId:       uuid('tenant_id'),
  name:           varchar('name', { length: 200 }),
  slug:           varchar('slug', { length: 100 }),
  status:         varchar('status', { length: 50 }),
  statusLabel:    varchar('status_label', { length: 100 }),
  createdByEmail: varchar('created_by_email', { length: 320 }),
  tenantName:     varchar('tenant_name', { length: 200 }),
  createdAt:      timestamp('created_at'),
  updatedAt:      timestamp('updated_at'),
  deletedAt:      timestamp('deleted_at'),
}).existing();
// `.existing()` tells Drizzle this view already exists in the DB — do not try to create it via migrations
```

**Step 3 — Use it in the repository (reads only)**

```ts
// api/v1/[domain]/[domain].repository.ts
import { [viewName]View } from '@/lib/db/schema/views/[view-name].view';
import { [entity]Table }  from '@/lib/db/schema/tables/[entity].table';

export class [Domain]Repository {
  // READ — always from the view
  async findMany(filters: ...) {
    return db.select().from([viewName]View).where(...);
  }

  // WRITE — always to the base table
  async create(input: ...) {
    const [row] = await db.insert([entity]Table).values(input).returning({ id: [entity]Table.id });
    return this.findById(row.id, input.tenantId);
  }
}
```

### Extending an Existing View

If you need one more column from an existing view:

1. **First, ask the human:** "The `order_summary` view already has customer and status data. I'd like to add `warehouse_name` from the `warehouses` table. Can I alter this view, or would you prefer I create a new `order_full_detail` view to avoid breaking other consumers?"
2. If approved to extend: modify the SQL in `CREATE OR REPLACE VIEW` (PostgreSQL allows in-place replacement for non-breaking additions).
3. Update the Drizzle view schema to include the new column.
4. Grep for all other files importing that view and confirm no TypeScript types break.

### View Naming Conventions

| Pattern | Use for |
|---|---|
| `[entity]_summary` | Lightweight list view — joins status/label lookups only |
| `[entity]_detail`  | Full-detail view — all related entities resolved |
| `[entity]_[context]` | Context-specific projection (e.g. `order_billing`, `order_fulfillment`) |

Never name a view after the table it reads from (e.g. `orders_view` is ambiguous). Name it after its purpose.

### What Never Goes in a View

- Aggregations that vary per request (user-specific counts, live totals) → compute in the service or use a materialized view with refresh strategy
- Columns filtered by `tenantId` at the view level → always filter in the repository query, never bake tenancy into the view definition (it makes the view non-reusable)
- Soft-delete filtering (`WHERE deleted_at IS NULL`) at the view level → same reason; let the repository apply it

---

## 14. Drizzle ORM — Table Schema Conventions

```ts
// lib/db/schema/tables/[entity].table.ts
import { pgTable, uuid, varchar, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const [entity]Table = pgTable('[entity]', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId:   uuid('tenant_id').notNull().references(() => tenantsTable.id),
  name:       varchar('name', { length: 200 }).notNull(),
  slug:       varchar('slug', { length: 100 }).notNull(),
  statusId:   integer('status_id').notNull().references(() => statusesTable.id),
  metadata:   jsonb('metadata'),
  createdBy:  uuid('created_by').notNull().references(() => usersTable.id),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
  updatedAt:  timestamp('updated_at').notNull().defaultNow(),
  deletedAt:  timestamp('deleted_at'),
});
```

**Rules:**
- All column names in the database use `snake_case`; Drizzle maps them to `camelCase` in TypeScript.
- Every table has `createdAt`, `updatedAt`, `deletedAt` (soft delete) and a `tenantId` foreign key.
- Use `uuid` primary keys with `gen_random_uuid()` — never auto-increment integers for cross-service safety.
- Never add computed or joined fields to a table schema — those belong in a view schema.
