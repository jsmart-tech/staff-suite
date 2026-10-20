'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserRole } from '@/types';

/** One person's totals for a month (from the monthly_hours_report SQL function). */
export interface MonthlyHoursRow {
  user_id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  department: string | null;
  avatar_url: string | null;
  /** The person's hourly rate today. Pay uses the rate at the time each hour was logged. */
  current_rate: number;
  total_hours: number;
  timer_hours: number;
  /** Hours typed in by hand (including hours carried over from before time tracking). */
  manual_hours: number;
  total_pay: number;
  days_worked: number;
}

/**
 * Loads every staff member's hours and pay for a YYYY-MM month, all roles.
 * With `byDay`, also returns hours per person per date for that month.
 * Totals are computed in the database, so there is no row limit.
 */
export function useMonthlyHours(month: string, { byDay = false } = {}) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<{
    month: string | null;
    rows: MonthlyHoursRow[];
    days: Record<string, Record<string, number>>;
    error: string;
  }>({ month: null, rows: [], days: {}, error: '' });

  useEffect(() => {
    let cancelled = false;
    const firstDay = `${month}-01`;
    Promise.all([
      supabase.rpc('monthly_hours_report', { p_month: firstDay }),
      byDay ? supabase.rpc('monthly_hours_by_day', { p_month: firstDay }) : Promise.resolve({ data: [], error: null }),
    ]).then(([report, perDay]) => {
      if (cancelled) return;
      const error = report.error?.message || perDay.error?.message || '';
      const rows = ((report.data || []) as MonthlyHoursRow[]).map(row => ({
        ...row,
        current_rate: Number(row.current_rate),
        total_hours: Number(row.total_hours),
        timer_hours: Number(row.timer_hours),
        manual_hours: Number(row.manual_hours),
        total_pay: Number(row.total_pay),
      }));
      const days: Record<string, Record<string, number>> = {};
      for (const entry of (perDay.data || []) as Array<{ user_id: string; work_date: string; hours: number }>) {
        (days[entry.user_id] ??= {})[entry.work_date] = Number(entry.hours);
      }
      setState({ month, rows, days, error });
    }).catch(() => {
      if (!cancelled) setState({ month, rows: [], days: {}, error: 'Could not load hours. Check your connection and try again.' });
    });
    return () => { cancelled = true; };
  }, [supabase, month, byDay]);

  // Loading until the data for the *selected* month has arrived.
  return { ...state, loading: state.month !== month };
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  accountant: 'Accountant',
  employee: 'Employee',
};
