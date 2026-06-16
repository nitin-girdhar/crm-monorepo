'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useDismissible(
  open: boolean,
  refs: React.RefObject<HTMLElement | null>[],
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const refsRef = useRef(refs);
  refsRef.current = refs;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (refsRef.current.some((r) => r.current?.contains(target))) return;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
}

export function useDropdown() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismissible(open, [rootRef], close);

  useEffect(() => {
    if (open) queueMicrotask(() => searchInputRef.current?.focus());
    else setSearch('');
  }, [open]);

  return { open, setOpen, search, setSearch, rootRef, searchInputRef };
}
