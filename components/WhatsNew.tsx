'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/Modal';
import { dismissAnnouncement } from '@/lib/announcement-actions';
import { ANNOUNCEMENT_KEY } from '@/lib/announcement';

/**
 * One-time "new section" pop-up for staff and admins (never borrowers: it
 * lives in the admin layout, which sends borrowers to their portal).
 * To announce something new later, change ANNOUNCEMENT_KEY in
 * lib/announcement.ts and the text below.
 */

export default function WhatsNew({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  function close(goTo?: string) {
    setOpen(false);
    // Recorded in the background; if it fails, the pop-up simply shows again next time.
    dismissAnnouncement(ANNOUNCEMENT_KEY).catch(() => {});
    if (goTo) router.push(goTo);
  }

  return (
    <Modal open={open} onClose={() => close()} title="New: Brokerage" maxWidth={480}>
      <p style={{ margin: '0 0 12px', lineHeight: 1.55 }}>
        There&apos;s a new <b>Brokerage</b> section in the left menu. It&apos;s a separate list for
        deals funded outside this system, showing the borrower, property address, loan amount,
        closing date and lender.
      </p>
      <p style={{ margin: '0 0 20px', lineHeight: 1.55 }} className="muted">
        {isAdmin
          ? 'Use “+ Add loan” on that page to record a deal. You can search by name, address, lender or closing date.'
          : 'You can view and search the list by name, address, lender or closing date.'}
        {' '}It doesn&apos;t affect any loans, statements or borrowers.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn secondary" onClick={() => close()}>Got it</button>
        <button className="btn" onClick={() => close('/admin/brokerage')}>Take me there</button>
      </div>
    </Modal>
  );
}
