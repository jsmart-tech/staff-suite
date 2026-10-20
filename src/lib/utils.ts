import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a monetary amount using the Internationalization API.
 * @param amount   - Number to format
 * @param currency - ISO 4217 currency code (default: 'NGN')
 */
export function formatCurrency(amount: number, currency = 'NGN'): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatHours(hours: number): string {
  // Round to whole minutes first so 1.999h shows as "2h", not "1h 60m".
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** The business runs on Lagos time; dates for work and payroll use it. */
export const BUSINESS_TIME_ZONE = 'Africa/Lagos';

/** Today's date in Lagos as YYYY-MM-DD (not UTC, which is an hour behind). */
export function lagosToday(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE }).format(new Date());
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** The current Lagos month as YYYY-MM. */
export function lagosCurrentMonth(): string {
  return lagosToday().slice(0, 7);
}

/** Moves a YYYY-MM month by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Every date (YYYY-MM-DD) in a YYYY-MM month. */
export function daysInMonth(month: string): string[] {
  const [year, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

/** "October 2026" for a YYYY-MM month. */
export function formatMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Formats a stored YYYY-MM-DD date without shifting it a day in timezones
 * west of UTC (new Date('2026-10-01') is midnight UTC, not local midnight).
 */
export function formatDateOnly(date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  const [year, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, d)).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' });
}

/**
 * Builds CSV text. Every cell is quoted, and text that a spreadsheet would run
 * as a formula (starting with = + - @) is prefixed with ' so it stays text.
 */
export function toCsv(rows: Array<Array<string | number>>): string {
  const cell = (value: string | number) => {
    if (typeof value === 'number') return String(value);
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return rows.map(row => row.map(cell).join(',')).join('\r\n');
}

/** Downloads CSV text as a file. Includes a BOM so Excel reads UTF-8 names. */
export function downloadCsv(fileName: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getRoleBadgeColor(role: string) {
  switch (role) {
    case 'admin':
      return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
    case 'accountant':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'employee':
      return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
    default:
      return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  }
}

export function getStatusColor(status: string) {
  switch (status) {
    case 'in_progress':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    case 'completed':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'blocked':
      return 'bg-red-500/20 text-red-300 border-red-500/30';
    default:
      return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  }
}
