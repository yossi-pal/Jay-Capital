import { getMe } from '@/lib/session';

/**
 * The private videos page belongs to one person. Their sign-in email lives
 * in the Vercel environment variable PRIVATE_VIDEOS_OWNER_EMAIL (never in
 * code, since this repository is public). If the variable is missing, nobody
 * gets in -- the safe default.
 */
export async function isVideosOwner(): Promise<boolean> {
  const owner = process.env.PRIVATE_VIDEOS_OWNER_EMAIL?.trim().toLowerCase();
  if (!owner) return false;
  const { user } = await getMe();
  return !!user?.email && user.email.toLowerCase() === owner;
}
