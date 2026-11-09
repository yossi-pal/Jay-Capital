import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { LETTERHEAD_PNG_BASE64, WATERMARK_PNG_BASE64, SIGNATURE_PNG_BASE64 } from '@/lib/letter-assets';
import { LATO_REGULAR_BASE64, LATO_BOLD_BASE64 } from '@/lib/letter-fonts';

const NAVY = rgb(0x04 / 255, 0x16 / 255, 0x2a / 255);
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
  const font = await doc.embedFont(Buffer.from(LATO_REGULAR_BASE64, 'base64'), { subset: true });
  const bold = await doc.embedFont(Buffer.from(LATO_BOLD_BASE64, 'base64'), { subset: true });
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
  const SIZE = 11, LH = 15.8;
  const wrap = (s: string, f: PDFFont, size: number, maxW: number, firstW = maxW) => {
    const out: string[] = [];
    for (const para of s.split(/\r?\n/)) {
      let line = '';
      for (const w of para.split(/ +/)) {
        const t = line ? line + ' ' + w : w;
        const lim = out.length === 0 ? firstW : maxW;
        if (f.widthOfTextAtSize(t, size) > lim && line) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  };

  // ---- watermark, centred on the page like the template's
  const mh = 330, mw = mh * mark.width / mark.height;
  page.drawImage(mark, { x: (PW - mw) / 2, y: (PH - mh) / 2 - 40, width: mw, height: mh });

  // ---- letterhead
  const lh = 92, lw = lh * logo.width / logo.height;
  let y = PH - 40 - lh;
  page.drawImage(logo, { x: (PW - lw) / 2, y, width: lw, height: lh });
  y -= 16;
  page.drawRectangle({ x: M - 18, y, width: W + 36, height: 0.9, color: GOLD });

  // ---- title and date
  y -= 34;
  const title = 'Appraisal Transfer Letter';
  page.drawText(title, { x: (PW - bold.widthOfTextAtSize(title, 14)) / 2, y, size: 14, font: bold, color: NAVY });
  y -= 22;
  page.drawText(clean(`Date: ${input.date}`, font), { x: M, y, size: SIZE, font, color: INK });
  y -= LH * 2.4;

  // ---- borrower and property: bold label, plain value, wrapped under itself
  const labelled = (label: string, value: string) => {
    const lw2 = bold.widthOfTextAtSize(label + ' ', SIZE);
    page.drawText(label, { x: M, y, size: SIZE, font: bold, color: INK });
    const lines = wrap(clean(value, font), font, SIZE, W, W - lw2);
    lines.forEach((l, i) => {
      page.drawText(l, { x: i === 0 ? M + lw2 : M, y, size: SIZE, font, color: INK });
      y -= LH;
    });
  };
  labelled('Borrower Name(s):', input.borrowerName.trim());
  labelled('Subject Property Address:', input.propertyAddress.trim());
  y -= LH * 1.4;

  const para = (s: string, f = font) => {
    for (const l of wrap(clean(s, f), f, SIZE, W)) {
      page.drawText(l, { x: M, y, size: SIZE, font: f, color: INK });
      y -= LH;
    }
  };

  para('Jay Capital Funding INC hereby transfers and releases the attached appraisal for the property noted above to:');
  y -= LH * 0.6;
  const clause = input.mortgageeClause.split(/\r?\n/).map(l => l.trim()).filter(Boolean).join('\n');
  para(clause);
  y -= LH * 1.4;
  para('Jay Capital Funding INC certifies that this appraisal was prepared in accordance with and meets all requirements of the Appraisal Independence Requirements (AIR), is USPAP compliant and is in compliance with the Truth in Lending regulations, and all applicable Federal, State and Local laws.');
  y -= LH * 1.2;
  para('The transferring lender, appraisal management company (AMC), appraiser selection, ordering policy and process, and the appraiser complied with all AIR, Dodd Frank, FIRREA, and Consumer Protection Acts.');

  // ---- signature
  y -= LH * 1.6;
  const sh = 34, sw = sh * sig.width / sig.height;
  // The image has ~30% empty space below the ink, so it is drawn a little
  // below the line to make the handwriting sit on it, as signed by hand.
  y -= sh - 8;
  page.drawImage(sig, { x: M + 4, y: y - sh * 0.24, width: sw, height: sh });
  page.drawRectangle({ x: M, y, width: 280, height: 0.7, color: INK });
  y -= LH;
  page.drawText(SIGNER.name, { x: M, y, size: SIZE, font, color: INK });
  y -= LH;
  page.drawText(SIGNER.title, { x: M, y, size: SIZE, font, color: INK });

  // ---- footer, as in the template
  const tracked = (s: string, yy: number, size: number, track: number) => {
    const ch = [...s], ws = ch.map(c => font.widthOfTextAtSize(c, size));
    let x = (PW - (ws.reduce((a, b) => a + b, 0) + track * (ch.length - 1))) / 2;
    ch.forEach((c, i) => { page.drawText(c, { x, y: yy, size, font, color: MUTED }); x += ws[i] + track; });
  };
  page.drawRectangle({ x: M - 18, y: 66, width: W + 36, height: 0.9, color: GOLD });
  tracked('8 MURIN ST, SPRING VALLEY, NY 10977', 52, 6.5, 1.6);
  tracked('(845) 828-0731  |  INFO@JAYCAPITALFUNDING.COM  |  WWW.JAYCAPITALFUNDING.COM', 40, 6.5, 1.2);

  return await doc.save();
}
