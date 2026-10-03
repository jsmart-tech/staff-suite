import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { AccountantDashboard } from '@/components/accountant/AccountantDashboard';
import { EmployeeDashboard } from '@/components/employee/EmployeeDashboard';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');

  if (profile.role === 'admin') return <AdminDashboard profile={profile} />;
  if (profile.role === 'accountant') return <AccountantDashboard profile={profile} />;
  return <EmployeeDashboard profile={profile} />;
}
