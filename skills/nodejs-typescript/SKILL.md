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
│   │   ├── client.ts                    ← DB client singleton (Prisma / Drizzle / pg pool)
│   │   └── migrations/                  ← Database migration files
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
import { db }           from '@/lib/db/client';
import type { Create[Entity]Input, [Domain]Filters, [Entity]View } from './[domain].types';
import type { Paginated } from '@/types';

export class [Domain]Repository {
  async findMany(filters: [Domain]Filters & { tenantId: string }): Promise<Paginated<[Entity]View>> {
    const { tenantId, page = 1, limit = 20, search, status } = filters;

    // Example with Prisma — adapt to your ORM / query builder
    const where = {
      tenant_id:  tenantId,
      deleted_at: null,
      ...(status  && { status_code: status }),
      ...(search  && { name: { contains: search, mode: 'insensitive' as const } }),
    };

    const [rows, total] = await Promise.all([
      db.[domain]_view.findMany({ where, take: limit, skip: (page - 1) * limit, orderBy: { created_at: 'desc' } }),
      db.[domain].count({ where }),
    ]);

    return { data: rows as [Entity]View[], total, page, limit };
  }

  async findById(id: string, tenantId: string): Promise<[Entity]View | null> {
    return db.[domain]_view.findFirst({ where: { id, tenant_id: tenantId, deleted_at: null } }) as Promise<[Entity]View | null>;
  }

  async findBySlug(slug: string, tenantId: string): Promise<[Entity]View | null> {
    return db.[domain].findFirst({ where: { slug, tenant_id: tenantId, deleted_at: null } }) as Promise<[Entity]View | null>;
  }

  async create(input: Create[Entity]Input & { tenantId: string; createdBy: string }): Promise<[Entity]View> {
    const row = await db.[domain].create({ data: { ...mapToSnake(input) } });
    return this.findById(row.id, input.tenantId) as Promise<[Entity]View>;
  }

  async update(id: string, input: Update[Entity]Input): Promise<[Entity]View> {
    await db.[domain].update({ where: { id }, data: { ...mapToSnake(input), updated_at: new Date() } });
    return this.findById(id, '*') as Promise<[Entity]View>;
  }

  async softDelete(id: string): Promise<void> {
    await db.[domain].update({ where: { id }, data: { deleted_at: new Date() } });
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
        next(
          new ValidationError("Validation failed", err.flatten().fieldErrors),
        );
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

export class NotFoundError extends AppError {
  constructor(m = "Not found") {
    super(m, HttpStatus.NOT_FOUND);
  }
}
export class UnauthorizedError extends AppError {
  constructor(m = "Unauthorized") {
    super(m, HttpStatus.UNAUTHORIZED);
  }
}
export class ForbiddenError extends AppError {
  constructor(m = "Forbidden") {
    super(m, HttpStatus.FORBIDDEN);
  }
}
export class ConflictError extends AppError {
  constructor(m = "Conflict") {
    super(m, HttpStatus.CONFLICT);
  }
}
export class BadRequestError extends AppError {
  constructor(m: string, d?: unknown) {
    super(m, HttpStatus.BAD_REQUEST, d);
  }
}
export class ValidationError extends AppError {
  constructor(m: string, d?: unknown) {
    super(m, HttpStatus.UNPROCESSABLE, d);
  }
}
export class TooManyRequestsError extends AppError {
  constructor(m = "Too many requests") {
    super(m, HttpStatus.TOO_MANY_REQUESTS);
  }
}
```

```ts
// middleware/error.middleware.ts  ← register LAST in server.ts
import type { Request, Response, NextFunction } from "express";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const level = err.statusCode >= 500 ? "error" : "warn";
    logger[level](
      { err, reqId: req.id, path: req.path, method: req.method },
      err.message,
    );

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

All environment variables are centralised and validated when the process starts. The app refuses to start if any required variable is missing or malformed.

```ts
// config/index.ts
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGINS: z.string().transform((v) => v.split(",").map((s) => s.trim())),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  BCRYPT_ROUNDS: z.coerce.number().min(10).default(12),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error(
    "❌  Invalid environment variables:\n",
    result.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const config = result.data;
```

**Rules:**

- `process.env` is never accessed directly anywhere except `config/index.ts`.
- Every other file imports from `@/config`.

---

## 6. Authentication & Authorisation Middleware

```ts
// middleware/auth.middleware.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";
import { config } from "@/config";

export interface AppSession {
  userId: string;
  tenantId: string;
  role: AppRole;
  email: string;
}

export type AppRole = "admin" | "manager" | "viewer"; // extend as needed

// Augment Express Request type
declare global {
  namespace Express {
    interface Request {
      session: AppSession;
      id: string;
    }
  }
}

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(
      new UnauthorizedError("Missing or malformed Authorization header"),
    );
  }
  try {
    req.session = jwt.verify(header.slice(7), config.JWT_SECRET) as AppSession;
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired token"));
  }
}

export function authorize(...roles: AppRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!roles.includes(req.session.role)) {
      return next(
        new ForbiddenError(`Access requires role: ${roles.join(" or ")}`),
      );
    }
    next();
  };
}
```

---

## 7. Structured Logging

```ts
// lib/logger.ts
import pino from "pino";
import { config } from "@/config";

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: process.env.SERVICE_NAME ?? "api", env: config.NODE_ENV },
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
- Use levels correctly: `info` for normal flow, `warn` for expected client errors, `error` for unexpected server errors, `debug` for development traces only.

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
export interface ApiResponse<T> {
  success: true;
  data: T;
}
export interface ApiListResponse<T> {
  success: true;
  data: T[];
  total: number;
  page: number;
  limit: number;
}
export interface ApiError {
  success: false;
  error: string;
  details?: unknown;
}
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
```

---

## 9. Server Bootstrap & Security

```ts
// server.ts
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { v4 as uuid } from "uuid";
import { config } from "@/config";
import { globalErrorHandler } from "@/middleware/error.middleware";
import { v1Router } from "@/api/v1";
import { logger } from "@/lib/logger";

export function createApp() {
  const app = express();

  // ── Security headers ────────────────────────────────────────────────────
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
  app.set("trust proxy", 1); // required behind a load balancer / reverse proxy

  // ── Request parsing ─────────────────────────────────────────────────────
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // ── Request ID (attach before any logging) ───────────────────────────────
  app.use((req, _res, next) => {
    req.id = uuid();
    next();
  });

  // ── Rate limiting ────────────────────────────────────────────────────────
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 500,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.use("/api/v1/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

  // ── Routes ───────────────────────────────────────────────────────────────
  app.use("/api/v1", v1Router);

  // ── Health check (no auth) ───────────────────────────────────────────────
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", ts: new Date().toISOString() }),
  );

  // ── Global error handler (MUST be last) ─────────────────────────────────
  app.use(globalErrorHandler);

  return app;
}
```

**Security rules:**

- Parameterised queries only — never concatenate user input into SQL strings.
- Passwords hashed with `bcrypt` (rounds ≥ 12) or `argon2id` — never MD5, SHA-1, or SHA-256.
- JWTs signed with HS256 minimum; RS256 / ES256 for multi-service architectures.
- HTTP-only, `SameSite=Strict`, `Secure` cookies for session tokens.
- All user input validated with Zod before it touches a controller.

---

## 10. Background Jobs

```ts
// jobs/[job-name].job.ts
import { Queue, Worker, type Job } from 'bullmq';
import { redis }   from '@/lib/cache/client';
import { logger }  from '@/lib/logger';

// ── Queue (produce) ──────────────────────────────────────────────────────
export const [jobName]Queue = new Queue('[job-name]', { connection: redis });

export async function enqueue[JobName](payload: [JobName]Payload): Promise<void> {
  await [jobName]Queue.add('[job-name]', payload, {
    attempts:    3,
    backoff:     { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 500 },
  });
}

// ── Worker (consume) ─────────────────────────────────────────────────────
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

- Put business logic in a controller (validate → decide → transform → that's the service)
- Put DB queries in a service (any `db.` or ORM call → that's the repository)
- Let a repository import HTTP status codes or reference `req` / `res`
- Access `process.env` anywhere except `config/index.ts`
- Concatenate user input into a SQL string — parameterised queries always
- Store plain-text passwords — always hash before persisting
- Log tokens, raw passwords, or PII — log IDs and metadata only
- Return different response envelope shapes from different endpoints
- Ship auth endpoints without rate limiting
- Register the global error handler anywhere except last in `server.ts`
- Use `as any` or suppress TypeScript errors with `// @ts-ignore`
