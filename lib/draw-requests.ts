/**
 * Draw requests: shared shapes and labels, safe to use in the browser.
 * The server actions live in lib/draw-request-actions.ts.
 */

export type DrawRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

export interface DrawRequestRow {
  id: string;
  loan_id: string;
  amount: number;
  needed_by: string | null;
  note: string | null;
  status: DrawRequestStatus;
  requested_at: string;
  decided_at: string | null;
  decision_note: string | null;
  approved_amount: number | null;
}

/** The columns both the portal and the admin pages read. */
export const DRAW_REQUEST_COLUMNS =
  'id, loan_id, amount, needed_by, note, status, requested_at, decided_at, decision_note, approved_amount';

export const DRAW_REQUEST_LABEL: Record<DrawRequestStatus, string> = {
  pending: 'Waiting for review',
  approved: 'Approved',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

/** Chip colour for a status, using the site's existing chip styles. */
export function drawRequestChip(status: DrawRequestStatus): string {
  return status === 'approved' ? 'chip ok' : status === 'declined' ? 'chip late' : 'chip';
}
