import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { Profile } from '@/types';

/**
 * The signed-in user and their profile, loaded once per request and shared by
 * the dashboard layout, role guards and pages.
 */
export const getCurrentProfile = cache(async (): Promise<{ userId: string | null; profile: Profile | null }> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, profile: null };
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return { userId: user.id, profile: (profile as Profile | null) ?? null };
});
