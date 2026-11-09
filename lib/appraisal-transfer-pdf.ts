import { PDFDocument, rgb, setCharacterSpacing, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { LETTERHEAD_PNG_BASE64, WATERMARK_PNG_BASE64, SIGNATURE_PNG_BASE64 } from '@/lib/letter-assets';
import { LATO_REGULAR_BASE64, LATO_BOLD_BASE64 } from '@/lib/letter-fonts';

const GOLD = rgb(0xc0 / 255, 0x95 / 255, 0x4a / 255);
// Colours from the Word template: body text #1F2A37, footer #6B7A90.
const INK = rgb(0x1f / 255, 0x2a / 255, 0x37 / 255);
const MUTED = rgb(0x6b / 255, 0x7a / 255, 0x90 / 255);

export interface AppraisalTransferInput {
  borrowerName: string;
  propertyAddress: string;
  /** The new lender's mortgagee clause: name on the first line, address below. */
  mortgageeClause: string;
  /** Already formatted, e.g. "11/9/2026". */
  date: string;
}

export class LetterTooLongError extends Error {
  constructor() { super('The details are too long to fit the letter on one page. Please shorten the mortgagee clause, address or borrower name.'); }
}

export const SIGNER = { name: 'Solomon Grunhut', title: 'Vice President of Jay Capital Funding INC' };

/**
 * The Appraisal Transfer Letter, laid out like the company's Word template:
 * letterhead logo, watermark, the AIR certification wording and the Vice
 * President's signature. Nothing is stored; the PDF is built on request.
 */
export async function appraisalTransferPDF(input: AppraisalTransferInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Appraisal Transfer Letter');
  doc.setAuthor('Jay Capital Funding INC');
  // Lato, the Word template's font.
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(Buffer.from(LATO_REGULAR_BASE64, 'base64'), { subset: true, features: { liga: false, kern: false } });
  const bold = await doc.embedFont(Buffer.from(LATO_BOLD_BASE64, 'base64'), { subset: true, features: { liga: false, kern: false } });
  const known = new Set(font.getCharacterSet());
  const knownBold = new Set(bold.getCharacterSet());
  const logo = await doc.embedPng(Buffer.from(LETTERHEAD_PNG_BASE64, 'base64'));
  const mark = await doc.embedPng(Buffer.from(WATERMARK_PNG_BASE64, 'base64'));
  const sig = await doc.embedPng(Buffer.from(SIGNATURE_PNG_BASE64, 'base64'));

  const PW = 612, PH = 792, M = 72, W = PW - 2 * M;
  const page = doc.addPage([PW, PH]);

  // The embedded Lato carries Western European letters only. Swap anything
  // outside it (an emoji, a rare accent) for "?" so it never prints as a blank box.
  const clean = (s: string, f: PDFFont) => {
    const set = f === bold ? knownBold : known;
    return [...s.replace(/\t/g, ' ')].map(ch =>
      ch === '\n' || ch === '\r' || set.has(ch.codePointAt(0)!) ? ch : '?').join('');
  };

  // 11 pt with Word's 1.2 line spacing.
  const SIZE = 11.04, LH = 15.84;
  // Word snaps each letter to the screen's pixel grid, which packs its body
  // text about 0.0185 pt per letter tighter than the font's exact widths.
  // The same tightening makes lines match the Word letter, breaks included.
  const TC = -0.0185;
  const wrap = (s: string, f: PDFFont, size: number, maxW: number, firstW = maxW) => {
    const out: string[] = [];
    for (const para of s.split(/\r?\n/)) {
      let line = '';
      for (const w of para.split(/ +/)) {
        const t = line ? line + ' ' + w : w;
        const lim = out.length === 0 ? firstW : maxW;
        if (f.widthOfTextAtSize(t, size) + TC * t.length > lim && line) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  };

  // Every position below is measured from the Word template saved as PDF,
  // in points from the TOP of the page (as Word lays it out). top(n) turns
  // that into pdf-lib's bottom-up coordinate.
  const top = (n: number) => PH - n;

  // ---- watermark, logo and gold rule: fixed, exactly where the template has them
  page.drawImage(mark, { x: 196.15, y: top(561.57), width: 219.6, height: 331.17 });
  page.drawImage(logo, { x: 242.2, y: top(133.18), width: 127.6, height: 97.18 });
  page.drawRectangle({ x: 70.58, y: top(160.34), width: 470.95, height: 0.72, color: GOLD });

  // ---- text. Baselines step by one line (15.84 pt) per Word line; the blank
  // lines between paragraphs in the template are kept as whole empty lines.
  const title = 'Appraisal Transfer Letter';
  page.drawText(title, { x: (PW - bold.widthOfTextAtSize(title, 14.04)) / 2, y: top(202.1), size: 14.04, font: bold, color: INK });

  const body = (gap: number) => {
    // Lays the body out with `gap` blank lines between paragraphs; returns
    // the baseline of the last line so a long letter can be tightened.
    const ops: (() => void)[] = [];
    let b = 219.26;
    const line = (text: string, x = M, f = font) => { const yy = b; ops.push(() => page.drawText(text, { x, y: top(yy), size: SIZE, font: f, color: INK })); };
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
  // Two blank lines between paragraphs like the template.
  // Tighter spacing is tried only when needed; a letter that still will not
  // fit on one page is refused with a message rather than overlapping.
  let laid = body(2);
  for (const g of [1, 0.5, 0]) if (laid.last + 100.47 > 712) laid = body(g);
  if (laid.last + 100.47 > 712) throw new LetterTooLongError();
  page.pushOperators(setCharacterSpacing(TC));
  laid.ops.forEach(op => op());

  // ---- signature block, the same distance below the last paragraph as in
  // the template (its last line sits at 567.79; the line at 641.4).
  const B = laid.last - 567.79;
  page.drawImage(sig, { x: 74.25, y: top(647.37 + B), width: 132.9, height: 37.7 });
  page.drawLine({ start: { x: 72, y: top(641.4 + B) }, end: { x: 352.08, y: top(641.4 + B) }, thickness: 0.76, color: rgb(0, 0, 0) });
  page.drawText(SIGNER.name, { x: M, y: top(652.42 + B), size: SIZE, font, color: INK });
  page.drawText(SIGNER.title, { x: M, y: top(668.26 + B), size: SIZE, font, color: INK });
  page.pushOperators(setCharacterSpacing(0));

  // ---- footer: gold rule, then two lines of small capitals spaced 1.2 pt
  // apart, with gold separators, starting where the template's do.
  page.drawRectangle({ x: 70.58, y: top(726.46), width: 470.95, height: 0.72, color: GOLD });
  // Each footer word is placed where the template has it (left and right
  // edge), with its letters spread evenly across that width.
  const FS = 6.48;
  const word = (str: string, x0: number, x1: number, base: number, color = MUTED) => {
    const ch = [...str], ws = ch.map(c => font.widthOfTextAtSize(c, FS));
    const gap = ch.length > 1 ? (x1 - x0 - ws.reduce((a, b) => a + b, 0)) / (ch.length - 1) : 0;
    let x = x0;
    ch.forEach((c, i) => { page.drawText(c, { x, y: top(base), size: FS, font, color }); x += ws[i] + gap; });
  };
  const FOOTER: [string, number, number, number, typeof GOLD?][] = [
    ['8', 225.05, 228.81, 740.74], ['MURIN', 232.83, 259.24, 740.74], ['ST,', 263.27, 274.52, 740.74],
    ['SPRING', 278.69, 307.63, 740.74], ['VALLEY,', 311.63, 343.78, 740.74], ['NY', 347.83, 357.98, 740.74],
    ['10977', 362.09, 385.61, 740.74],
    ['(845)', 127.1, 146.56, 753.1], ['828-0731', 150.57, 187.84, 753.1], ['|', 194.06, 195.69, 753.1, GOLD],
    ['INFO@JAYCAPITALFUNDING.COM', 200.81, 335.93, 753.1], ['|', 342.31, 343.94, 753.1, GOLD],
    ['WWW.JAYCAPITALFUNDING.COM', 349.03, 483.52, 753.1],
  ];
  for (const [t, x0, x1, base, color] of FOOTER) word(t, x0, x1, base, color);

  return await doc.save();
}
