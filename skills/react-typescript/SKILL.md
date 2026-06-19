# React Enterprise — Monorepo Skill

> This skill is the **authoritative baseline** for all React/TypeScript work in this monorepo.
> When the user asks to **refactor** existing code, treat every rule here as a hard constraint —
> even if the existing codebase violates it. Migrate the code to this standard; do not preserve
> old patterns out of deference to prior work.

---

## Core Principles

1. **Frontend and backend are completely separate services** running in their own Docker containers.
   The frontend never imports, requires, or monkey-patches backend code. The only bridge is HTTP APIs
   defined in `lib/api/client.ts`.

2. **Every `.tsx` file has a paired `.module.css` file.** Logic lives in `.tsx`. Every visual
   decision — spacing, colour, typography, layout — lives in `.module.css`. Changing how a component
   *looks* must never require touching the `.tsx` file.

3. **Tenant/org theming is pure CSS.** Adding a new tenant requires exactly one new CSS file and
   zero component or configuration changes.

4. **`lib/api/client.ts` is the only file that calls `fetch`.** No exceptions. No workarounds.

---

## 1. Monorepo Structure

```
monorepo/
├── apps/
│   ├── web/                          ← React / Next.js frontend (own Docker)
│   └── api/                          ← Backend service(s) (own Docker)
│
└── packages/
    └── shared/                       ← Platform-neutral code: types, schemas, utils
        ├── src/
        │   ├── types/index.ts        ← All shared entity types and API contracts
        │   ├── schemas/              ← Zod schemas (consumed by both web + api)
        │   ├── formatters/           ← Pure date/currency/phone formatters
        │   ├── validators/           ← Form validation schemas
        │   ├── constants/            ← Status maps, role maps, pagination defaults
        │   └── index.ts
        └── package.json              ← No peerDeps on react-dom, react-native, express, etc.
```

### Frontend app structure (`apps/web/src/`)

```
src/
├── app/                              ← Route entry points ONLY — no logic, no state
│   └── (feature-group)/
│       └── [feature]/
│           ├── page.tsx              ← Server Component: resolve auth → fetch → render Shell
│           └── layout.tsx            ← Segment layout + ErrorBoundary
│
├── components/
│   ├── ui/                           ← Design-system primitives — zero domain knowledge
│   │   ├── Button/
│   │   │   ├── Button.tsx            ← Logic + props only
│   │   │   ├── Button.module.css     ← All visual styles
│   │   │   └── index.ts
│   │   ├── Input/
│   │   │   ├── Input.tsx
│   │   │   ├── Input.module.css
│   │   │   └── index.ts
│   │   └── index.ts                  ← Barrel: re-exports every ui/ primitive
│   │
│   ├── [domain]/                     ← One folder per business domain
│   │   ├── [Domain]Shell.tsx         ← Orchestrator: owns state, wires composites
│   │   ├── [Domain]Shell.module.css
│   │   ├── [Domain]Table.tsx         ← Composite: data via props, typed callbacks out
│   │   ├── [Domain]Table.module.css
│   │   ├── [Domain]Form.tsx
│   │   ├── [Domain]Form.module.css
│   │   ├── [Domain]Filters.tsx
│   │   └── [Domain]Filters.module.css
│   │
│   └── layout/                       ← App chrome: Sidebar, TopBar, ErrorBoundary
│       ├── Sidebar.tsx
│       ├── Sidebar.module.css
│       └── ErrorBoundary.tsx
│
├── hooks/                            ← Custom hooks — NO JSX ever in this folder
│   ├── use[Domain].ts
│   └── use[Domain]Filters.ts
│
├── lib/
│   ├── api/
│   │   ├── client.ts                 ← THE ONLY file that calls fetch
│   │   └── schemas/                  ← Frontend-side Zod response validators
│   └── utils/                        ← Pure functions: zero React imports
│
├── styles/
│   ├── globals.css                   ← CSS reset + base typography
│   ├── tokens.css                    ← All design tokens (the single source of truth)
│   └── themes/                       ← One file per tenant — only overrides brand tokens
│       ├── default.css
│       ├── acme.css
│       └── [tenant-slug].css
│
├── providers/                        ← React context: AuthProvider, ThemeProvider, ToastProvider
├── config/
│   └── routes.ts                     ← Route constants + role-based nav — no JSX
└── types/
    └── index.ts                      ← Re-exports from packages/shared + web-only types
```

### Enforcement table

| Location                  | Allowed                                          | Never allowed                                       |
|---------------------------|--------------------------------------------------|-----------------------------------------------------|
| `app/*/page.tsx`          | Auth check, initial fetch, render Shell          | `useState`, event handlers, business logic          |
| `components/ui/`          | Generic HTML props, variant/size props, tokens   | Domain types, API calls, any business knowledge     |
| `components/[domain]/`    | Domain types, callback props, Shell calls hooks  | Direct `fetch`, importing `lib/api/client` in composites |
| `hooks/`                  | State, effects, calls to `lib/api/client`        | JSX, returning component trees                      |
| `lib/api/client.ts`       | All HTTP calls, all Zod response validation      | Anything else                                       |
| `lib/utils/`              | Pure functions                                   | React imports, side effects, API calls              |
| `*.module.css`            | Token variables, layout, visual styles           | Hardcoded hex/rgb/hsl, hardcoded px/rem literals    |
| `*.tsx`                   | Logic, structure, class names from module.css    | Inline `style={{}}` with raw values, Tailwind colour/typography classes |
| `packages/shared/`        | Platform-neutral types, schemas, formatters      | DOM APIs, React, Express, any runtime-specific code |

---

## 2. TSX / CSS Separation Law

Every component file pair follows this split:

| File              | Contains                                                        | Never contains                             |
|-------------------|-----------------------------------------------------------------|--------------------------------------------|
| `Component.tsx`   | Props interface, logic, JSX structure, `styles.className` refs  | Visual values (colours, spacing, sizes)    |
| `Component.module.css` | All visual rules via CSS token vars                        | Business logic, JS expressions             |

**Why this matters:** Designers and brand teams can make complete look-and-feel changes by editing
only `.module.css` and `styles/themes/[tenant].css`. They never open a `.tsx` file.

```tsx
// ✅ Component.tsx — references class names only, zero visual values
import styles from './Button.module.css';
import { clsx } from 'clsx';

export function Button({ variant = 'primary', size = 'md', loading, children, className, ...rest }: ButtonProps) {
  return (
    <button
      className={clsx(styles.root, styles[`variant__${variant}`], styles[`size__${size}`], className)}
      aria-busy={loading}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size={size} /> : children}
    </button>
  );
}
```

```css
/* ✅ Button.module.css — all visual decisions here, all via tokens */
.root {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: background 150ms ease;
}
.root:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.root:disabled { opacity: 0.5; cursor: not-allowed; }

.variant__primary  { background: var(--color-primary); color: var(--color-primary-fg); }
.variant__primary:hover { background: var(--color-primary-hover); }
.variant__secondary { background: var(--color-surface-raised); color: var(--color-text); border: 1px solid var(--color-border); }
.variant__ghost  { background: transparent; color: var(--color-primary); border: 1px solid var(--color-border); }
.variant__danger { background: var(--color-danger); color: var(--color-primary-fg); }
.variant__danger:hover { background: var(--color-danger-hover); }

.size__sm { padding: var(--space-1) var(--space-3); font-size: var(--text-xs); }
.size__lg { padding: var(--space-3) var(--space-6); font-size: var(--text-base); }

@media (prefers-reduced-motion: no-preference) {
  .root { transition: background 150ms ease, box-shadow 150ms ease; }
}
```

---

## 3. CSS Architecture — Tokens & Per-Tenant Theming

### `styles/tokens.css` — the single source of truth

All visual values live here as CSS custom properties. **Zero component files may reference a colour,
spacing value, or font size that is not a token.**

```css
/* styles/tokens.css */
:root {
  /* ── Brand (overridden per tenant in styles/themes/) ── */
  --color-primary:        #6366f1;
  --color-primary-hover:  #4f46e5;
  --color-primary-fg:     #ffffff;
  --color-accent:         #f59e0b;
  --color-danger:         #ef4444;
  --color-danger-hover:   #dc2626;
  --color-success:        #22c55e;
  --color-warning:        #f59e0b;
  --color-info:           #3b82f6;

  /* ── Neutrals ── */
  --color-surface:         #ffffff;
  --color-surface-raised:  #f8fafc;
  --color-surface-overlay: #f1f5f9;
  --color-border:          #e2e8f0;
  --color-border-strong:   #cbd5e1;
  --color-text:            #0f172a;
  --color-text-muted:      #64748b;
  --color-text-subtle:     #94a3b8;
  --color-text-inverse:    #ffffff;

  /* ── Spacing (4 px base grid) ── */
  --space-1:  0.25rem;  /*  4px */
  --space-2:  0.5rem;   /*  8px */
  --space-3:  0.75rem;  /* 12px */
  --space-4:  1rem;     /* 16px */
  --space-6:  1.5rem;   /* 24px */
  --space-8:  2rem;     /* 32px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */

  /* ── Typography ── */
  --font-sans:    "Inter", system-ui, -apple-system, sans-serif;
  --font-mono:    "JetBrains Mono", "Fira Code", monospace;
  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;
  --text-3xl:  1.875rem;
  --leading-tight:  1.25;
  --leading-normal: 1.5;
  --font-normal:   400;
  --font-medium:   500;
  --font-semibold: 600;
  --font-bold:     700;

  /* ── Border radius ── */
  --radius-sm:   0.25rem;
  --radius-md:   0.375rem;
  --radius-lg:   0.5rem;
  --radius-xl:   0.75rem;
  --radius-full: 9999px;

  /* ── Shadows ── */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);

  /* ── Z-index ── */
  --z-base:     0;
  --z-raised:   10;
  --z-dropdown: 100;
  --z-sticky:   200;
  --z-overlay:  300;
  --z-modal:    400;
  --z-toast:    500;
}

/* Dark mode — override surface + text tokens only */
@media (prefers-color-scheme: dark) {
  :root {
    --color-surface:         #0f172a;
    --color-surface-raised:  #1e293b;
    --color-surface-overlay: #334155;
    --color-border:          #334155;
    --color-border-strong:   #475569;
    --color-text:            #f1f5f9;
    --color-text-muted:      #94a3b8;
    --color-text-subtle:     #64748b;
  }
}
```

### Per-tenant theme files (`styles/themes/[tenant-slug].css`)

A tenant theme overrides **only the brand colour tokens**. Zero component changes.
Zero configuration changes. One new CSS file = full rebrand.

```css
/* styles/themes/acme.css */
[data-tenant="acme"] {
  --color-primary:       #0ea5e9;
  --color-primary-hover: #0284c7;
  --color-primary-fg:    #ffffff;
  --color-accent:        #f97316;
}

/* styles/themes/globex.css */
[data-tenant="globex"] {
  --color-primary:       #16a34a;
  --color-primary-hover: #15803d;
  --color-primary-fg:    #ffffff;
  --color-accent:        #7c3aed;
  /* Override radius for a sharper brand feel */
  --radius-sm: 0;
  --radius-md: 0.125rem;
  --radius-lg: 0.25rem;
}
```

Apply the tenant attribute server-side in the root layout — no client JS required:

```tsx
// app/layout.tsx
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en" data-tenant={session?.tenantSlug ?? 'default'}>
      <head />
      <body>{children}</body>
    </html>
  );
}
```

> **Adding a new tenant:** create `styles/themes/[slug].css`, import it in `globals.css`
> (`@import './themes/[slug].css'`), and set `tenantSlug` in the session. Done.

### CSS Module rules

- Every component with more than 2 style rules has a co-located `.module.css`.
- Never reference another component's module class names.
- Compose variants using `clsx` in `.tsx`, **not** string interpolation.
- No Tailwind colour, spacing, or typography utilities (`text-indigo-500`, `font-semibold`, `p-4`).
  Tailwind structural helpers (`flex`, `grid`, `hidden`) are acceptable for layout-only one-liners.

---

## 4. API Boundary — Frontend ↔ Backend

**Rule: the frontend and backend are separate Docker services. They share type contracts via
`packages/shared` but never share runtime code.**

```
[ Browser / Next.js SSR ]
        │  HTTP only
        ▼
[ API service (Docker) ] ──── own DB, own business logic
```

### `lib/api/client.ts` — the only HTTP file

```ts
// apps/web/src/lib/api/client.ts
import { z } from 'zod';
import type { EntityFilters, EntityView, PaginatedResponse, CreateEntityInput, UpdateEntityInput } from '@shared/types';
import { paginatedEntitySchema, entityViewSchema } from '@/lib/api/schemas/entity.schema';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// Every service gets its own base URL via environment variable
const BASES = {
  users:   process.env.NEXT_PUBLIC_USERS_API_URL   ?? '/api/users-svc',
  orders:  process.env.NEXT_PUBLIC_ORDERS_API_URL  ?? '/api/orders-svc',
  reports: process.env.NEXT_PUBLIC_REPORTS_API_URL ?? '/api/reports-svc',
} as const;

type ServiceName = keyof typeof BASES;

async function request<T>(
  service: ServiceName,
  path: string,
  schema: z.ZodSchema<T>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASES[service]}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    credentials: 'include',
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Network error' }));
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }

  const json = await res.json();
  return schema.parse(json);   // ← Zod validates at the boundary; never trust raw JSON
}

function qs(params: Record<string, unknown>): string {
  return new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)]),
  ).toString();
}

// ── One namespace per backend resource ──────────────────────────────────────
export const api = {
  users: {
    list:    (params: EntityFilters) =>
      request('users', `/users?${qs(params)}`, paginatedEntitySchema),
    getById: (id: string) =>
      request('users', `/users/${id}`, entityViewSchema),
    create:  (body: CreateEntityInput) =>
      request('users', '/users', entityViewSchema, { method: 'POST', body: JSON.stringify(body) }),
    update:  (id: string, body: UpdateEntityInput) =>
      request('users', `/users/${id}`, entityViewSchema, { method: 'PATCH', body: JSON.stringify(body) }),
    delete:  (id: string) =>
      request('users', `/users/${id}`, z.void(), { method: 'DELETE' }),
  },

  orders: {
    list:    (params: EntityFilters) =>
      request('orders', `/orders?${qs(params)}`, paginatedEntitySchema),
    getById: (id: string) =>
      request('orders', `/orders/${id}`, entityViewSchema),
    create:  (body: CreateEntityInput) =>
      request('orders', '/orders', entityViewSchema, { method: 'POST', body: JSON.stringify(body) }),
    update:  (id: string, body: UpdateEntityInput) =>
      request('orders', `/orders/${id}`, entityViewSchema, { method: 'PATCH', body: JSON.stringify(body) }),
    delete:  (id: string) =>
      request('orders', `/orders/${id}`, z.void(), { method: 'DELETE' }),
  },
};
```

### Shared Zod schemas (`packages/shared/src/schemas/`)

These schemas are imported by **both** the frontend (response validation) and the backend
(request validation). Define them once; validate everywhere.

```ts
// packages/shared/src/schemas/entity.schema.ts
import { z } from 'zod';

export const entityViewSchema = z.object({
  id:        z.string().uuid(),
  name:      z.string(),
  status:    z.enum(['active', 'inactive', 'pending']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const paginatedEntitySchema = z.object({
  success: z.literal(true),
  data:    z.array(entityViewSchema),
  total:   z.number().int().nonneg(),
  page:    z.number().int().positive(),
  limit:   z.number().int().positive(),
});

export type EntityView              = z.infer<typeof entityViewSchema>;
export type PaginatedEntityResponse = z.infer<typeof paginatedEntitySchema>;

export const createEntitySchema = z.object({
  name:   z.string().min(1).max(200),
  email:  z.string().email(),
  status: z.enum(['active', 'inactive', 'pending']).default('pending'),
});
export type CreateEntityInput = z.infer<typeof createEntitySchema>;

export const updateEntitySchema = createEntitySchema.partial();
export type UpdateEntityInput = z.infer<typeof updateEntitySchema>;
```

---

## 5. Four-Layer Component Architecture

Every UI feature passes through exactly four layers. Never merge or skip.

### Layer 1 — Primitives (`components/ui/`)

Zero domain knowledge. Accept only generic HTML-like props plus variant/size props.

```tsx
// components/ui/Button/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize    = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  ButtonVariant;
  size?:     ButtonSize;
  loading?:  boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  variant = 'primary', size = 'md', loading = false,
  leftIcon, rightIcon, children, className, disabled, ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(
        styles.root,
        styles[`variant__${variant}`],
        styles[`size__${size}`],
        loading && styles.loading,
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading}
      {...rest}
    >
      {loading ? <span className={styles.spinner} aria-hidden /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
```

**Required primitives — build all of these before writing any domain component:**
`Button`, `Input`, `Select`, `Textarea`, `Checkbox`, `Radio`, `Badge`, `Spinner`, `Avatar`,
`Tooltip`, `Modal`, `Drawer`, `Toast`, `Table`, `Pagination`, `EmptyState`, `ErrorMessage`,
`Skeleton`, `Card`, `Divider`, `Tag`.

### Layer 2 — Domain Composites (`components/[domain]/`)

Assemble primitives. Know domain types. **Receive all data as props. Never fetch.**

```tsx
// components/users/UsersTable.tsx
import { Badge, Button, Skeleton, EmptyState, Table } from '@/components/ui';
import type { EntityView } from '@shared/types';
import styles from './UsersTable.module.css';

interface UsersTableProps {
  items:      EntityView[];
  isLoading?: boolean;
  onEdit:     (id: string) => void;
  onDelete:   (id: string) => void;
}

export function UsersTable({ items, isLoading, onEdit, onDelete }: UsersTableProps) {
  if (isLoading)     return <Skeleton rows={5} />;
  if (!items.length) return <EmptyState message="No users found." />;

  return (
    <div className={styles.wrapper}>
      <Table>
        <Table.Head>
          <Table.HeadCell>Name</Table.HeadCell>
          <Table.HeadCell>Status</Table.HeadCell>
          <Table.HeadCell>Actions</Table.HeadCell>
        </Table.Head>
        <Table.Body>
          {items.map(item => (
            <Table.Row key={item.id} className={styles.row}>
              <Table.Cell>{item.name}</Table.Cell>
              <Table.Cell>
                <Badge variant={item.status === 'active' ? 'success' : 'neutral'}>
                  {item.status}
                </Badge>
              </Table.Cell>
              <Table.Cell className={styles.actions}>
                <Button size="sm" variant="ghost"  onClick={() => onEdit(item.id)}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => onDelete(item.id)}>Delete</Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}
```

```css
/* components/users/UsersTable.module.css */
.wrapper { border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden; }
.row:hover { background: var(--color-surface-raised); }
.actions { display: flex; gap: var(--space-2); }
```

### Layer 3 — Shell / Orchestrator (`components/[domain]/[Domain]Shell.tsx`)

Owns all local state, calls data-fetching hooks, handles mutations, wires composites.
**Only place in the component tree that calls hooks or handles async.**

```tsx
// components/users/UsersShell.tsx
'use client';
import { useState }         from 'react';
import { useRouter }        from 'next/navigation';
import { api, ApiError }    from '@/lib/api/client';
import { useUsers }         from '@/hooks/useUsers';
import { useUsersFilters }  from '@/hooks/useUsersFilters';
import { toast }            from '@/providers/ToastProvider';
import { ErrorMessage, Pagination } from '@/components/ui';
import { UsersFilters }     from './UsersFilters';
import { UsersTable }       from './UsersTable';
import { UserDeleteModal }  from './UserDeleteModal';
import type { EntityView, PaginatedResponse } from '@shared/types';
import styles from './UsersShell.module.css';

interface UsersShellProps {
  initialData: PaginatedResponse<EntityView>;
}

export function UsersShell({ initialData }: UsersShellProps) {
  const router                      = useRouter();
  const { filters, updateFilter }   = useUsersFilters();
  const { items, total, isLoading, mutate } = useUsers({ filters, fallbackData: initialData });
  const [mutationError, setError]   = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EntityView | null>(null);

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.users.delete(id);
      await mutate();
      toast.success('User deleted');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Something went wrong';
      setError(msg);
      toast.error(msg);
    }
  }

  return (
    <div className={styles.root}>
      {mutationError && <ErrorMessage message={mutationError} />}
      <UsersFilters   filters={filters} onChange={updateFilter} />
      <UsersTable
        items={items}
        isLoading={isLoading}
        onEdit={id => router.push(`/users/${id}/edit`)}
        onDelete={id => setDeleteTarget(items.find(i => i.id === id) ?? null)}
      />
      <Pagination
        total={total}
        page={filters.page}
        limit={filters.limit}
        onPageChange={page => updateFilter('page', page)}
      />
      <UserDeleteModal
        item={deleteTarget}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
```

```css
/* components/users/UsersShell.module.css */
.root { display: flex; flex-direction: column; gap: var(--space-6); padding: var(--space-8); }
```

### Layer 4 — Pages (`app/[feature]/page.tsx`)

Server Components. Resolve auth, fetch initial data, render Shell. No `useState`. No handlers.

```tsx
// app/(dashboard)/users/page.tsx
import { getSession }  from '@/lib/auth';
import { api }         from '@/lib/api/client';
import { UsersShell }  from '@/components/users/UsersShell';
import { redirect }    from 'next/navigation';

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const initialData = await api.users.list({ page: 1, limit: 20 });
  return <UsersShell initialData={initialData} />;
}
```

```tsx
// app/(dashboard)/users/layout.tsx
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { UsersError }    from '@/components/users/UsersError';

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary fallback={<UsersError />}>{children}</ErrorBoundary>;
}
```

---

## 6. Data-Fetching Hooks

Every data-fetching hook returns the same shape contract. Use SWR or TanStack Query.
**Never raw `useEffect + useState` for server data.**

```ts
// hooks/useUsers.ts
import useSWR from 'swr';
import { api } from '@/lib/api/client';
import type { EntityFilters, EntityView, PaginatedResponse } from '@shared/types';

interface UseUsersOptions {
  filters?:      EntityFilters;
  fallbackData?: PaginatedResponse<EntityView>;
}

interface UseUsersResult {
  items:     EntityView[];
  total:     number;
  isLoading: boolean;
  isError:   boolean;
  mutate:    () => Promise<void>;
}

export function useUsers({ filters, fallbackData }: UseUsersOptions = {}): UseUsersResult {
  const key = filters ? ['users', filters] : null;
  const { data, error, isLoading, mutate } = useSWR(
    key,
    () => api.users.list(filters!),
    { fallbackData, revalidateOnFocus: false, dedupingInterval: 5_000 },
  );
  return {
    items:     data?.data  ?? [],
    total:     data?.total ?? 0,
    isLoading,
    isError:   !!error,
    mutate:    async () => { await mutate(); },
  };
}
```

```ts
// hooks/useUsersFilters.ts
import { useCallback, useState } from 'react';
import type { EntityFilters } from '@shared/types';

const DEFAULTS: EntityFilters = { page: 1, limit: 20, order: 'desc', sortBy: 'createdAt' };

export function useUsersFilters() {
  const [filters, setFilters] = useState<EntityFilters>(DEFAULTS);

  const updateFilter = useCallback(<K extends keyof EntityFilters>(key: K, value: EntityFilters[K]) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key === 'page' ? (value as number) : 1,
    }));
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULTS), []);

  const toggleSort = useCallback((col: string) => {
    setFilters(prev =>
      prev.sortBy === col
        ? { ...prev, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : { ...prev, sortBy: col, order: 'desc', page: 1 },
    );
  }, []);

  return { filters, updateFilter, resetFilters, toggleSort };
}
```

**Hook rules:**
- Name always starts with `use`.
- Returns a named object — never a bare tuple (except simple toggles like `useDisclosure`).
- Never returns `undefined` — provide empty/default values.
- No JSX anywhere in the hook file.

---

## 7. TypeScript Discipline

### Rules — no exceptions

**1. No `any`.** Use `unknown` + type guards or Zod for narrowing.

**2. Validate every API response at the `client.ts` boundary.** Never trust raw JSON.

**3. `interface` for component props** (supports declaration merging). `type` for unions and computed types.

**4. Discriminated unions for async state** — never boolean flag combinations.

```ts
// ❌ Bad
type State = { isLoading: boolean; isError: boolean; data?: User };

// ✅ Good
type AsyncState<T> =
  | { status: 'idle'    }
  | { status: 'loading' }
  | { status: 'error';   error: string }
  | { status: 'success'; data: T };
```

**5. Type event handlers explicitly.**

```ts
const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => { ... };
```

**6. Always import from barrels.**

```ts
// ✅
import { Button, Input, Badge } from '@/components/ui';
// ❌
import { Button } from '@/components/ui/Button/Button';
```

**7. Shared types belong in `packages/shared`.** Import them with the workspace alias:

```ts
import type { EntityView, PaginatedResponse } from '@shared/types';
```

---

## 8. Shared Types (`packages/shared/src/types/index.ts`)

```ts
export interface PaginatedResponse<T> {
  success: true;
  data:    T[];
  total:   number;
  page:    number;
  limit:   number;
}

export interface PaginationParams {
  page:    number;
  limit:   number;
}

export interface EntityFilters extends PaginationParams {
  search?: string;
  status?: string;
  sortBy?: string;
  order?:  'asc' | 'desc';
}

export interface AppSession {
  userId:     string;
  tenantId:   string;
  tenantSlug: string;
  role:       AppRole;
  email:      string;
  flags:      FeatureFlags;
}

export type AppRole = 'admin' | 'manager' | 'viewer';

export interface FeatureFlags {
  [key: string]: boolean;
}
```

---

## 9. Form Pattern (react-hook-form + Zod)

```tsx
// components/users/UserForm.tsx
import { useForm }         from 'react-hook-form';
import { zodResolver }     from '@hookform/resolvers/zod';
import { createEntitySchema, type CreateEntityInput } from '@shared/schemas/entity.schema';
import { Button, Input, ErrorMessage } from '@/components/ui';
import styles from './UserForm.module.css';

interface UserFormProps {
  defaultValues?: Partial<CreateEntityInput>;
  onSubmit:       (values: CreateEntityInput) => Promise<void>;
  onCancel:       () => void;
}

export function UserForm({ defaultValues, onSubmit, onCancel }: UserFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateEntityInput>({
    resolver: zodResolver(createEntitySchema),
    defaultValues,
  });

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <Input {...register('name')} placeholder="Name" aria-invalid={!!errors.name} />
        {errors.name && <ErrorMessage message={errors.name.message!} />}
      </div>
      <div className={styles.field}>
        <Input {...register('email')} type="email" placeholder="Email" aria-invalid={!!errors.email} />
        {errors.email && <ErrorMessage message={errors.email.message!} />}
      </div>
      <div className={styles.actions}>
        <Button type="button" variant="ghost"   onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>Save</Button>
      </div>
    </div>
  );
}
```

```css
/* components/users/UserForm.module.css */
.form    { display: flex; flex-direction: column; gap: var(--space-4); }
.field   { display: flex; flex-direction: column; gap: var(--space-1); }
.actions { display: flex; justify-content: flex-end; gap: var(--space-3); padding-top: var(--space-4); border-top: 1px solid var(--color-border); }
```

> **Note:** `<form>` tags are forbidden in React artifacts / certain render environments.
> Use a wrapping `<div>` and `handleSubmit` via `onClick` if needed.

---

## 10. Multi-Tenant & Feature Flags

### Theming — pure CSS, zero component changes

```css
/* Adding a new tenant: one file, done */
/* styles/themes/initech.css */
[data-tenant="initech"] {
  --color-primary:       #dc2626;
  --color-primary-hover: #b91c1c;
  --color-accent:        #1d4ed8;
  --radius-md:           0;      /* sharp corners brand requirement */
}
```

### Behavioural variation — feature flags only

```tsx
// ✅ Always use flags — never branch on tenant identity in component code
const { flags } = useFeatureFlags();
{flags.showAdvancedReporting && <AdvancedReporting />}

// ❌ Never
// if (tenant.slug === 'acme') return <AcmeReporting />;
```

```ts
// hooks/useFeatureFlags.ts
import { useSession } from '@/providers/AuthProvider';
import type { FeatureFlags } from '@shared/types';

export function useFeatureFlags(): FeatureFlags {
  const { session } = useSession();
  return session?.flags ?? {};
}
```

---

## 11. Role-Based Rendering

```ts
// packages/shared/src/lib/permissions.ts
export type AppRole = 'admin' | 'manager' | 'viewer';

const PERMISSIONS = {
  'create:users':  ['admin', 'manager'] as AppRole[],
  'edit:users':    ['admin', 'manager'] as AppRole[],
  'delete:users':  ['admin']            as AppRole[],
  'view:users':    ['admin', 'manager', 'viewer'] as AppRole[],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: AppRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly AppRole[]).includes(role);
}
```

```ts
// hooks/usePermissions.ts
import { useSession }           from '@/providers/AuthProvider';
import { can, type Permission } from '@shared/lib/permissions';

export function usePermissions() {
  const { session } = useSession();
  return { can: (p: Permission) => can(session.user.role, p) };
}
```

---

## 12. Error Handling

Every async mutation follows the same three-state pattern. Every route is wrapped in `ErrorBoundary`.

```tsx
// In every Shell — mutation error handling
const [mutationError, setMutationError] = useState<string | null>(null);

async function handleAction(id: string) {
  setMutationError(null);
  try {
    await api.users.delete(id);
    await mutate();
    toast.success('Done');
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : 'Something went wrong';
    setMutationError(msg);
    toast.error(msg);
  }
}
```

```tsx
// components/layout/ErrorBoundary.tsx
import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props { children: ReactNode; fallback: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    // Send to Sentry / Datadog here
  }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}
```

---

## 13. Docker / Environment Configuration

Each service exposes its API base URL via environment variable. The frontend never hardcodes
a service URL or imports from a backend package.

```bash
# apps/web/.env.local
NEXT_PUBLIC_USERS_API_URL=http://users-service:3001
NEXT_PUBLIC_ORDERS_API_URL=http://orders-service:3002
NEXT_PUBLIC_REPORTS_API_URL=http://reports-service:3003
```

```yaml
# docker-compose.yml (development)
services:
  web:
    build: ./apps/web
    ports: ["3000:3000"]
    environment:
      - NEXT_PUBLIC_USERS_API_URL=http://users-svc:3001
      - NEXT_PUBLIC_ORDERS_API_URL=http://orders-svc:3002
    depends_on: [users-svc, orders-svc]

  users-svc:
    build: ./apps/api/users
    ports: ["3001:3001"]

  orders-svc:
    build: ./apps/api/orders
    ports: ["3002:3002"]
```

---

## 14. Refactor Protocol

When the user asks to **refactor** existing code, follow these steps in order:

1. **Identify violations** — scan for: `fetch` outside `client.ts`, inline styles, hardcoded
   colour/spacing values, `any`, `useState` in page files, JSX in hooks, CSS in `.tsx` files,
   backend imports in frontend files, composites calling APIs directly.

2. **Split TSX/CSS** — extract all styles from `.tsx` into a paired `.module.css`. Replace every
   `style={{ … }}` with a CSS module class referencing a token.

3. **Extract API calls** — move every `fetch` / `axios` call to `lib/api/client.ts`. Add Zod
   schema validation. Update callers to use `api.[service].[method]()`.

4. **Layer separation** — ensure pages are thin wrappers, Shells own state, composites receive
   props only, hooks handle data fetching.

5. **Create tenant theme stubs** — if the project has multiple tenants or orgs, create
   `styles/themes/[slug].css` for each and remove any `tenant.slug === '…'` branches.

6. **Shared package extraction** — move types, schemas, and pure utilities used by more than one
   service into `packages/shared`.

7. **Update the checklist** — run every item in `checklist.md` before marking refactor complete.

---

## 15. Absolute Prohibitions

Raise a flag and redesign if a requirement appears to demand any of these:

- Import a backend / server module into any frontend file
- Call `fetch` anywhere except `lib/api/client.ts`
- Write `style={{ color: '#abc' }}` — use CSS custom properties in a `.module.css`
- Write `className="text-indigo-500"` for brand colours — use token-based CSS Modules
- Put `useState` or `useEffect` in a page file
- Return JSX from a hook file
- Use `as any` or `as unknown as T` escape hatches
- Let a composite component call the API directly
- Hardcode a colour, spacing, or font size value outside `tokens.css`
- Repeat a colour value in more than one file — always extract to a token
- Create a component longer than ~200 lines — split it first
- Branch on `tenant.slug` or `tenant.id` in component code — use feature flags
- Add a tenant theme by modifying a component — only a new `.css` file is allowed
