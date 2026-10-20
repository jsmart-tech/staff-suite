import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth/current-profile';
import { Sidebar } from '@/components/layout/Sidebar';
import { DashboardMain } from '@/components/layout/DashboardMain';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await getCurrentProfile();
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
      <Sidebar profile={profile} />
      <DashboardMain>{children}</DashboardMain>
    </div>
  );
}
