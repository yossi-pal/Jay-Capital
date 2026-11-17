import { redirect } from 'next/navigation';
import { isPrivateSignedIn } from '@/lib/private-auth';

export const dynamic = 'force-dynamic';

/** /private opens the Vault. (Signed out, the layout shows the PIN screen.) */
export default async function PrivatePage() {
  if (await isPrivateSignedIn()) redirect('/private/vault');
  return null;
}
