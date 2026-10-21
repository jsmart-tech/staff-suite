import { describe, expect, it } from 'vitest';
import {
  businessDayStart, daysInMonth, formatCurrency, formatDateOnly, formatHours, formatMonth,
  isIsoDate, shiftMonth, toCsv,
} from '@/lib/utils';

describe('Eastern-time day boundaries', () => {
  it('uses UTC-5 in winter (EST)', () => {
    expect(new Date(businessDayStart('2026-01-15')).toISOString()).toBe('2026-01-15T05:00:00.000Z');
  });
  it('uses UTC-4 in summer (EDT)', () => {
    expect(new Date(businessDayStart('2026-07-15')).toISOString()).toBe('2026-07-15T04:00:00.000Z');
  });
  it('handles the days daylight saving starts and ends', () => {
    expect(new Date(businessDayStart('2026-03-08')).toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(new Date(businessDayStart('2026-11-01')).toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });
});

describe('months', () => {
  it('moves across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('knows month lengths, including leap years', () => {
    expect(daysInMonth('2028-02')).toHaveLength(29);
    expect(daysInMonth('2026-02')).toHaveLength(28);
    expect(daysInMonth('2026-10').at(-1)).toBe('2026-10-31');
  });
  it('formats month and date labels without shifting the day', () => {
    expect(formatMonth('2026-10')).toBe('October 2026');
    expect(formatDateOnly('2026-10-01')).toBe('Oct 1');
  });
});

describe('formatting', () => {
  it('shows US dollars', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });
  it('never shows "60m"', () => {
    expect(formatHours(1.999)).toBe('2h');
    expect(formatHours(1.5)).toBe('1h 30m');
  });
  it('validates calendar dates', () => {
    expect(isIsoDate('2026-10-20')).toBe(true);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('20/10/2026')).toBe(false);
  });
});

describe('CSV export', () => {
  it('quotes cells and escapes quotes', () => {
    expect(toCsv([['Ade, Jr.', 'Said "hi"', 12.5]])).toBe('"Ade, Jr.","Said ""hi""",12.5');
  });
  it('stops spreadsheet formulas from running', () => {
    expect(toCsv([['=HYPERLINK("x")', '+1', '-5', '@SUM(A1)']])).toBe(`"'=HYPERLINK(""x"")","'+1","'-5","'@SUM(A1)"`);
  });
});
