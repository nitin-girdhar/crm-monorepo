# Node.js Enterprise — Pre-Delivery Checklist

Run every item before marking a task complete or opening a PR.

## Architecture
- [ ] No business logic in any controller — controllers only parse, delegate, and respond
- [ ] No DB queries in any service — all DB access goes through a repository
- [ ] No `req` / `res` objects referenced in any service or repository
- [ ] No `process.env` access outside `config/index.ts`
- [ ] All domain namespaces in `api/v1/[domain]/` follow the router → controller → service → repository chain

## Validation & Types
- [ ] Every route that accepts input has a Zod schema in `[domain].schema.ts`
- [ ] Validation middleware runs before the controller on every mutating route
- [ ] No `as any` or `// @ts-ignore` used anywhere
- [ ] All service method signatures use explicit typed parameters — no `any` inputs

## Error Handling
- [ ] All thrown errors are instances of `AppError` subclasses (never raw `new Error(…)` in services)
- [ ] All controllers wrap service calls in `try/catch` and forward to `next(err)`
- [ ] Global error handler is the last middleware registered in `server.ts`
- [ ] 404, 401, 403, 409, and 422 cases all produce `{ success: false, error: "…" }` responses

## Security
- [ ] Parameterised queries used everywhere — no string concatenation of user input into SQL
- [ ] Passwords hashed with bcrypt (≥ 12 rounds) or argon2id before persisting
- [ ] JWTs verified in `authenticate` middleware before any route handler runs
- [ ] `helmet()` and `cors()` applied in `server.ts`
- [ ] Rate limiting applied globally AND tighter limit on auth routes
- [ ] `trust proxy` set if deployed behind a load balancer

## Logging
- [ ] Every create / update / delete logs `{ entityId, tenantId, userId }` at `info` level
- [ ] Errors logged with full `err` object and `reqId` for correlation
- [ ] No passwords, tokens, or PII logged anywhere

## Multi-Tenancy
- [ ] Every repository query scopes by `tenantId` — no cross-tenant data leakage possible
- [ ] Service methods receive `session` (not raw `tenantId` strings from request body)
- [ ] `tenantId` is always sourced from the verified JWT session, never from req.body / req.query

## Config
- [ ] All new env vars added to `config/index.ts` Zod schema with appropriate validation
- [ ] App refuses to start (exits with code 1) if any required env var is missing

## Testing
- [ ] Every new service method has a unit test covering happy path and key error branches
- [ ] Every new route has integration tests covering: 200/201, 401, 403, 404 (where applicable), 422
- [ ] Test DB is isolated — no test writes persist between suites
