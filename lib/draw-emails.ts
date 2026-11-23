import { money, fmtDateTime } from '@/lib/format';

/** HTML-escape a value for an email body. */
const esc = (v: unknown) =>
  String(v ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));

export interface LenderDrawEmail {
  amount: number;            // approved amount once approved, else requested
  requestedAmount: number;
  approved: boolean;
  requestedAt: string;
  note: string | null;
  message: string;
  wire: string;              // the request's trusted wiring, or '' for none
  loanNumber: string;
  property: string;
  borrower: string;
  loanAmount: number;
  constructionDrawn: number;
  constructionLeft: number;
}

/** The body of the "Send to lender" draw request email (wrap in brandShell). */
export function lenderDrawEmailBody(e: LenderDrawEmail): string {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:7px 0;color:#6B7A90;border-top:1px solid #E4EAF3">${esc(k)}</td>`
    + `<td style="padding:7px 0;text-align:right;font-weight:600;border-top:1px solid #E4EAF3">${esc(v)}</td></tr>`;
  return `
      <h2 style="margin:0 0 12px;color:#04162A;font-size:18px">Draw request${e.approved ? ' (approved)' : ''}: ${esc(money(e.amount))}</h2>
      ${e.message ? `<p style="margin:0 0 16px;line-height:1.6;white-space:pre-line">${esc(e.message)}</p>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px">
        ${row('Loan', e.loanNumber)}
        ${row('Property', e.property)}
        ${row('Borrower', e.borrower)}
        ${row(e.approved ? 'Amount approved' : 'Amount requested', money(e.amount))}
        ${e.approved && Math.abs(e.amount - e.requestedAmount) > 0.005 ? row('Amount requested', money(e.requestedAmount)) : ''}
        ${row('Requested', fmtDateTime(e.requestedAt))}
        ${row('Loan amount', money(e.loanAmount))}
        ${row('Construction drawn so far', money(e.constructionDrawn))}
        ${row('Construction left to draw', money(e.constructionLeft))}
      </table>
      ${e.note ? `<p style="margin:0 0 6px;line-height:1.6"><b>What it is for:</b> ${esc(e.note)}</p>` : ''}
      ${e.wire ? `<div style="margin:16px 0 0;padding:12px 14px;background:#F7F9FC;border:1px solid #E4EAF3;border-radius:8px">
        <div style="font-size:12px;font-weight:700;letter-spacing:.04em;color:#6B7A90;margin:0 0 6px">WIRING INSTRUCTIONS</div>
        <div style="line-height:1.6;white-space:pre-line;font-size:14px">${esc(e.wire)}</div>
      </div>` : ''}
      <p style="margin:16px 0 0;line-height:1.6;color:#6B7A90;font-size:13px">Reply to this email with any questions.</p>
    `;
}
