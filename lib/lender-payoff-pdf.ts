import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { MARK_PNG_BASE64, BRAND } from '@/lib/brand-assets';
import { money, pct, fmtDate, borrowerDisplayName } from '@/lib/format';
import { longDate, type LenderPayoffFigures } from '@/lib/payoff';

// Same palette and letterhead as the other statement PDFs.
const NAVY = rgb(0x04 / 255, 0x16 / 255, 0x2a / 255);
const NAVY_MED = rgb(0x0e / 255, 0x2a / 255, 0x47 / 255);
const GOLD = rgb(0xc0 / 255, 0x95 / 255, 0x4a / 255);
const INK = rgb(0.2, 0.2, 0.2);
const MUTED = rgb(0.42, 0.48, 0.56);
const SOFT = rgb(0xa8 / 255, 0xb6 / 255, 0xc9 / 255);
const PALE = rgb(0xed / 255, 0xf2 / 255, 0xf8 / 255);
const ROW_ALT = rgb(0xf5 / 255, 0xf8 / 255, 0xfb / 255);
const WHITE = rgb(1, 1, 1);

export interface LenderPayoffPdfLoan {
  loan_number: string; property: string; loan_amount: number | string; annual_rate: number | string;
  closing_date: string; borrower_name: string; is_entity?: boolean | null; entity_name?: string | null;
  lender_name: string | null;
}

/**
 * The Lender Payoff Statement on the company letterhead. Only what the
 * lender is owed: never the amount received or how it compares with the
 * payoff letter. Internal: the route serving it is staff/admin only.
 */
export async function lenderPayoffPDF(loan: LenderPayoffPdfLoan, fig: LenderPayoffFigures): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mark = await doc.embedPng(Buffer.from(MARK_PNG_BASE64, 'base64'));

  const PW = 612, PH = 792, M = 54, R = PW - M, W = PW - 2 * M;
  const MR = mark.width / mark.height;
  const page = doc.addPage([PW, PH]);
  page.drawImage(mark, { x: (PW - 430 * MR) / 2, y: (PH - 430) / 2, width: 430 * MR, height: 430, opacity: 0.05 });
  let y = 748;

  const text = (s: string, x: number, yy: number, size = 10, f = font, color = INK) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const rtext = (s: string, xr: number, yy: number, size = 10, f = font, color = INK) =>
    page.drawText(s, { x: xr - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color });
  const fit = (s: string, size: number, maxW: number, f = font) => {
    let t = s;
    if (f.widthOfTextAtSize(t, size) <= maxW) return t;
    while (t && f.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1);
    return t + '…';
  };
  const wrap = (s: string, size: number, maxW: number, f = font) => {
    const out: string[] = [];
    let line = '';
    for (const w of s.split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (f.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
    return out;
  };
  const tracked = (str: string, cx: number, yy: number, size: number, f: typeof font, color: any, track: number) => {
    const ch = [...str], ws = ch.map(c => f.widthOfTextAtSize(c, size));
    const tot = ws.reduce((a, b) => a + b, 0) + track * (ch.length - 1);
    let x = cx - tot / 2;
    ch.forEach((c, i) => { page.drawText(c, { x, y: yy, size, font: f, color }); x += ws[i] + track; });
    return tot;
  };
  const labelled = (label: string, value: string, yy: number) => {
    text(label, M, yy, 9.5, bold, NAVY);
    text(fit(value, 9.5, 330 - bold.widthOfTextAtSize(label, 9.5)), M + bold.widthOfTextAtSize(label, 9.5), yy, 9.5);
  };

  // ---- letterhead
  const cx = PW / 2;
  page.drawImage(mark, { x: cx - 13 * MR, y: y - 8, width: 26 * MR, height: 26 });
  y -= 22; tracked('JAY CAPITAL', cx, y, 10.5, bold, NAVY, 2.3);
  y -= 11; const fw = tracked('FUNDING', cx, y, 6.5, bold, GOLD, 3.6);
  page.drawRectangle({ x: cx - fw / 2 - 33, y: y + 2, width: 26, height: 0.7, color: GOLD });
  page.drawRectangle({ x: cx + fw / 2 + 7, y: y + 2, width: 26, height: 0.7, color: GOLD });
  y -= 16; page.drawRectangle({ x: M, y: y - 2, width: W, height: 1.6, color: GOLD });
  y -= 19; tracked('LENDER PAYOFF STATEMENT', cx, y, 14, bold, NAVY, 1.4);
  y -= 28;

  // ---- property, borrower, lender on the left; payoff date on the right
  const top = y;
  text('Property Address:', M, y, 8.5, font, MUTED); y -= 15;
  for (const l of wrap(loan.property || '', 12, 320, bold)) { text(l, M, y, 12, bold, NAVY); y -= 15; }
  labelled('Borrower: ', borrowerDisplayName(loan), y); y -= 13;
  labelled('Lender: ', loan.lender_name ?? '', y); y -= 13;
  let ry = top;
  rtext('Payoff Date', R, ry, 8.5, font, MUTED); ry -= 14;
  rtext(longDate(fig.payoffDate), R, ry, 10.5, bold, NAVY); ry -= 13;
  rtext(`Loan ${loan.loan_number}`, R, ry, 8.5, font, MUTED);
  y = Math.min(y, ry) - 22;

  const intro = `Payoff funds were received on ${longDate(fig.payoffDate)}. Below is the breakdown of the amounts due to the Lender.`;
  for (const l of wrap(intro, 11, W, bold)) { text(l, (PW - bold.widthOfTextAtSize(l, 11)) / 2, y, 11, bold, NAVY); y -= 15; }
  y -= 9;

  // ---- amounts
  page.drawRectangle({ x: M, y: y - 6, width: W, height: 22, color: NAVY_MED });
  text('DESCRIPTION', M + 10, y + 1, 9, bold, WHITE); rtext('AMOUNT', R - 10, y + 1, 9, bold, WHITE);
  y -= 6;
  fig.lines.forEach((l, i) => {
    const h = 24;
    if (i % 2 === 0) page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: ROW_ALT });
    if (i > 0) page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 0.4, color: SOFT });
    text(fit(l.label, 10.5, W - 150), M + 10, y - 16, 10.5);
    rtext(l.amount < 0 ? `(${money(-l.amount)})` : money(l.amount), R - 10, y - 16, 10.5);
    y -= h;
  });
  page.drawRectangle({ x: M, y: y - 32, width: W, height: 32, color: PALE });
  page.drawRectangle({ x: M, y: y - 1.5, width: W, height: 1.5, color: GOLD });
  text('TOTAL DUE TO LENDER', M + 10, y - 21, 12.5, bold, NAVY);
  rtext(money(fig.total), R - 10, y - 21, 13, bold, NAVY);
  y -= 60;

  // ---- loan details, full width in two columns
  page.drawRectangle({ x: M, y: y - 6, width: W, height: 22, color: NAVY_MED });
  text('LOAN DETAILS', M + 10, y + 1, 9, bold, WHITE);
  const GAP = 24, colW = (W - GAP) / 2;
  const cols: [string, string][][] = [
    [['Loan Amount', money(loan.loan_amount)], ['Interest Rate', pct(loan.annual_rate)], ['Closing Date', fmtDate(loan.closing_date)]],
    [['Interest Paid Through', fig.paidThrough < loan.closing_date ? 'Closing' : fmtDate(fig.paidThrough)],
     ['Payoff Date', fmtDate(fig.payoffDate)], ['Servicer', BRAND.legal]],
  ];
  cols.forEach((rows, c) => {
    const x = M + c * (colW + GAP);
    let dy = y - 24;
    for (const [k, v] of rows) {
      text(k, x + 10, dy, 9.5, bold, NAVY);
      rtext(v, x + colW - 10, dy, 9.5);
      page.drawLine({ start: { x, y: dy - 6 }, end: { x: x + colW, y: dy - 6 }, thickness: 0.5, color: SOFT });
      dy -= 17;
    }
  });

  // ---- footer
  const ask = `Questions? Call ${BRAND.phone} or email ${BRAND.email}`;
  const foot = `${BRAND.legal}  ·  ${BRAND.address}`;
  page.drawRectangle({ x: M, y: 64, width: W, height: 0.8, color: GOLD });
  page.drawText(ask, { x: (PW - font.widthOfTextAtSize(ask, 7.5)) / 2, y: 52, size: 7.5, font, color: MUTED });
  page.drawText(foot, { x: (PW - bold.widthOfTextAtSize(foot, 7.5)) / 2, y: 39, size: 7.5, font: bold, color: NAVY });

  return await doc.save();
}
