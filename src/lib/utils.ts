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
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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
