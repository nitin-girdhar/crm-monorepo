'use client';

import * as XLSX from 'xlsx';

export type ExportFormat = 'xlsx' | 'csv';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function toAoA<T>(rows: readonly T[], columns: ReadonlyArray<ExportColumn<T>>): (string | number)[][] {
  const headerRow = columns.map((c) => c.header);
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = c.value(row);
      if (v === null || v === undefined) return '';
      return v;
    }),
  );
  return [headerRow, ...body];
}

export function exportRows<T>(
  rows: readonly T[],
  columns: ReadonlyArray<ExportColumn<T>>,
  filename: string,
  format: ExportFormat = 'xlsx',
): void {
  const aoa = toAoA(rows, columns);
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    downloadBlob(
      new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }),
      `${filename}.csv`,
    );
    return;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Export');
  const buf = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  downloadBlob(
    new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${filename}.xlsx`,
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildFilename(segments: ReadonlyArray<string>): string {
  const parts = segments
    .map((s) => slugify(s))
    .filter((s) => s.length > 0);
  parts.push(todayStamp());
  return parts.join('-');
}
