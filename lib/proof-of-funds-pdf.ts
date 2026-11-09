import {
  startLetter, LetterTooLongError, M, W, SIZE, LH, FIRST_BASE, LAST_BASE_LIMIT,
} from '@/lib/letterhead';

export { LetterTooLongError };

export interface ProofOfFundsInput {
  borrowerName: string;
  /** The property being bought, or "TBD" when it hasn't been chosen yet. */
  property: string;
  /** Already formatted, e.g. "$400,000". */
  purchasePrice: string;
  /** Already formatted, e.g. "Nov 09, 2026". */
  date: string;
}

export const POF_SIGNOFF = ['Yours Truly,', '', 'Joel Brull', 'Jay Capital Funding Inc.', 'Private Lender'];

/**
 * Proof of Funds letter on the company letterhead. Unsigned: it closes with
 * Joel Brull's name instead. Nothing is stored; the PDF is built on request.
 */
export async function proofOfFundsPDF(input: ProofOfFundsInput): Promise<Uint8Array> {
  const L = await startLetter('Proof of Funds');
  const { font, clean, wrap } = L;
  const name = input.borrowerName.trim();

  const body = (gap: number) => {
    const ops: (() => void)[] = [];
    let b = FIRST_BASE;
    const line = (text: string, x = M, f = font) => { const yy = b; ops.push(() => L.line(text, yy, x, f)); };
    const para = (t: string) => { for (const l of wrap(clean(t, font), font, SIZE, W)) { line(l); b += LH; } };
    line(clean(input.date, font));
    b += LH * (gap + 1);
    para(`Re: ${name}`);
    b += LH * gap;
    line('To Whom It May Concern,'); b += LH;
    b += LH * Math.min(gap, 1);
    para(`This is to inform you that Jay Capital Funding Inc. (private lender) has reviewed the information provided and is pleased to notify you that on behalf of ${name}, unencumbered liquid funds are available for the purchase of ${input.property.trim()} for the purchase price of ${input.purchasePrice}, as of the date of this letter subject to final underwriting.`);
    b += LH * Math.min(gap, 1);
    para('Should you have any questions, please feel free to contact us.');
    b += LH * gap;
    for (const s of POF_SIGNOFF) { if (s) line(s); b += LH; }
    return { last: b - LH, ops };
  };
  // Two blank lines between sections, tightened only if a long name or
  // address needs the room; refused with a message if it still won't fit.
  let laid = body(2);
  for (const g of [1, 0.5, 0]) if (laid.last > LAST_BASE_LIMIT) laid = body(g);
  if (laid.last > LAST_BASE_LIMIT) throw new LetterTooLongError('the borrower name or property');
  laid.ops.forEach(op => op());

  return await L.save();
}
