'use client';

import { toggleSidebar } from './SidebarController';

export default function HamburgerButton() {
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label="Open navigation"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#475569] hover:bg-[#F1F5F9] lg:hidden"
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
