import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { MARK_PNG_BASE64, BRAND } from '@/lib/brand-assets';
import { money, pct, fmtDate, borrowerDisplayName } from '@/lib/format';
import { longDate, type PayoffFigures } from '@/lib/payoff';

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

export interface PayoffPdfLoan {
  loan_number: string; property: string; loan_amount: number | string; annual_rate: number | string;
  closing_date: string; borrower_name: string; borrower_phone?: string | null; borrower_email?: string | null;
  is_entity?: boolean | null; entity_name?: string | null; lender_name: string | null;
}

/** The payoff letter on the company letterhead. Internal: the route serving it is staff/admin only. */
export async function payoffPDF(
  loan: PayoffPdfLoan, fig: PayoffFigures, wire: string, issuedOn: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);
  const mark = await doc.embedPng(Buffer.from(MARK_PNG_BASE64, 'base64'));

  const PW = 612, PH = 792, M = 54, R = PW - M, W = PW - 2 * M;
  const MR = mark.width / mark.height;
  const pages = [] as ReturnType<typeof doc.addPage>[];
  const newPage = () => {
    const p = doc.addPage([PW, PH]);
    p.drawImage(mark, { x: (PW - 430 * MR) / 2, y: (PH - 430) / 2, width: 430 * MR, height: 430, opacity: 0.05 });
    pages.push(p);
    return p;
  };
  let page = newPage();
  let y = 748;
  const ensure = (need: number) => { if (y - need < 72) { page = newPage(); y = 748; } };

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
  const wrap = (s: string, size: number, maxW: number) => {
    const out: string[] = [];
    for (const para of s.split(/\r?\n/)) {
      let line = '';
      for (const w of para.split(' ')) {
        const t = line ? line + ' ' + w : w;
        if (font.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  };
  const tracked = (str: string, cx: number, yy: number, size: number, f: typeof font, color: any, track: number) => {
    const ch = [...str], ws = ch.map(c => f.widthOfTextAtSize(c, size));
    const tot = ws.reduce((a, b) => a + b, 0) + track * (ch.length - 1);
    let x = cx - tot / 2;
    ch.forEach((c, i) => { page.drawText(c, { x, y: yy, size, font: f, color }); x += ws[i] + track; });
    return tot;
  };

  // ---- letterhead
  const cx = PW / 2;
  page.drawImage(mark, { x: cx - 13 * MR, y: y - 8, width: 26 * MR, height: 26 });
  y -= 22; tracked('JAY CAPITAL', cx, y, 10.5, bold, NAVY, 2.3);
  y -= 11; const fw = tracked('FUNDING', cx, y, 6.5, bold, GOLD, 3.6);
  page.drawRectangle({ x: cx - fw / 2 - 33, y: y + 2, width: 26, height: 0.7, color: GOLD });
  page.drawRectangle({ x: cx + fw / 2 + 7, y: y + 2, width: 26, height: 0.7, color: GOLD });
  y -= 16; page.drawRectangle({ x: M, y: y - 2, width: W, height: 1.6, color: GOLD });
  y -= 19; tracked('PAYOFF LETTER', cx, y, 14, bold, NAVY, 1.4);
  y -= 28;

  // ---- property and borrower on the left, date issued on the right
  const top = y;
  text('Property Address:', M, y, 8.5, font, MUTED); y -= 15;
  for (const l of wrap(loan.property || '', 12, 320)) { text(l, M, y, 12, bold, NAVY); y -= 15; }
  text('Borrower: ', M, y, 9.5, bold, NAVY);
  text(borrowerDisplayName(loan), M + bold.widthOfTextAtSize('Borrower: ', 9.5), y, 9.5);
  y -= 13;
  const entity = loan.is_entity && loan.entity_name;
  const contact = [entity ? loan.borrower_name : '', loan.borrower_phone, loan.borrower_email].filter(Boolean).join('  ·  ');
  if (contact) { text(fit(contact, 9.5, 340), M, y, 9.5, font, MUTED); y -= 13; }
  let ry = top;
  rtext('Date Issued', R, ry, 8.5, font, MUTED); ry -= 14;
  rtext(longDate(issuedOn), R, ry, 10.5, bold, NAVY); ry -= 13;
  rtext(`Loan ${loan.loan_number}`, R, ry, 8.5, font, MUTED);
  y = Math.min(y, ry) - 22;

  const auth = 'You are authorized to use the following amounts to payoff the above – mentioned loan.';
  text(auth, (PW - bold.widthOfTextAtSize(auth, 11.5)) / 2, y, 11.5, bold, NAVY);
  y -= 24;

  // ---- amounts
  page.drawRectangle({ x: M, y: y - 6, width: W, height: 22, color: NAVY_MED });
  text('DESCRIPTION', M + 10, y + 1, 9, bold, WHITE); rtext('AMOUNT', R - 10, y + 1, 9, bold, WHITE);
  y -= 6;
  fig.lines.forEach((l, i) => {
    ensure(70);
    const h = 22;
    if (i % 2 === 0) page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: ROW_ALT });
    if (i > 0) page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 0.4, color: SOFT });
    text(fit(l.label, 10.5, W - 150), M + 10, y - 15, 10.5);
    rtext(l.amount < 0 ? `(${money(-l.amount)})` : money(l.amount), R - 10, y - 15, 10.5);
    y -= h;
  });
  ensure(60);
  page.drawRectangle({ x: M, y: y - 32, width: W, height: 32, color: PALE });
  page.drawRectangle({ x: M, y: y - 1.5, width: W, height: 1.5, color: GOLD });
  text('TOTAL PAYOFF AMOUNT DUE', M + 10, y - 21, 12.5, bold, NAVY);
  rtext(money(fig.total), R - 10, y - 21, 13, bold, NAVY);
  y -= 46;
  rtext(`Please add ${money(fig.perDiem)} for each additional day past ${fmtDate(fig.through)}.`, R, y, 10, bold, NAVY);
  y -= 24;

  // ---- loan details and wire instructions, side by side
  const GAP = 20, colW = (W - GAP) / 2, wx = M + colW + GAP;
  const details: [string, string][] = [
    ['Loan Amount', money(loan.loan_amount)],
    ['Interest Rate', pct(loan.annual_rate)],
    ['Closing Date', fmtDate(loan.closing_date)],
    ['Lender', loan.lender_name ?? ''],
    ['Interest Paid Through', fig.paidThrough < loan.closing_date ? 'Closing' : fmtDate(fig.paidThrough)],
    ['Servicer', BRAND.legal],
  ];
  const wireLines = wrap(wire, 9.5, colW - 20);
  const panelH = Math.max(details.length * 16, wireLines.length * 12) + 8;
  ensure(panelH + 40);
  const barTop = y;
  for (const [title, x] of [['LOAN DETAILS', M], ['FUNDS SHOULD BE WIRED TO', wx]] as const) {
    page.drawRectangle({ x, y: barTop - 6, width: colW, height: 22, color: NAVY_MED });
    text(title, x + 10, barTop + 1, 9, bold, WHITE);
  }
  page.drawRectangle({ x: wx, y: barTop - 6 - panelH, width: colW, height: panelH, color: PALE });
  let dy = barTop - 22;
  for (const [k, v] of details) {
    text(k, M + 10, dy, 9.5, bold, NAVY);
    rtext(fit(v, 9.5, colW - 130), M + colW - 10, dy, 9.5);
    page.drawLine({ start: { x: M, y: dy - 6 }, end: { x: M + colW, y: dy - 6 }, thickness: 0.5, color: SOFT });
    dy -= 16;
  }
  let wy = barTop - 22;
  for (const l of wireLines) { text(l, wx + 10, wy, 9.5); wy -= 12; }
  y = barTop - 6 - panelH - 25;

  // ---- terms and signature
  ensure(76);
  page.drawRectangle({ x: M, y: y + 13, width: W, height: 0.6, color: SOFT });
  const terms = `This Payoff Letter is valid until 4:00 PM ET on ${longDate(fig.validUntil)}. By issuing this Payoff Letter, Lender is not waiving any of its rights under any of the loan documents.`;
  for (const l of wrap(terms, 9.5, W)) { text(l, M, y, 9.5); y -= 13; }
  y -= 12;
  text('Sincerely,', M, y, 10.5); y -= 16;
  text(BRAND.legal, M, y, 11, bold, NAVY); y -= 13;
  text(fit(`Loan Servicer, on behalf of ${loan.lender_name || 'the Lender'}`, 9.5, W, ital), M, y, 9.5, ital, MUTED);

  // ---- footer on every page
  const ask = `Questions? Call ${BRAND.phone} or email ${BRAND.email}`;
  const foot = `${BRAND.legal}  ·  ${BRAND.address}`;
  pages.forEach((p, i) => {
    p.drawRectangle({ x: M, y: 64, width: W, height: 0.8, color: GOLD });
    p.drawText(ask, { x: (PW - font.widthOfTextAtSize(ask, 7.5)) / 2, y: 52, size: 7.5, font, color: MUTED });
    p.drawText(foot, { x: (PW - bold.widthOfTextAtSize(foot, 7.5)) / 2, y: 39, size: 7.5, font: bold, color: NAVY });
    if (pages.length > 1) {
      const pn = `Page ${i + 1} of ${pages.length}`;
      p.drawText(pn, { x: R - font.widthOfTextAtSize(pn, 7.5), y: 27, size: 7.5, font, color: MUTED });
    }
  });

  return await doc.save();
}
