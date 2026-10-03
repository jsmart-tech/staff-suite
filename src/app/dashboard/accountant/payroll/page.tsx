import { AccountantDashboard } from '@/components/accountant/AccountantDashboard';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Profile } from '@/types';

export default async function AccountantPayrollPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!profile || profile.role !== 'accountant') redirect('/dashboard');

  return <AccountantDashboard profile={profile as Profile} />;
}
