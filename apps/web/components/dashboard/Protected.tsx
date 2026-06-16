'use client';

import type { ReactNode } from 'react';
import type { SessionUser, UserRole } from '@crm/types';
import { hasMinimumRole } from '@crm/permissions';

interface Props {
  user: SessionUser | null;
  roles?: readonly UserRole[];
  minRole?: UserRole;
  fallback?: ReactNode;
  children: ReactNode;
}

export default function Protected({ user, roles, minRole, fallback = null, children }: Props) {
  if (!user) return <>{fallback}</>;
  const allowedByList = roles ? roles.includes(user.role) : true;
  const allowedByMin = minRole ? hasMinimumRole(user, minRole) : true;
  if (!allowedByList || !allowedByMin) return <>{fallback}</>;
  return <>{children}</>;
}
