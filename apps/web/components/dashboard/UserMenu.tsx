'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@crm/types';
import { auth } from '@/src/lib/api/client';

interface Props {
  user: SessionUser;
}

export default function UserMenu({ user }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleSignOut = async () => {
    if (pending) return;
    setPending(true);
    try {
      await auth.logout();
    } catch {
      // Server-side session cleanup may fail; still redirect to login
    } finally {
      router.replace('/login');
      router.refresh();
    }
  };

  const label = user.name ?? user.email;
  const initial = label.charAt(0).toUpperCase();

  const rank = user.rank;
  const showTenant = rank <= 90 && !!user.tenant_name;
  const showOrg = rank < 90 && !!user.org_name;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white py-1 pl-1 pr-2 transition-colors hover:bg-[#F8FAFC] cursor-pointer"
        title={label}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0b6cbf] text-xs font-bold text-white">
          {initial}
        </span>
        <span className="hidden max-w-[140px] truncate text-xs font-semibold text-[#0F172A] sm:block">
          {label}
        </span>
        <svg
          className="hidden h-3.5 w-3.5 text-[#64748B] sm:block"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-lg"
        >
          <div className="border-b border-[#F1F5F9] px-4 py-3 flex flex-col gap-0.5">
            <p className="truncate text-sm font-semibold text-[#0F172A]">
              {user.name ?? 'Signed in'}
            </p>
            <p className="truncate text-xs text-[#64748B]">
              {user.role_label ?? user.role.replace(/_/g, ' ')}
            </p>
            <p className="truncate text-xs text-[#64748B]">{user.email}</p>
            {user.mobile && (
              <p className="truncate text-xs text-[#64748B]">{user.mobile}</p>
            )}
            {(showTenant || showOrg) && (
              <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-t border-[#F1F5F9] pt-1.5 text-xs">
                {showTenant && (
                  <>
                    <span className="whitespace-nowrap font-semibold text-[#94A3B8]">Company</span>
                    <span className="truncate text-[#64748B]">{user.tenant_name}</span>
                  </>
                )}
                {showOrg && (
                  <>
                    <span className="whitespace-nowrap font-semibold text-[#94A3B8]">Branch</span>
                    <span className="truncate text-[#64748B]">{user.org_name}</span>
                  </>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={pending}
            aria-busy={pending}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-[#DC2626] transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M3 4.75A2.75 2.75 0 0 1 5.75 2h4.5a.75.75 0 0 1 0 1.5h-4.5c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h4.5a.75.75 0 0 1 0 1.5h-4.5A2.75 2.75 0 0 1 3 15.25V4.75Zm10.72 1.97a.75.75 0 0 1 1.06 0l2.75 2.75a.75.75 0 0 1 0 1.06l-2.75 2.75a.75.75 0 1 1-1.06-1.06l1.47-1.47H8.75a.75.75 0 0 1 0-1.5h6.44l-1.47-1.47a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
