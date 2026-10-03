import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/Sidebar';
import { Profile } from '@/types';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) {
    redirect('/login');
  }

  return (
    /*
     * app-shell: full-height flex row
     *   sidebar (fixed width, sticky) | main-area (flex-1, scrolls)
     *
     * page-container inside main-area provides:
     *   - max-width clamp (1400px)
     *   - consistent responsive padding via CSS vars:
     *       mobile  < 640px:  20px
     *       tablet  >= 640px: 28px
     *       desktop >= 1024px: 40px
     *       wide    >= 1280px: 48px
     *
     * This is the ONLY place page padding is set for dashboard pages.
     * Individual pages should NOT add their own outer padding.
     */
    <div className="app-shell">
      <Sidebar profile={profile as Profile} />
      <div className="main-area">
        <div className="page-container">
          {children}
        </div>
      </div>
    </div>
  );
}
