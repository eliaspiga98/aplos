/**
 * CSV utility leggera. Standard RFC 4180:
 * - Separatore: virgola
 * - Qualsiasi cella che contiene `,`, `"`, `\n` o `\r` viene racchiusa in
 *   doppi apici, e i `"` interni vengono raddoppiati.
 * - Newline tra righe: CRLF.
 */

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(
  rows: Record<string, unknown>[],
  columns: string[],
  headers?: string[],
): string {
  const head = (headers ?? columns).map(csvEscape).join(',');
  const body = rows
    .map((r) => columns.map((c) => csvEscape(r[c])).join(','))
    .join('\r\n');
  // Aggiungi BOM per compatibilità Excel su Windows con UTF-8.
  return '﻿' + head + '\r\n' + body + (rows.length ? '\r\n' : '');
}

export function csvFilename(base: string): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${base}-${y}${m}${day}.csv`;
}
