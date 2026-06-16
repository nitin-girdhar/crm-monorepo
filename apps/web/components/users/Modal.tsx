'use client';

import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  locked?: boolean;
}

export default function Modal({ open, onClose, title, children, locked }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, locked]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8"
      onClick={() => {
        if (!locked) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="flex max-h-[calc(100dvh-4rem)] w-full max-w-md flex-col overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-[#0F172A]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                d="M4.28 4.28a.75.75 0 0 1 1.06 0L10 8.94l4.66-4.66a.75.75 0 1 1 1.06 1.06L11.06 10l4.66 4.66a.75.75 0 1 1-1.06 1.06L10 11.06l-4.66 4.66a.75.75 0 1 1-1.06-1.06L8.94 10 4.28 5.34a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
