## 1. Folder Structure

This structure is mandatory. Deviate only when the project already has an established convention, and document the deviation explicitly.

```
src/
├── app/                          ← Route entry points only — no logic, no state
│   └── (feature-group)/
│       └── [feature]/
│           ├── page.tsx          ← Server Component or thin wrapper: fetch data → pass to Shell
│           └── layout.tsx        ← Segment layout + ErrorBoundary
│
├── components/
│   ├── ui/                       ← Design-system primitives — zero domain knowledge
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.module.css
│   │   │   └── index.ts          ← re-exports Button
│   │   ├── Input/  …
│   │   └── index.ts              ← barrel: re-exports every ui/ primitive
│   │
│   ├── [domain]/                 ← One folder per business domain (users/, orders/, reports/ …)
│   │   ├── [Domain]Shell.tsx     ← Orchestrator: owns state, calls hooks, wires composites
│   │   ├── [Domain]Table.tsx     ← Composite: receives data as props, emits typed callbacks
│   │   ├── [Domain]Form.tsx      ← Composite: controlled form, calls onSubmit prop
│   │   └── [Domain]Filters.tsx   ← Composite: filter controls, calls onChange prop
│   │
│   └── layout/                   ← App chrome: Sidebar, TopBar, PageHeader, ErrorBoundary
│
├── hooks/                        ← Custom hooks — no JSX ever in this folder
│   ├── use[Domain].ts            ← Data-fetching hook per domain
│   └── use[Domain]Filters.ts     ← Filter / URL-state hook per domain
│
├── lib/
│   ├── api/
│   │   ├── client.ts             ← THE ONLY file that calls fetch — one method per endpoint
│   │   └── schemas/              ← Zod schemas that validate raw API responses
│   ├── utils/                    ← Pure functions: formatters, parsers, sorters — zero React imports
│   └── validators/               ← Zod schemas for client-side form validation only
│
├── styles/
│   ├── globals.css               ← CSS reset + base typography
│   └── tokens.css                ← All design tokens as CSS custom properties — single source of truth
│
├── providers/                    ← React context providers (AuthProvider, ThemeProvider, ToastProvider)
├── config/
│   └── routes.ts                 ← Route path constants + role-based nav config — no JSX
└── types/
    └── index.ts                  ← App-wide shared types; re-export from shared packages if monorepo
```

### Enforcement rules — these are non-negotiable

| Location               | Allowed                                               | Never allowed                                                 |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| `app/*/page.tsx`       | Auth resolution, initial data fetch, render Shell     | `useState`, event handlers, business logic                    |
| `components/ui/`       | Generic HTML-like props, variant props, design tokens | Domain types, API calls, any business knowledge               |
| `components/[domain]/` | Domain types, callback props; Shell may call hooks    | Direct `fetch`, importing from `lib/api/client` in composites |
| `hooks/`               | State, effects, calls to `lib/api/client`             | JSX, returning component trees                                |
| `lib/api/client.ts`    | All HTTP calls, all Zod response validation           | Anything else                                                 |
| `lib/utils/`           | Pure functions                                        | React imports, side effects, API calls                        |

---

## 2. Four-Layer Component Architecture

Every UI feature passes through exactly four layers. Never merge or skip layers.

### Layer 1 — Primitives (`components/ui/`)

Know nothing about the domain. Accept only generic HTML-like props plus variant/size props. They are the design system — reusable across every feature and every future product surface.

```tsx
// components/ui/Button/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(
        styles.root,
        styles[`variant-${variant}`],
        styles[`size-${size}`],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading}
      {...rest}
    >
      {loading ? <Spinner size={size} /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
```

**Required primitives — build all of these for any new project:**
`Button`, `Input`, `Select`, `Textarea`, `Checkbox`, `Radio`, `Badge`, `Spinner`, `Avatar`,
`Tooltip`, `Modal`, `Drawer`, `Toast`, `Table`, `Pagination`, `EmptyState`, `ErrorMessage`,
`Skeleton`, `Card`, `Divider`, `Tag`.

### Layer 2 — Domain Composites (`components/[domain]/`)

Assemble primitives and understand domain types. **Receive all data as props. Never fetch data.** Emit user actions via typed callback props.

```tsx
// components/[domain]/[Domain]Table.tsx
interface [Domain]TableProps {
  items:      EntityView[];
  isLoading?: boolean;
  onEdit:     (id: string) => void;
  onDelete:   (id: string) => Promise<void>;
}

export function [Domain]Table({ items, isLoading, onEdit, onDelete }: [Domain]TableProps) {
  if (isLoading) return <Skeleton rows={5} />;
  if (!items.length) return <EmptyState message="No items found." />;
  return (
    <Table>
      {items.map(item => (
        <Table.Row key={item.id}>
          <Table.Cell>{item.name}</Table.Cell>
          <Table.Cell>
            <Badge variant={item.status === 'active' ? 'success' : 'neutral'}>{item.status}</Badge>
          </Table.Cell>
          <Table.Cell>
            <Button size="sm" variant="ghost" onClick={() => onEdit(item.id)}>Edit</Button>
            <Button size="sm" variant="danger" onClick={() => onDelete(item.id)}>Delete</Button>
          </Table.Cell>
        </Table.Row>
      ))}
    </Table>
  );
}
```

### Layer 3 — Shell / Orchestrator (`components/[domain]/[Domain]Shell.tsx`)

The "smart" layer. Owns all local state, calls data-fetching hooks, handles mutations and errors, wires composites together. **This is the only place in the component tree that calls hooks or handles async operations.**

```tsx
// components/[domain]/[Domain]Shell.tsx
export function [Domain]Shell({ initialData }: { initialData: PaginatedResponse<EntityView> }) {
  const [filters, setFilters]       = use[Domain]Filters();
  const { items, total, isLoading, mutate } = use[Domain]({ filters, fallbackData: initialData });
  const [mutationError, setError]   = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EntityView | null>(null);

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.[domain].delete(id);
      await mutate();
      toast.success('Deleted successfully');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Something went wrong';
      setError(msg);
      toast.error(msg);
    }
  }

  return (
    <div>
      {mutationError && <ErrorMessage message={mutationError} />}
      <[Domain]Filters  filters={filters} onChange={setFilters} />
      <[Domain]Table    items={items} isLoading={isLoading}
                        onEdit={id => router.push(`/[domain]/${id}/edit`)}
                        onDelete={id => setDeleteTarget(items.find(i => i.id === id) ?? null)} />
      <Pagination       total={total} page={filters.page} limit={filters.limit}
                        onPageChange={page => setFilters(f => ({ ...f, page }))} />
      <[Entity]DeleteModal item={deleteTarget} onConfirm={handleDelete}
                           onClose={() => setDeleteTarget(null)} />
    </div>
  );
}
```

### Layer 4 — Pages (`app/[feature]/page.tsx`)

Server Components (Next.js App Router) or thin route wrappers (Vite/CRA). Resolve auth, fetch initial data server-side, render the Shell. **Zero `useState`. Zero event handlers. Zero business logic.**

```tsx
// app/[feature]/page.tsx
export default async function [Feature]Page() {
  const session = await getSession();                        // server-side auth check
  const data    = await api.[domain].list({ page: 1, limit: 20 });
  return <[Domain]Shell initialData={data} />;
}
```

---

## 3. CSS Architecture — Tokens First, Always

### Design Token System (`styles/tokens.css`)

Every visual value in the codebase is defined here as a CSS custom property. **Never hardcode a hex colour, a `rem` spacing value, or a font size anywhere else.** Components always consume tokens, never raw values.

```css
/* styles/tokens.css */
:root {
  /* ── Brand colours (tenant / theme-overridable) ── */
  --color-primary: #6366f1;
  --color-primary-hover: #4f46e5;
  --color-primary-fg: #ffffff; /* text placed on a primary background */
  --color-accent: #f59e0b;
  --color-danger: #ef4444;
  --color-danger-hover: #dc2626;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-info: #3b82f6;

  /* ── Neutrals ── */
  --color-surface: #ffffff;
  --color-surface-raised: #f8fafc;
  --color-surface-overlay: #f1f5f9;
  --color-border: #e2e8f0;
  --color-border-strong: #cbd5e1;
  --color-text: #0f172a;
  --color-text-muted: #64748b;
  --color-text-subtle: #94a3b8;
  --color-text-inverse: #ffffff;

  /* ── Spacing (4 px base) ── */
  --space-1: 0.25rem; /*  4px */
  --space-2: 0.5rem; /*  8px */
  --space-3: 0.75rem; /* 12px */
  --space-4: 1rem; /* 16px */
  --space-6: 1.5rem; /* 24px */
  --space-8: 2rem; /* 32px */
  --space-12: 3rem; /* 48px */
  --space-16: 4rem; /* 64px */

  /* ── Typography ── */
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;
  --text-xs: 0.75rem; /* 12px */
  --text-sm: 0.875rem; /* 14px */
  --text-base: 1rem; /* 16px */
  --text-lg: 1.125rem; /* 18px */
  --text-xl: 1.25rem; /* 20px */
  --text-2xl: 1.5rem; /* 24px */
  --text-3xl: 1.875rem; /* 30px */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* ── Border radius ── */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-full: 9999px;

  /* ── Shadows ── */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg:
    0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);

  /* ── Z-index scale ── */
  --z-base: 0;
  --z-raised: 10;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-overlay: 300;
  --z-modal: 400;
  --z-toast: 500;
}
```

### Dark mode

```css
/* styles/tokens.css — append below :root */
@media (prefers-color-scheme: dark) {
  :root {
    --color-surface: #0f172a;
    --color-surface-raised: #1e293b;
    --color-surface-overlay: #334155;
    --color-border: #334155;
    --color-border-strong: #475569;
    --color-text: #f1f5f9;
    --color-text-muted: #94a3b8;
    --color-text-subtle: #64748b;
  }
}
```

### Multi-tenant / white-label theming

Tenant themes override **only** brand tokens. Zero component changes required for any new tenant.

```css
/* styles/themes/[tenant-slug].css */
[data-theme="[tenant-slug]"] {
  --color-primary: #your-brand;
  --color-primary-hover: #your-brand-dark;
  --color-accent: #your-accent;
}
```

Apply the attribute in the root layout. Adding a tenant = one new CSS file.

```tsx
// app/layout.tsx
<html data-theme={session?.tenant?.slug ?? 'default'}>
```

### CSS Module rules

Every component with non-trivial styling has a co-located `.module.css`. Tailwind utility classes are permitted **only** for structural one-liners (`flex`, `grid`, `gap-*`). **Never use Tailwind for colours, spacing scale, or typography — always use tokens.**

```css
/* components/ui/Button/Button.module.css */
.root {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--color-primary);
  color: var(--color-primary-fg);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: background 150ms ease;
  outline-offset: 2px;
}
.root:hover {
  background: var(--color-primary-hover);
}
.root:focus-visible {
  outline: 2px solid var(--color-primary);
}
.root:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.variant-secondary {
  background: var(--color-surface-raised);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.variant-ghost {
  background: transparent;
  color: var(--color-primary);
  border: 1px solid var(--color-border);
}
.variant-danger {
  background: var(--color-danger);
}
.variant-danger:hover {
  background: var(--color-danger-hover);
}

.size-sm {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
}
.size-lg {
  padding: var(--space-3) var(--space-6);
  font-size: var(--text-base);
}
```

**CSS Module laws:**

- One `.module.css` per component — no global class names ever.
- Never reference another component's CSS module classes.
- Compose variants with `clsx` / `cn` (tailwind-merge), not string interpolation.

---

## 4. TypeScript Discipline

### Rules — no exceptions

**1. No `any`.** Set `"strict": true` and `"noImplicitAny": true` in `tsconfig.json`. Use `unknown` and narrow with type guards or Zod.

**2. Validate API responses at the boundary.** Never trust raw JSON from the network.

```ts
// lib/api/client.ts
import { z } from "zod";
import { entityViewSchema } from "@/lib/api/schemas/entity.schema";

const listResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(entityViewSchema),
  total: z.number(),
});

export async function listEntities(
  params: EntityFilters,
): Promise<PaginatedResponse<EntityView>> {
  const res = await fetch(`/api/entities?${toQueryString(params)}`);
  const json = await res.json();
  return listResponseSchema.parse(json); // throws ZodError on shape mismatch
}
```

**3. `interface` for component props** (supports declaration merging). `type` for unions and computed types.

**4. Discriminated unions for async state** — never boolean flag combinations.

```ts
// ❌  { isLoading: boolean; isError: boolean; data?: T }
// ✅
type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: T };
```

**5. Type event handlers explicitly.**

```ts
const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => { ... };
```

**6. Always import from barrels.**

```ts
// ✅  import { Button, Input, Badge } from '@/components/ui';
// ❌  import { Button } from '@/components/ui/Button/Button';
```

---

## 5. API Boundary

`lib/api/client.ts` is the **only** file in the entire frontend codebase that calls `fetch` or any HTTP library. This is an architectural law, not a preference.

```ts
// lib/api/client.ts
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Network error" }));
    throw new ApiError(body.error ?? "Request failed", res.status);
  }
  return res.json();
}

// ── One namespace per backend resource ──────────────────────────────────────
export const api = {
  // Replace with your real domain namespaces — keep one method per endpoint
  [domain]: {
    list: (params: EntityFilters) =>
      request<PaginatedResponse<EntityView>>(`/[domain]?${qs(params)}`),
    getById: (id: string) => request<EntityView>(`/[domain]/${id}`),
    create: (body: CreateEntityInput) =>
      request<EntityView>(`/[domain]`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: UpdateEntityInput) =>
      request<EntityView>(`/[domain]/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<void>(`/[domain]/${id}`, { method: "DELETE" }),
  },
};

function qs(params: Record<string, unknown>): string {
  return new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString();
}
```

---

## 6. Data-Fetching Hooks

Every data-fetching hook returns the same shape contract. Use SWR or TanStack Query — **never** raw `useEffect + useState` for server data.

```ts
// hooks/use[Domain].ts
import useSWR from 'swr';
import { api } from '@/lib/api/client';
import type { EntityFilters, EntityView, PaginatedResponse } from '@/types';

interface Use[Domain]Options {
  filters?:      EntityFilters;
  fallbackData?: PaginatedResponse<EntityView>;
}

interface Use[Domain]Result {
  items:     EntityView[];
  total:     number;
  isLoading: boolean;
  isError:   boolean;
  mutate:    () => Promise<void>;
}

export function use[Domain]({ filters, fallbackData }: Use[Domain]Options = {}): Use[Domain]Result {
  const key = filters ? ['[domain]', filters] : null;
  const { data, error, isLoading, mutate } = useSWR(
    key,
    () => api.[domain].list(filters!),
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

**Hook rules:**

- Name always starts with `use`.
- Always returns a named object — never a bare tuple (except simple toggles like `useDisclosure`).
- Never returns `undefined` — provide empty/default values.
- No JSX anywhere in the file.

---

## 7. Multi-Tenant & Feature Flags

Never branch on tenant identity in component code. All behavioural variation is driven by feature flags sourced from the session.

```tsx
// ❌  if (tenant.slug === 'acme') return <AcmeWidget />;
// ✅
const { flags } = useFeatureFlags();
if (flags.showAdvancedReporting) return <AdvancedReporting />;
```

Feature flags live in the server-side session / organisation record and are surfaced via `useFeatureFlags()`. Adding or removing a feature for one tenant never touches component code.

---

## 8. Error Handling

Every async mutation follows the same three-state pattern. Every route segment is wrapped in an `ErrorBoundary`.

```tsx
// Shell component — mutation error handling
const [mutationError, setMutationError] = useState<string | null>(null);

async function handleAction(id: string) {
  setMutationError(null);
  try {
    await api.[domain].[action](id);
    await mutate();
    toast.success('Action completed');
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : 'Something went wrong';
    setMutationError(msg);
    toast.error(msg);
  }
}
```

```tsx
// app/[feature]/layout.tsx — always wrap in ErrorBoundary
<ErrorBoundary fallback={<FeatureError />}>{children}</ErrorBoundary>
```

---

## 9. Platform Code Sharing (Monorepo)

In a monorepo serving web and mobile, extract all platform-neutral code into a shared package.

```
packages/shared/
├── src/
│   ├── formatters/    ← date, currency, phone — pure functions, no DOM
│   ├── validators/    ← Zod schemas for form validation
│   ├── hooks/         ← useDebounce, usePrevious — no DOM/RN specifics
│   ├── constants/     ← status colours, role maps, pagination defaults
│   └── index.ts
└── package.json       ← no peerDeps on react-dom or react-native
```

**Rule:** if a function or hook has zero dependency on `window`, `document`, React DOM, or React Native APIs, it belongs in `packages/shared`. Both web and mobile consume it via workspace alias.

| Code                    | Location           | Reason                                   |
| ----------------------- | ------------------ | ---------------------------------------- |
| SWR data-fetching hooks | `apps/web/hooks/`  | SWR is DOM-coupled                       |
| `lib/api/client.ts`     | Per app            | Same endpoints, different auth transport |
| Formatters, Zod schemas | `packages/shared/` | Platform-neutral                         |
| Navigation config       | Per app            | Next.js vs React Navigation              |
| Permission predicates   | `packages/shared/` | Pure sync functions                      |

---

## 10. Accessibility Baseline

Every interactive component must satisfy all of the following before shipping:

- Visible focus ring: `outline: 2px solid var(--color-primary); outline-offset: 2px` on `:focus-visible`
- Semantic HTML: `<button>` not `<div>` for actions; `<nav>`, `<main>`, `<header>`, `<aside>` for landmarks
- `aria-label` on every icon-only button
- `role="dialog"` + focus trap on every Modal and Drawer
- All animations wrapped in `@media (prefers-reduced-motion: no-preference)`

---

## 11. Absolute Prohibitions

Raise a flag and redesign if a requirement appears to demand any of these:

- Import a backend / server module into any frontend file
- Write `style={{ color: '#abc' }}` — use CSS custom properties
- Write `className="text-indigo-500"` for brand colours — use token-based CSS Modules
- Put `useState` or `useEffect` in a page file
- Return JSX from a hook file
- Call `fetch` anywhere except `lib/api/client.ts`
- Use `as any` or `as unknown as T` escape hatches
- Let a composite component call the API directly
- Create a component longer than ~200 lines — split it first
- Repeat a colour value in more than one CSS file — extract it as a token
