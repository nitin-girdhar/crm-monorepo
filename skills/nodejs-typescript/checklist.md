# Node.js Enterprise — Pre-Delivery Checklist

Run every item before marking a task complete or opening a PR.

## Refactor Pre-Flight (run these FIRST when the task is a refactor)
- [ ] Read all files in scope before writing anything — no blind edits
- [ ] Listed all violations found, grouped by severity (critical / high / medium / low)
- [ ] Confirmed with the user whether to fix all violations now or review first (unless user already said "just do it")
- [ ] Refactored in layer order: config → errors → tables → views → repository → service → schema → controller → router → middleware
- [ ] No behaviour was changed — only structure and location of code
- [ ] No public API endpoints were renamed without explicit user approval
- [ ] No files were deleted without explicit user confirmation
- [ ] Any newly required PostgreSQL views were confirmed with the user before migration SQL was written
- [ ] Refactor summary table produced at the end listing every file changed and why

## Architecture
- [ ] No business logic in any controller — controllers only parse, delegate, and respond
- [ ] No DB queries in any service — all DB access goes through a repository
- [ ] No `req` / `res` objects referenced in any service or repository
- [ ] No `process.env` access outside `config/index.ts`
- [ ] All domain namespaces in `api/v1/[domain]/` follow the router → controller → service → repository chain

## DB Views & Multi-Table Data (NEW — check for every repository method)
- [ ] Every repository method that reads from more than one table queries a PostgreSQL **view** — no inline joins in TypeScript or Drizzle query builder
- [ ] All views are registered in `lib/db/schema/views/` as Drizzle `.existing()` view schemas
- [ ] No existing view was silently duplicated — checked `lib/db/schema/views/` before creating a new one
- [ ] If an existing view was extended, human confirmation was obtained and all view consumers re-checked
- [ ] View names follow the `[entity]_summary` / `[entity]_detail` / `[entity]_[context]` convention — no `_view` suffix
- [ ] `tenantId` filtering and `deleted_at IS NULL` filtering applied in the **repository query**, not baked into the view SQL
- [ ] WRITE operations (insert / update / delete) always target the **base table**, never a view
- [ ] Every new view has a `COMMENT ON VIEW` in the migration SQL describing its purpose and which API uses it
- [ ] Migration SQL for new/modified views was produced using the PostgreSQL DB skill

## Validation & Types
- [ ] Every route that accepts input has a Zod schema in `[domain].schema.ts`
- [ ] Validation middleware runs before the controller on every mutating route
- [ ] No `as any` or `// @ts-ignore` used anywhere
- [ ] All service method signatures use explicit typed parameters — no `any` inputs
- [ ] Drizzle view schema columns exactly match the columns returned by the PostgreSQL view — no extras, no missing

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
- [ ] No view definition filters by a hardcoded `tenantId` — views are tenant-agnostic; repositories scope them

## Config
- [ ] All new env vars added to `config/index.ts` Zod schema with appropriate validation
- [ ] App refuses to start (exits with code 1) if any required env var is missing

## Testing
- [ ] Every new service method has a unit test covering happy path and key error branches
- [ ] Every new route has integration tests covering: 200/201, 401, 403, 404 (where applicable), 422
- [ ] Integration tests query the view-backed repository the same way production does — no mocking the view
- [ ] Test DB is isolated — no test writes persist between suites
