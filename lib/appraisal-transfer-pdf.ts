import { rgb } from 'pdf-lib';
import { SIGNATURE_PNG_BASE64 } from '@/lib/letter-assets';
import {
  startLetter, top, LetterTooLongError, M, W, SIZE, LH, FIRST_BASE, LAST_BASE_LIMIT,
} from '@/lib/letterhead';

export { LetterTooLongError };

export interface AppraisalTransferInput {
  borrowerName: string;
  propertyAddress: string;
  /** The new lender's mortgagee clause: name on the first line, address below. */
  mortgageeClause: string;
  /** Already formatted, e.g. "11/9/2026". */
  date: string;
}

export const SIGNER = { name: 'Solomon Grunhut', title: 'Vice President of Jay Capital Funding INC' };

/** The signature block takes this much room below the last paragraph. */
const SIGNATURE_BLOCK = 100.47;

/**
 * The Appraisal Transfer Letter, laid out like the company's Word template:
 * letterhead, the AIR certification wording and the Vice President's
 * signature. Nothing is stored; the PDF is built on request.
 */
export async function appraisalTransferPDF(input: AppraisalTransferInput): Promise<Uint8Array> {
  const L = await startLetter('Appraisal Transfer Letter');
  const { page, font, bold, clean, wrap } = L;
  const sig = await L.doc.embedPng(Buffer.from(SIGNATURE_PNG_BASE64, 'base64'));

  const body = (gap: number) => {
    // Lays the body out with `gap` blank lines between paragraphs; returns
    // the baseline of the last line so a long letter can be tightened.
    const ops: (() => void)[] = [];
    let b = FIRST_BASE;
    const line = (text: string, x = M, f = font) => { const yy = b; ops.push(() => L.line(text, yy, x, f)); };
    line(clean(`Date: ${input.date}`, font));
    b += LH * (gap + 1);
    const labelled = (label: string, value: string) => {
      const lw2 = bold.widthOfTextAtSize(label + ' ', SIZE);
      line(label, M, bold);
      wrap(clean(value, font), font, SIZE, W, W - lw2).forEach((l, i) => { line(l, i === 0 ? M + lw2 : M); b += LH; });
    };
    labelled('Borrower Name(s):', input.borrowerName.trim());
    labelled('Subject Property Address:', input.propertyAddress.trim());
    b += LH * gap;
    const para = (t: string) => { for (const l of wrap(clean(t, font), font, SIZE, W)) { line(l); b += LH; } };
    para('Jay Capital Funding INC hereby transfers and releases the attached appraisal for the property noted above to:');
    b += LH * Math.min(gap, 1);
    para(input.mortgageeClause.split(/\r?\n/).map(l => l.trim()).filter(Boolean).join('\n'));
    b += LH * gap;
    para('Jay Capital Funding INC certifies that this appraisal was prepared in accordance with and meets all requirements of the Appraisal Independence Requirements (AIR), is USPAP compliant and is in compliance with the Truth in Lending regulations, and all applicable Federal, State and Local laws.');
    b += LH * gap;
    para('The transferring lender, appraisal management company (AMC), appraiser selection, ordering policy and process, and the appraiser complied with all AIR, Dodd Frank, FIRREA, and Consumer Protection Acts.');
    return { last: b - LH, ops };
  };
  // Two blank lines between paragraphs like the template. Tighter spacing is
  // tried only when needed; a letter that still will not fit on one page is
  // refused with a message rather than overlapping the footer.
  let laid = body(2);
  for (const g of [1, 0.5, 0]) if (laid.last + SIGNATURE_BLOCK > LAST_BASE_LIMIT) laid = body(g);
  if (laid.last + SIGNATURE_BLOCK > LAST_BASE_LIMIT) throw new LetterTooLongError('the mortgagee clause, address or borrower name');
  laid.ops.forEach(op => op());

  // ---- signature block, the same distance below the last paragraph as in
  // the template (its last line sits at 567.79; the line at 641.4).
  const B = laid.last - 567.79;
  page.drawImage(sig, { x: 74.25, y: top(647.37 + B), width: 132.9, height: 37.7 });
  page.drawLine({ start: { x: 72, y: top(641.4 + B) }, end: { x: 352.08, y: top(641.4 + B) }, thickness: 0.76, color: rgb(0, 0, 0) });
  L.line(SIGNER.name, 652.42 + B);
  L.line(SIGNER.title, 668.26 + B);

  return await L.save();
}
