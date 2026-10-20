import { redirect } from 'next/navigation';
import { UserRole } from '@/types';
import { getCurrentProfile } from '@/lib/auth/current-profile';

/**
 * Server-side guard for a dashboard area: sends anyone without one of the
 * allowed roles back to /dashboard. (The database also enforces access; this
 * stops other roles from loading the pages at all.)
 */
export async function requireRole(allowed: UserRole[]) {
  const { userId, profile } = await getCurrentProfile();
  if (!userId) redirect('/login');
  if (!profile || !allowed.includes(profile.role)) redirect('/dashboard');
  return profile;
}
