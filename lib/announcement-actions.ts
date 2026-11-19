'use server';

import { run } from '@/lib/result';
import { serverClient } from '@/lib/supabase-server';

/**
 * "What's new" pop-ups for staff and admins. Each person sees an
 * announcement once; dismissing it records its key on their own login
 * (Supabase user metadata), so it stays dismissed on every device. This is
 * only a display preference -- it grants no access to anything.
 */
export async function dismissAnnouncement(key: string) {
  return run(async () => {
    const supabase = serverClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const seen: string[] = Array.isArray(user.user_metadata?.seen_announcements)
      ? user.user_metadata.seen_announcements : [];
    if (seen.includes(key)) return { message: 'ok' };
    const { error } = await supabase.auth.updateUser({ data: { seen_announcements: [...seen, key] } });
    if (error) throw error;
    return { message: 'ok' };
  });
}
