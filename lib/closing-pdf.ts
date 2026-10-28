import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { MARK_PNG_BASE64, BRAND } from '@/lib/brand-assets';
import { money, pct, fmtDate, borrowerDisplayName } from '@/lib/format';
import { lenderLines, closingCostLines, type ClosingFigures } from '@/lib/closing-statement';

// Same palette and letterhead as the monthly statement PDF (lib/statement-pdf.ts).
const NAVY = rgb(0x04 / 255, 0x16 / 255, 0x2a / 255);
const NAVY_MED = rgb(0x0e / 255, 0x2a / 255, 0x47 / 255);
const GOLD = rgb(0xc0 / 255, 0x95 / 255, 0x4a / 255);
const INK = rgb(0.2, 0.2, 0.2);
const MUTED = rgb(0.42, 0.48, 0.56);
const SOFT = rgb(0xa8 / 255, 0xb6 / 255, 0xc9 / 255);
const PALE = rgb(0xed / 255, 0xf2 / 255, 0xf8 / 255);
const ROW_ALT = rgb(0xf5 / 255, 0xf8 / 255, 0xfb / 255);
const WHITE = rgb(1, 1, 1);

export interface ClosingPdfLoan {
  loan_number: string; property: string; annual_rate: number | string; closing_date: string;
  borrower_name: string; is_entity?: boolean | null; entity_name?: string | null;
  lender_name: string | null;
}

/**
 * The Closing Statement (every cost, to Total Closing Cost) or the Lender
 * Statement extracted from it (to Net Wire), on the company letterhead.
 * Internal documents: the route serving this is staff/admin only.
 */
export async function closingPDF(
  kind: 'closing' | 'lender', loan: ClosingPdfLoan, fig: ClosingFigures, notes: string | null,
): Promise<Uint8Array> {
  const lender = kind === 'lender';
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mark = await doc.embedPng(Buffer.from(MARK_PNG_BASE64, 'base64'));

  const PW = 612, PH = 792, M = 54;
  const MARK_RATIO = mark.width / mark.height;
  const pages = [] as ReturnType<typeof doc.addPage>[];
  const newPage = () => {
    const p = doc.addPage([PW, PH]);
    const wmH = 430, wmW = wmH * MARK_RATIO;
    p.drawImage(mark, { x: (PW - wmW) / 2, y: (PH - wmH) / 2, width: wmW, height: wmH, opacity: 0.05 });
    pages.push(p);
    return p;
  };
  let page = newPage();
  let y = 748;

  const text = (s: string, x: number, yy: number, size = 10, f = font, color = INK) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const rightText = (s: string, xRight: number, yy: number, size = 10, f = font, color = INK) =>
    page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color });
  const ensure = (need: number) => { if (y - need < 80) { page = newPage(); y = 748; } };
  const wrap = (s: string, size: number, maxW: number) => {
    const out: string[] = [];
    for (const para of String(s).split(/\r?\n/)) {
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
    const chars = [...str];
    const widths = chars.map(ch => f.widthOfTextAtSize(ch, size));
    const total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
    let x = cx - total / 2;
    chars.forEach((ch, i) => { page.drawText(ch, { x, y: yy, size, font: f, color }); x += widths[i] + track; });
    return total;
  };

  // ---- letterhead
  const cx = PW / 2;
  const markH = 26, markW = markH * MARK_RATIO;
  page.drawImage(mark, { x: cx - markW / 2, y: y - 8, width: markW, height: markH });
  y -= 22;
  tracked('JAY CAPITAL', cx, y, 10.5, bold, NAVY, 2.3);
  y -= 11;
  const fundW = tracked('FUNDING', cx, y, 6.5, bold, GOLD, 3.6);
  page.drawRectangle({ x: cx - fundW / 2 - 33, y: y + 2, width: 26, height: 0.7, color: GOLD });
  page.drawRectangle({ x: cx + fundW / 2 + 7, y: y + 2, width: 26, height: 0.7, color: GOLD });
  y -= 16;
  page.drawRectangle({ x: M, y: y - 2, width: PW - 2 * M, height: 1.6, color: GOLD });
  y -= 19;
  tracked(lender ? 'LENDER STATEMENT' : 'CLOSING STATEMENT', cx, y, 14, bold, NAVY, 1.4);
  y -= 26;

  // ---- borrower on the left, closing date on the right
  const topY = y;
  text(borrowerDisplayName(loan), M, y, 13, bold, NAVY); y -= 15;
  for (const l of wrap(loan.property || '', 10, 300)) { text(l, M, y, 10, font, MUTED); y -= 13; }
  if (loan.is_entity && loan.entity_name) { text(loan.borrower_name, M, y, 10, font, MUTED); y -= 13; }
  let ry = topY;
  rightText('Closing Date', PW - M, ry, 9, font, MUTED); ry -= 14;
  rightText(fmtDate(loan.closing_date), PW - M, ry, 11, bold, NAVY); ry -= 16;
  rightText(`Loan ${loan.loan_number}`, PW - M, ry, 9, font, MUTED); ry -= 12;
  y = Math.min(y, ry) - 18;

  // ---- loan details, two columns
  const GAP = 28, colW = (PW - 2 * M - GAP) / 2, ROW = 16;
  const left: [string, string][] = [
    ['Total Loan Amount', money(fig.loanAmount)],
    ['Acquisition', money(fig.acquisition)],
    ['Construction Holdback', money(fig.construction)],
  ];
  const right: [string, string][] = [
    ['Interest Rate', pct(loan.annual_rate)],
    ['Lender', loan.lender_name ?? ''],
    ['Servicer', BRAND.legal],
  ];
  const col = (rows: [string, string][], x: number, xr: number) => {
    let cy = y;
    for (const [k, v] of rows) {
      text(k, x, cy, 9.5, bold, NAVY);
      rightText(v, xr, cy, 9.5);
      page.drawLine({ start: { x, y: cy - 5 }, end: { x: xr, y: cy - 5 }, thickness: 0.5, color: SOFT });
      cy -= ROW;
    }
  };
  col(left, M, M + colW);
  col(right, M + colW + GAP, PW - M);
  y -= Math.max(left.length, right.length) * ROW + 16;

  // ---- line items
  const lines = lender ? lenderLines(fig) : closingCostLines(fig);
  const tableW = PW - 2 * M;
  page.drawRectangle({ x: M, y: y - 6, width: tableW, height: 22, color: NAVY_MED });
  text(lender ? 'FUNDING' : 'CLOSING COSTS', M + 10, y + 1, 9, bold, WHITE);
  rightText('AMOUNT', PW - M - 10, y + 1, 9, bold, WHITE);
  y -= 6;
  lines.forEach((l, i) => {
    const h = l.detail ? 32 : 22;
    ensure(h + 40);
    if (i % 2 === 0) page.drawRectangle({ x: M, y: y - h, width: tableW, height: h, color: ROW_ALT });
    if (i > 0) page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.4, color: SOFT });
    const base = y - 15;
    text(`${l.deduct ? 'Less: ' : ''}${l.label}`, M + 10, base, 10, font, INK);
    if (l.detail) text(l.detail, M + 10, base - 12, 8, font, MUTED);
    rightText(l.deduct ? `(${money(l.amount)})` : money(l.amount), PW - M - 10, base, 10, font, INK);
    y -= h;
  });
  ensure(40);
  page.drawRectangle({ x: M, y: y - 30, width: tableW, height: 30, color: PALE });
  page.drawRectangle({ x: M, y: y - 1.5, width: tableW, height: 1.5, color: GOLD });
  text(lender ? 'Net Wire' : 'Total Closing Cost', M + 10, y - 20, 12.5, bold, NAVY);
  rightText(money(lender ? fig.netWire : fig.totalClosingCost), PW - M - 10, y - 20, 12.5, bold, NAVY);
  y -= 50;

  // ---- notes
  if (notes && notes.trim()) {
    const nl = wrap(notes.trim(), 9.5, tableW - 24);
    const boxH = 26 + nl.length * 12.5;
    ensure(boxH + 10);
    page.drawRectangle({ x: M, y: y - boxH + 14, width: tableW, height: boxH, color: PALE });
    text('Notes', M + 12, y, 10.5, bold, NAVY);
    y -= 15;
    for (const l of nl) { text(l, M + 12, y, 9.5); y -= 12.5; }
  }

  // ---- footer on every page
  const askLine = `Questions? Call ${BRAND.phone} or email ${BRAND.email}`;
  const footLine = `${BRAND.legal}  ·  ${BRAND.address}`;
  pages.forEach((p, i) => {
    p.drawRectangle({ x: M, y: 64, width: PW - 2 * M, height: 0.8, color: GOLD });
    p.drawText(askLine, { x: (PW - font.widthOfTextAtSize(askLine, 7.5)) / 2, y: 52, size: 7.5, font, color: MUTED });
    p.drawText(footLine, { x: (PW - bold.widthOfTextAtSize(footLine, 7.5)) / 2, y: 39, size: 7.5, font: bold, color: NAVY });
    if (pages.length > 1) {
      const pn = `Page ${i + 1} of ${pages.length}`;
      p.drawText(pn, { x: PW - M - font.widthOfTextAtSize(pn, 7.5), y: 27, size: 7.5, font, color: MUTED });
    }
  });

  return await doc.save();
}
