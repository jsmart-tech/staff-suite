import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTestDatabase } from './setup';

// The pending live patch must apply on top of the current schema, twice.
describe('pending live patch', () => {
  it('patch_stage5_hardening.sql applies cleanly and is safe to re-run', async () => {
    const { db } = await createTestDatabase();
    const sql = fs.readFileSync(path.join(__dirname, '../../supabase/patch_stage5_hardening.sql'), 'utf8');
    await db.exec(sql);
    const results = await db.exec(sql);
    const check = results.at(-1)!.rows[0] as { new_tables: number; timer_fix_applied: boolean };
    expect(Number(check.new_tables)).toBe(2);
    expect(check.timer_fix_applied).toBe(true);
  });
});
