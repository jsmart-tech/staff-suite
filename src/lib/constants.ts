import { TaskStatus } from '@/types';

/** Departments offered in staff and profile forms. */
export const DEPARTMENTS = ['Engineering', 'Design', 'Marketing', 'Finance', 'Operations', 'HR', 'Sales', 'Legal'];

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
];
