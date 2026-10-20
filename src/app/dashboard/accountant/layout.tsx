import { requireRole } from '@/lib/auth/require-role';

// Payroll and hours: accountants, plus admins (who can read the same data).
export default async function AccountantLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['accountant', 'admin']);
  return children;
}
