# React Enterprise — Patterns Reference

Generic, copy-paste templates. Replace `[Domain]`, `[Entity]`, `[domain]`, `EntityView`,
`EntityFilters` with your actual names throughout.

---

## Shared Types

```ts
// types/index.ts
export interface PaginatedResponse<T> {
  data:  T[];
  total: number;
  page:  number;
  limit: number;
}

export interface PaginationParams {
  page:  number;
  limit: number;
}

// Augment the session type for your auth provider
export interface AppSession {
  userId:   string;
  tenantId: string;
  role:     AppRole;
  email:    string;
  flags:    FeatureFlags;
}

export type AppRole = 'admin' | 'manager' | 'viewer';  // extend as needed

export interface FeatureFlags {
  [key: string]: boolean;
}
```

---

## Zod API Response Schema

```ts
// lib/api/schemas/[domain].schema.ts
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

export type EntityView           = z.infer<typeof entityViewSchema>;
export type PaginatedEntityResponse = z.infer<typeof paginatedEntitySchema>;
```

---

## Filter Hook (URL-synced)

```ts
// hooks/use[Domain]Filters.ts
import { useCallback, useState } from 'react';

export interface EntityFilters {
  page:    number;
  limit:   number;
  search?: string;
  status?: string;
  sortBy?: string;
  order?:  'asc' | 'desc';
}

const DEFAULTS: EntityFilters = { page: 1, limit: 20, order: 'desc', sortBy: 'createdAt' };

export function use[Domain]Filters() {
  const [filters, setFilters] = useState<EntityFilters>(DEFAULTS);

  const updateFilter = useCallback(<K extends keyof EntityFilters>(key: K, value: EntityFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value, page: key === 'page' ? (value as number) : 1 }));
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

---

## Form Pattern (react-hook-form + Zod)

```tsx
// components/[domain]/[Domain]Form.tsx
import { useForm }          from 'react-hook-form';
import { zodResolver }      from '@hookform/resolvers/zod';
import { z }                from 'zod';
import { Button, Input, Select, ErrorMessage } from '@/components/ui';

const formSchema = z.object({
  name:     z.string().min(1, 'Name is required').max(200),
  email:    z.string().email('Enter a valid email'),
  statusId: z.number().int().positive('Select a status'),
});
type FormValues = z.infer<typeof formSchema>;

interface [Domain]FormProps {
  defaultValues?: Partial<FormValues>;
  onSubmit:       (values: FormValues) => Promise<void>;
  onCancel:       () => void;
}

export function [Domain]Form({ defaultValues, onSubmit, onCancel }: [Domain]FormProps) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div>
        <Input {...register('name')} placeholder="Name" aria-invalid={!!errors.name} />
        {errors.name && <ErrorMessage message={errors.name.message!} />}
      </div>
      <div>
        <Input {...register('email')} type="email" placeholder="Email" aria-invalid={!!errors.email} />
        {errors.email && <ErrorMessage message={errors.email.message!} />}
      </div>
      <div>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={isSubmitting}>Save</Button>
      </div>
    </form>
  );
}
```

---

## Confirm / Delete Modal

```tsx
// components/[domain]/[Entity]DeleteModal.tsx
import { useState }               from 'react';
import { Modal, Button }          from '@/components/ui';
import type { EntityView }        from '@/types';

interface DeleteModalProps {
  item:      EntityView | null;   // null = closed
  onConfirm: (id: string) => Promise<void>;
  onClose:   () => void;
}

export function [Entity]DeleteModal({ item, onConfirm, onClose }: DeleteModalProps) {
  const [loading, setLoading] = useState(false);
  if (!item) return null;

  async function handleConfirm() {
    setLoading(true);
    try { await onConfirm(item!.id); onClose(); }
    finally { setLoading(false); }
  }

  return (
    <Modal open onClose={onClose} title="Confirm delete" role="dialog" aria-modal="true">
      <p>Delete <strong>{item.name}</strong>? This cannot be undone.</p>
      <div>
        <Button variant="ghost"  onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={loading} onClick={handleConfirm}>Delete</Button>
      </div>
    </Modal>
  );
}
```

---

## Optimistic Update Pattern

```ts
// In a Shell — toggle a status field without waiting for the server
async function handleToggleStatus(id: string) {
  const current = items.find(i => i.id === id);
  if (!current) return;
  const next = current.status === 'active' ? 'inactive' : 'active';

  // Optimistically patch local SWR cache
  await mutate(
    prev => prev ? { ...prev, data: prev.data.map(i => i.id === id ? { ...i, status: next } : i) } : prev,
    false,
  );

  try {
    await api.[domain].update(id, { status: next });
  } catch (e) {
    toast.error('Failed to update status');
    await mutate(); // revert by re-fetching
  }
}
```

---

## Role-Based Rendering

```ts
// lib/permissions.ts
export type AppRole = 'admin' | 'manager' | 'viewer';

const PERMISSIONS = {
  'create:[domain]': ['admin', 'manager'] as AppRole[],
  'edit:[domain]':   ['admin', 'manager'] as AppRole[],
  'delete:[domain]': ['admin']            as AppRole[],
  'view:[domain]':   ['admin', 'manager', 'viewer'] as AppRole[],
} as const;

type Permission = keyof typeof PERMISSIONS;

export function can(role: AppRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly AppRole[]).includes(role);
}
```

```tsx
// hooks/usePermissions.ts
export function usePermissions() {
  const { session } = useSession();
  return { can: (p: Permission) => can(session.user.role, p) };
}

// Usage inside a composite
const { can } = usePermissions();
{can('delete:[domain]') && (
  <Button variant="danger" onClick={() => onDelete(item.id)}>Delete</Button>
)}
```

---

## Toast Provider

```tsx
// providers/ToastProvider.tsx
import { Toaster, toast as _toast } from 'sonner'; // swap for react-hot-toast if preferred
import type { ReactNode }           from 'react';

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="bottom-right" richColors closeButton expand />
    </>
  );
}

// Re-export so component files never import the library directly
export const toast = {
  success: (msg: string) => _toast.success(msg),
  error:   (msg: string) => _toast.error(msg),
  info:    (msg: string) => _toast.info(msg),
  warning: (msg: string) => _toast.warning(msg),
};
```

---

## ErrorBoundary

```tsx
// components/layout/ErrorBoundary.tsx
import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props  { children: ReactNode; fallback: ReactNode; }
interface State  { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State { return { hasError: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Send to your error-tracking service (Sentry, Datadog …)
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
```

---

## Auth Guard

```tsx
// components/layout/AuthGuard.tsx
import type { ReactNode }     from 'react';
import { useSession }         from '@/providers/AuthProvider';
import { can, type AppRole }  from '@/lib/permissions';
import { Spinner }            from '@/components/ui';

interface AuthGuardProps {
  children:     ReactNode;
  requiredRole?: AppRole;
  fallback?:    ReactNode;
}

export function AuthGuard({ children, requiredRole, fallback = <Forbidden /> }: AuthGuardProps) {
  const { session, isLoading } = useSession();
  if (isLoading)    return <Spinner />;
  if (!session)     return <Navigate to="/login" />;
  if (requiredRole && !can(session.user.role, `view:${requiredRole}` as any)) return <>{fallback}</>;
  return <>{children}</>;
}
```
