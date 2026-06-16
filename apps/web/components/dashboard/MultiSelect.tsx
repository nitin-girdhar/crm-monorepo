'use client';

import { useMemo } from 'react';
import { useDropdown } from '@/hooks/useDropdown';

export interface SelectOption {
  id: string | number;
  label: string;
}

interface Props {
  label: string;
  placeholder: string;
  options: SelectOption[];
  selected: SelectOption[];
  onChange: (next: SelectOption[]) => void;
  loading?: boolean;
  disabled?: boolean;
}

export default function MultiSelect({
  label, placeholder, options, selected, onChange, loading = false, disabled = false,
}: Props) {
  const { open, setOpen, search, setSearch, rootRef, searchInputRef } = useDropdown();

  const selectedIds = useMemo(() => new Set(selected.map((o) => o.id)), [selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return options.filter((o) => !q || String(o.label).toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (opt: SelectOption) => {
    if (selectedIds.has(opt.id)) {
      onChange(selected.filter((o) => o.id !== opt.id));
    } else {
      onChange([...selected, opt]);
    }
    searchInputRef.current?.focus();
  };

  const removeChip = (opt: SelectOption, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((o) => o.id !== opt.id));
  };

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
        {label}
      </span>

      <button
        type="button"
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-[34px] w-full min-w-[140px] flex-wrap items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-left shadow-sm transition-colors hover:border-[#0b6cbf] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#F8FAFC] aria-expanded:border-[#0b6cbf] aria-expanded:ring-2 aria-expanded:ring-[#0b6cbf]/20"
      >
        {selected.length === 0 ? (
          <span className="text-xs text-[#94A3B8]">{placeholder}</span>
        ) : (
          selected.map((opt) => (
            <span
              key={opt.id}
              className="flex items-center gap-0.5 rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-1.5 py-0.5 text-[11px] font-semibold text-[#0b6cbf]"
            >
              {opt.label}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => removeChip(opt, e)}
                aria-label={`Remove ${opt.label}`}
                className="cursor-pointer text-[#0b6cbf]/60 hover:text-[#0b6cbf]"
              >
                ×
              </span>
            </span>
          ))
        )}
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-full z-50 mt-1 w-full min-w-[180px] overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-lg"
        >
          <div className="border-b border-[#F1F5F9] p-2">
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs text-[#0F172A] focus:border-[#0b6cbf] focus:outline-none"
            />
          </div>

          <div className="max-h-56 overflow-y-auto">
            {loading && (
              <p className="px-3 py-4 text-center text-xs text-[#64748B]">Loading…</p>
            )}
            {!loading && filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-[#64748B]">
                {search ? `No matches for "${search}"` : 'No options available'}
              </p>
            )}
            {!loading && filtered.map((opt) => {
              const checked = selectedIds.has(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggle(opt)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[#F8FAFC]"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      checked ? 'border-[#0b6cbf] bg-[#0b6cbf]' : 'border-[#CBD5E1] bg-white'
                    }`}
                  >
                    {checked && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className={`truncate text-xs ${checked ? 'font-semibold text-[#0F172A]' : 'text-[#374151]'}`}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>

          {selected.length > 0 && (
            <div className="border-t border-[#F1F5F9] p-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded-lg py-1 text-center text-[11px] font-semibold text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
