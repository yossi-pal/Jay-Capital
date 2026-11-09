import { PDFDocument, rgb, setCharacterSpacing, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { LETTERHEAD_PNG_BASE64, WATERMARK_PNG_BASE64 } from '@/lib/letter-assets';
import { LATO_REGULAR_BASE64, LATO_BOLD_BASE64 } from '@/lib/letter-fonts';

/**
 * The company letterhead shared by every letter in the Documents section,
 * matched to the Word template saved as PDF: Lato, the logo, the watermark,
 * the gold rules, the title and the footer.
 *
 * Positions are in points from the TOP of the page, as Word lays it out;
 * top(n) turns that into pdf-lib's bottom-up coordinate.
 */

export const GOLD = rgb(0xc0 / 255, 0x95 / 255, 0x4a / 255);
// Colours from the Word template: body text #1F2A37, footer #6B7A90.
export const INK = rgb(0x1f / 255, 0x2a / 255, 0x37 / 255);
export const MUTED = rgb(0x6b / 255, 0x7a / 255, 0x90 / 255);

export const PW = 612, PH = 792, M = 72, W = PW - 2 * M;
/** 11 pt with Word's 1.2 line spacing. */
export const SIZE = 11.04, LH = 15.84;
/** Baseline of the title, and of the first body line under it. */
export const TITLE_BASE = 202.1, FIRST_BASE = 219.26;
/** The last body baseline that still clears the footer. */
export const LAST_BASE_LIMIT = 712;
/**
 * Word snaps each letter to the screen's pixel grid, which packs its body
 * text about 0.0185 pt per letter tighter than the font's exact widths.
 * The same tightening makes lines match the Word letter, breaks included.
 */
const TC = -0.0185;

export const top = (n: number) => PH - n;

export class LetterTooLongError extends Error {
  constructor(what: string) { super(`The details are too long to fit the letter on one page. Please shorten ${what}.`); }
}

export interface Letter {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  /** Swaps characters the embedded font lacks for "?" (never a blank box). */
  clean: (s: string, f: PDFFont) => string;
  /** Word-style line breaking; `firstW` is the room on the first line. */
  wrap: (s: string, f: PDFFont, size: number, maxW: number, firstW?: number) => string[];
  /** Draws a body line (11 pt) with its baseline `base` points from the top. */
  line: (text: string, base: number, x?: number, f?: PDFFont) => void;
  save: () => Promise<Uint8Array>;
}

/** A one-page letter with the letterhead, watermark, title and footer drawn. */
export async function startLetter(title: string): Promise<Letter> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor('Jay Capital Funding Inc.');
  doc.registerFontkit(fontkit);
  const opts = { subset: true, features: { liga: false, kern: false } };
  const font = await doc.embedFont(Buffer.from(LATO_REGULAR_BASE64, 'base64'), opts);
  const bold = await doc.embedFont(Buffer.from(LATO_BOLD_BASE64, 'base64'), opts);
  const known = new Set(font.getCharacterSet());
  const knownBold = new Set(bold.getCharacterSet());
  const logo = await doc.embedPng(Buffer.from(LETTERHEAD_PNG_BASE64, 'base64'));
  const mark = await doc.embedPng(Buffer.from(WATERMARK_PNG_BASE64, 'base64'));
  const page = doc.addPage([PW, PH]);

  const clean = (s: string, f: PDFFont) => {
    const set = f === bold ? knownBold : known;
    return [...s.replace(/\t/g, ' ')].map(ch =>
      ch === '\n' || ch === '\r' || set.has(ch.codePointAt(0)!) ? ch : '?').join('');
  };

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

  // ---- watermark, logo and gold rule
  page.drawImage(mark, { x: 196.15, y: top(561.57), width: 219.6, height: 331.17 });
  page.drawImage(logo, { x: 242.2, y: top(133.18), width: 127.6, height: 97.18 });
  page.drawRectangle({ x: 70.58, y: top(160.34), width: 470.95, height: 0.72, color: GOLD });

  // ---- title, centred
  page.drawText(title, { x: (PW - bold.widthOfTextAtSize(title, 14.04)) / 2, y: top(TITLE_BASE), size: 14.04, font: bold, color: INK });

  // ---- footer: gold rule, then two lines of small capitals with gold
  // separators. Each word sits where the template has it (left and right
  // edge), its letters spread evenly across that width.
  page.drawRectangle({ x: 70.58, y: top(726.46), width: 470.95, height: 0.72, color: GOLD });
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

  // Body text is drawn with Word's tighter letter spacing; the footer above
  // is already placed, so switching it on now affects only the body.
  page.pushOperators(setCharacterSpacing(TC));
  const line = (text: string, base: number, x = M, f = font) =>
    page.drawText(text, { x, y: top(base), size: SIZE, font: f, color: INK });

  return { doc, page, font, bold, clean, wrap, line, save: () => doc.save() };
}
