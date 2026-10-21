import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTANT, ADMIN, createTestDatabase, EMPLOYEE, EMPLOYEE_2 } from './setup';

let t: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => { t = await createTestDatabase(); });

const newTask = async (userId: string, title: string, dateWorked = '2026-10-05') => {
  const { rows } = await t.db.query<{ id: string }>(
    `INSERT INTO public.tasks (user_id, title, date_worked) VALUES ($1, $2, $3) RETURNING id`, [userId, title, dateWorked]);
  return rows[0].id;
};

describe('schema', () => {
  it('has Row Level Security on every table', async () => {
    const { rows } = await t.db.query(`SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`);
    expect(rows).toEqual([]);
  });
  it('hides the staff directory from logged-out visitors', async () => {
    await expect(t.as(null, `SELECT * FROM public.staff_directory`)).rejects.toThrow(/permission denied/);
  });
});

describe('accounts and roles', () => {
  it('ignores role and pay sent at sign-up', async () => {
    await t.db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('55555555-5555-5555-5555-555555555555', 'x@test', '{"role":"admin","hourly_rate":999}')`);
    const { rows } = await t.db.query(`SELECT role, hourly_rate FROM public.profiles WHERE email = 'x@test'`);
    expect(rows[0]).toMatchObject({ role: 'employee', hourly_rate: '0.00' });
  });
  it('stops employees changing their own role or rate', async () => {
    await expect(t.as(EMPLOYEE, `UPDATE public.profiles SET hourly_rate = 500 WHERE id = $1`, [EMPLOYEE]))
      .rejects.toThrow(/cannot change your role/);
  });
  it('stops users inserting their own profile row', async () => {
    await expect(t.as(EMPLOYEE, `INSERT INTO public.profiles (id, email, role) VALUES ($1, 'y@test', 'admin')`, [EMPLOYEE_2]))
      .rejects.toThrow(/row-level security|permission denied/);
  });
  it('records who changed a pay rate', async () => {
    await t.as(ADMIN, `UPDATE public.profiles SET hourly_rate = 21 WHERE id = $1`, [EMPLOYEE]);
    const { rows } = await t.db.query(`SELECT new_value, changed_by FROM public.profile_change_log WHERE profile_id = $1 ORDER BY changed_at DESC LIMIT 1`, [EMPLOYEE]);
    expect(rows[0]).toMatchObject({ new_value: '21.00', changed_by: ADMIN });
    await t.as(ADMIN, `UPDATE public.profiles SET hourly_rate = 20 WHERE id = $1`, [EMPLOYEE]);
  });
  it('lets only admins and accountants read that history', async () => {
    expect((await t.as(EMPLOYEE, `SELECT * FROM public.profile_change_log`)).rows).toHaveLength(0);
    expect((await t.as(ACCOUNTANT, `SELECT * FROM public.profile_change_log`)).rows.length).toBeGreaterThan(0);
  });
  it('never removes the last admin', async () => {
    await expect(t.as(ADMIN, `UPDATE public.profiles SET role = 'employee' WHERE id = $1`, [ADMIN])).rejects.toThrow(/at least one admin/);
    await expect(t.db.query(`DELETE FROM public.profiles WHERE id = $1`, [ADMIN])).rejects.toThrow(/at least one admin/);
  });
});

describe('server-only tables', () => {
  it.each(['verified_uploads', 'chat_email_notifications'])('blocks browsers from %s', async (table) => {
    await expect(t.as(EMPLOYEE, `SELECT * FROM public.${table}`)).rejects.toThrow(/permission denied/);
  });
  it('blocks browsers from writing messages, tasks or login records directly', async () => {
    await expect(t.as(EMPLOYEE, `INSERT INTO public.chat_messages (sender_id, content) VALUES ($1, 'x')`, [EMPLOYEE])).rejects.toThrow(/permission denied|row-level/);
    await expect(t.as(EMPLOYEE, `UPDATE public.tasks SET hours_spent = 99 WHERE user_id = $1`, [EMPLOYEE])).rejects.toThrow(/permission denied/);
    await expect(t.as(EMPLOYEE, `INSERT INTO public.login_logs (user_id) VALUES ($1)`, [EMPLOYEE])).rejects.toThrow(/permission denied|row-level/);
  });
});

describe('rate limiting and error log', () => {
  it('allows up to the limit in a window, then refuses', async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const { rows } = await t.db.query<{ ok: boolean }>(`SELECT consume_rate_limit('test:key', 3, 60) AS ok`);
      results.push(rows[0].ok);
    }
    expect(results).toEqual([true, true, true, false]);
  });
  it('cannot be called or read from a browser', async () => {
    await expect(t.as(EMPLOYEE, `SELECT consume_rate_limit('x', 1, 60)`)).rejects.toThrow(/permission denied/);
    await expect(t.as(EMPLOYEE, `SELECT * FROM public.rate_limit_hits`)).rejects.toThrow(/permission denied/);
  });
  it('shows errors to admins only, and browsers cannot write them directly', async () => {
    await t.db.query(`INSERT INTO public.app_errors (source, message) VALUES ('server', 'boom')`);
    expect((await t.as(ADMIN, `SELECT * FROM public.app_errors`)).rows).toHaveLength(1);
    expect((await t.as(EMPLOYEE, `SELECT * FROM public.app_errors`)).rows).toHaveLength(0);
    await expect(t.as(EMPLOYEE, `INSERT INTO public.app_errors (source, message) VALUES ('browser', 'x')`)).rejects.toThrow(/permission denied/);
  });
});

describe('time tracking', () => {
  it('times sessions on the server and splits them at Eastern midnight', async () => {
    const task = await newTask(EMPLOYEE, 'Night shift');
    await t.db.query(`UPDATE public.tasks SET is_timer_running = true,
      timer_start_time = (((now() AT TIME ZONE 'America/New_York')::date)::timestamp AT TIME ZONE 'America/New_York') - interval '1 hour'
      WHERE id = $1`, [task]);
    await t.as(EMPLOYEE, `SELECT stop_task_timer($1)`, [task]);
    const { rows } = await t.db.query<{ hours: string; hourly_rate: string }>(`SELECT hours, hourly_rate FROM public.time_entries WHERE task_id = $1 ORDER BY work_date`, [task]);
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].hours)).toBeCloseTo(1, 2);
    expect(Number(rows[0].hourly_rate)).toBe(20);
  });
  it('allows one running timer per person', async () => {
    const a = await newTask(EMPLOYEE_2, 'A');
    const b = await newTask(EMPLOYEE_2, 'B');
    await t.as(EMPLOYEE_2, `SELECT start_task_timer($1)`, [a]);
    await expect(t.as(EMPLOYEE_2, `SELECT start_task_timer($1)`, [b])).rejects.toThrow(/other running timer/);
    await t.as(EMPLOYEE_2, `SELECT stop_task_timer($1)`, [a]);
  });
  it('can stop a timer straight after starting it (zero-length session)', async () => {
    const task = await newTask(EMPLOYEE_2, 'Oops, wrong task');
    await t.as(EMPLOYEE_2, `SELECT start_task_timer($1)`, [task]);
    const { rows } = await t.as(EMPLOYEE_2, `SELECT (stop_task_timer($1)).is_timer_running AS running`, [task]);
    expect(rows[0].running).toBe(false);
  });
  it("won't let people time someone else's task", async () => {
    const task = await newTask(EMPLOYEE_2, 'Not yours');
    await expect(t.as(EMPLOYEE, `SELECT start_task_timer($1)`, [task])).rejects.toThrow(/own tasks/);
  });
  it('checks manual hours', async () => {
    const task = await newTask(EMPLOYEE, 'Manual', '2026-10-10');
    await t.as(EMPLOYEE, `SELECT set_task_hours($1, 3, '2026-10-10')`, [task]);
    const { rows } = await t.db.query(`SELECT source, hours FROM public.time_entries WHERE task_id = $1`, [task]);
    expect(rows[0]).toMatchObject({ source: 'manual', hours: '3.0000' });
    await expect(t.as(EMPLOYEE, `SELECT set_task_hours($1, -1, '2026-10-10')`, [task])).rejects.toThrow(/negative/);
    await expect(t.as(EMPLOYEE, `SELECT set_task_hours($1, 30, '2026-10-10')`, [task])).rejects.toThrow(/24 hours/);
    await expect(t.as(EMPLOYEE, `SELECT set_task_hours($1, 4, business_today() + 1)`, [task])).rejects.toThrow(/future/);
  });
});

describe('monthly payroll', () => {
  it('uses the rate at the time of work, even after a rate change', async () => {
    const task = await newTask(EMPLOYEE_2, 'Paid at 25', '2026-09-15');
    await t.as(EMPLOYEE_2, `SELECT set_task_hours($1, 4, '2026-09-15')`, [task]);
    await t.as(ADMIN, `UPDATE public.profiles SET hourly_rate = 99 WHERE id = $1`, [EMPLOYEE_2]);
    const { rows } = await t.as(ACCOUNTANT, `SELECT * FROM monthly_hours_report('2026-09-01')`);
    const row = rows.find(r => r.user_id === EMPLOYEE_2)!;
    expect(Number(row.total_hours)).toBe(4);
    expect(Number(row.total_pay)).toBe(100);
    expect(Number(row.current_rate)).toBe(99);
  });
  it('includes every role and keeps months separate', async () => {
    const task = await newTask(ACCOUNTANT, 'Books', '2026-08-31');
    await t.as(ACCOUNTANT, `SELECT set_task_hours($1, 2, '2026-08-31')`, [task]);
    const aug = (await t.as(ACCOUNTANT, `SELECT * FROM monthly_hours_report('2026-08-01')`)).rows;
    const sep = (await t.as(ACCOUNTANT, `SELECT * FROM monthly_hours_report('2026-09-01')`)).rows;
    expect(Number(aug.find(r => r.user_id === ACCOUNTANT)!.total_pay)).toBe(60);
    expect(Number(sep.find(r => r.user_id === ACCOUNTANT)!.total_hours)).toBe(0);
    expect(new Set(sep.map(r => r.role))).toEqual(new Set(['admin', 'accountant', 'employee']));
  });
  it('is hidden from employees and logged-out visitors', async () => {
    await expect(t.as(EMPLOYEE, `SELECT * FROM monthly_hours_report('2026-09-01')`)).rejects.toThrow(/Only admins and accountants/);
    await expect(t.as(null, `SELECT * FROM monthly_hours_report('2026-09-01')`)).rejects.toThrow(/permission denied/);
  });
});
