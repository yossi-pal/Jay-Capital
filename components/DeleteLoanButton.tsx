'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteLoan } from '@/lib/actions';
import { ConfirmDialog, AlertDialog } from '@/components/Modal';

/** Delete a loan, after a themed confirmation. Lives on the Edit screen. */
export default function DeleteLoanButton({
  loanId, loanNumber, borrowerName,
}: { loanId: string; loanNumber: string; borrowerName: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDelete() {
    setConfirm(false);
    setBusy(true);
    const res = await deleteLoan(loanId);
    if (!res.ok) { setError(res.error || 'Could not delete the loan.'); setBusy(false); return; }
    router.push('/admin/loans');
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn danger" disabled={busy} onClick={() => setConfirm(true)}>
        {busy ? 'Deleting…' : 'Delete loan'}
      </button>
      <ConfirmDialog
        open={confirm}
        title="Delete loan"
        message={`Delete loan ${loanNumber} for ${borrowerName}? This permanently removes the loan and all of its draws.`}
        confirmLabel="Delete loan" danger
        onConfirm={doDelete} onCancel={() => setConfirm(false)}
      />
      <AlertDialog
        open={!!error}
        title="That didn't work"
        message={error || ''}
        tone="error"
        onClose={() => setError(null)}
      />
    </>
  );
}
