'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@crm/auth-constants';
import { navItemsForRole } from '@/src/config/navigation';

const TOGGLE_EVENT = 'fc:sidebar-toggle';
const SET_EVENT = 'fc:sidebar-set';

export function toggleSidebar(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOGGLE_EVENT));
}

function setSidebar(open: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SET_EVENT, { detail: open }));
}

interface Props {
  role: UserRole;
}

export default function SidebarController({ role }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const items = navItemsForRole(role);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onSet = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      setOpen(!!detail);
    };
    window.addEventListener(TOGGLE_EVENT, onToggle);
    window.addEventListener(SET_EVENT, onSet);
    return () => {
      window.removeEventListener(TOGGLE_EVENT, onToggle);
      window.removeEventListener(SET_EVENT, onSet);
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div
      className={`lg:hidden ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Primary navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[80vw] flex-col border-r border-[#E2E8F0] bg-white shadow-2xl transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#E2E8F0] px-4">
          <span className="text-sm font-bold tracking-tight text-[#0F172A]">
            Workspace
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#64748B] hover:bg-[#F1F5F9]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav
          className="flex flex-1 flex-col gap-1 overflow-y-auto p-3"
          aria-label="Primary mobile"
        >
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'rounded-lg bg-[#EFF6FF] px-3 py-2.5 text-sm font-semibold text-[#0b6cbf]'
                    : 'rounded-lg px-3 py-2.5 text-sm font-medium text-[#475569] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A]'
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}

export { setSidebar };
