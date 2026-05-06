/**
 * Tiny CSV export utility — converts an array of rows into a downloadable CSV
 * file. No external deps. Cells are escaped for commas, quotes, and newlines.
 */

export type CsvCell = string | number | null | undefined;

export interface CsvExportOptions {
  filename: string;
  headers: string[];
  rows: CsvCell[][];
}

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCsv({ filename, headers, rows }: CsvExportOptions): void {
  const lines = [headers.map(escapeCell).join(',')];
  rows.forEach((row) => lines.push(row.map(escapeCell).join(',')));
  // Prepend a UTF-8 BOM so Excel opens accented characters correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function timestampedFilename(prefix: string): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${prefix}_${y}-${m}-${day}.csv`;
}
