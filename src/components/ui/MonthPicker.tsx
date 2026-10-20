'use client';

import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMonth, businessCurrentMonth, shiftMonth } from '@/lib/utils';

/** Previous / next month switcher. Months after the current Eastern-time month are disabled. */
export function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const isCurrent = month >= businessCurrentMonth();
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <button
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Previous month"
        className="p-1 rounded-lg hover:bg-[var(--bg-hover)]"
        style={{ color: 'var(--text-secondary)' }}
      >
        <ChevronLeft size={16} />
      </button>
      <div className="flex items-center gap-2 px-2 min-w-[150px] justify-center">
        <Calendar size={14} style={{ color: 'var(--accent-violet)' }} />
        <span className="text-sm font-medium" aria-live="polite">{formatMonth(month)}</span>
      </div>
      <button
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={isCurrent}
        aria-label="Next month"
        className="p-1 rounded-lg hover:bg-[var(--bg-hover)] disabled:opacity-30"
        style={{ color: 'var(--text-secondary)' }}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
