import { AccountantDashboard } from '@/components/accountant/AccountantDashboard';
import { requireRole } from '@/lib/auth/require-role';

export default async function AccountantPayrollPage() {
  const profile = await requireRole(['accountant', 'admin']);
  return <AccountantDashboard profile={profile} />;
}
