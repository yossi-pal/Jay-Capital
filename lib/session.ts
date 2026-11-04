import { cache } from 'react';
import { serverClient } from '@/lib/supabase-server';

/**
 * The signed-in user and their profile, looked up once per request.
 *
 * The admin layout and the page inside it both need this. Wrapped in React's
 * cache(), the second caller gets the first caller's answer instead of making
 * two more round trips to Supabase on every click.
 */
export const getMe = cache(async () => {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };
  const { data: profile } = await supabase
    .from('profiles').select('role, full_name, email').eq('id', user.id).single();
  return { user, profile: profile as { role: string; full_name: string | null; email: string | null } | null };
});
