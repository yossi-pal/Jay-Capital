import { isPrivateSignedIn } from '@/lib/private-auth';
import { loadVault } from '@/lib/vault';
import { Vault } from './Vault';

export const dynamic = 'force-dynamic';

export default async function VaultPage() {
  // The layout shows the PIN screen when signed out; never load files then.
  if (!(await isPrivateSignedIn())) return null;

  let data;
  try {
    data = await loadVault();
  } catch {
    return (
      <div className="pv-page">
        <div className="pv-page-head"><h1>Vault</h1></div>
        <div className="pv-card pv-empty">
          <b>The Vault is not set up yet</b>
          Its storage has not been created in the database. It will work once that step is done.
        </div>
      </div>
    );
  }
  // The storage key never needs to reach the browser.
  const files = data.files.map(({ storage_path, ...f }) => f);
  return <Vault folders={data.folders} files={files} />;
}
