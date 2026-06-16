'use client';

import { useRef, useState } from 'react';
import type { SessionUser } from '@crm/types';
import { useDismissible } from '@/hooks/useDropdown';

interface Props {
  value: string;
  onChange: (userId: string) => void;
  users: SessionUser[];
  disabled?: boolean;
  placeholder?: string;
  hasError?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  extraOption?: { id: string; label: string };
}

export default function UserPicker({
  value,
  onChange,
  users,
  disabled,
  placeholder = 'Select a user…',
  hasError,
  allowEmpty,
  emptyLabel = 'Unassigned',
  extraOption,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useDismissible(open, [containerRef], () => setOpen(false));

  const selected = users.find((u) => u.id === value)
    ?? (extraOption && extraOption.id === value ? null : null);

  const selectedLabel = selected
    ? (selected.name ? `${selected.name} (${selected.email})` : selected.email)
    : extraOption?.id === value
      ? extraOption.label
      : (allowEmpty && !value ? emptyLabel : '');

  const borderClass = hasError
    ? 'border-red-400 focus:ring-red-200'
    : 'border-[#E2E8F0] focus:border-[#0b6cbf] focus:ring-[#0b6cbf]/20';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm text-[#0F172A] focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-[#F8FAFC] ${borderClass}`}
      >
        <span className={selectedLabel ? 'truncate' : 'text-[#94A3B8]'}>
          {selectedLabel || placeholder}
        </span>
        <svg
          className={`ml-2 h-4 w-4 shrink-0 text-[#64748B] transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white shadow-lg"
        >
          {allowEmpty && (
            <li
              role="option"
              aria-selected={!value}
              onClick={() => { onChange(''); setOpen(false); }}
              className={`cursor-pointer px-3 py-2 text-sm transition-colors ${
                !value ? 'bg-[#EFF6FF] text-[#0b6cbf]' : 'text-[#64748B] hover:bg-[#F8FAFC]'
              }`}
            >
              {emptyLabel}
            </li>
          )}
          {extraOption && !users.some((u) => u.id === extraOption.id) && (
            <li
              role="option"
              aria-selected={value === extraOption.id}
              onClick={() => { onChange(extraOption.id); setOpen(false); }}
              className={`cursor-pointer px-3 py-2 text-sm transition-colors ${
                value === extraOption.id ? 'bg-[#EFF6FF] text-[#0b6cbf]' : 'text-[#0F172A] hover:bg-[#F8FAFC]'
              }`}
            >
              {extraOption.label}
            </li>
          )}
          {users.map((u) => {
            const isSelected = u.id === value;
            const name = u.name ? `${u.name} (${u.email})` : u.email;
            return (
              <li
                key={u.id}
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(u.id); setOpen(false); }}
                className={`cursor-pointer px-3 py-2 transition-colors ${
                  isSelected
                    ? 'bg-[#EFF6FF] text-[#0b6cbf]'
                    : 'text-[#0F172A] hover:bg-[#F8FAFC]'
                }`}
              >
                <span className="block truncate text-sm font-medium">{name}</span>
                {u.role_label && (
                  <span className="block truncate text-[11px] text-[#64748B]">{u.role_label}</span>
                )}
              </li>
            );
          })}
          {users.length === 0 && !extraOption && (
            <li className="px-3 py-4 text-center text-xs text-[#64748B]">No assignees available</li>
          )}
        </ul>
      )}
    </div>
  );
}
