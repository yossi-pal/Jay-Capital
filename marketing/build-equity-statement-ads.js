#!/usr/bin/env node
/*
 * "Your home has been saving for you" — home equity ads for print and WhatsApp.
 *
 * The idea: every ad shows a short equity statement (home value, minus what is
 * still owed, equals the equity built), styled like the statements our own
 * portal sends. One use of the money per ad.
 *
 * Produces, in marketing/out/equity-ads/:
 *   <name>-letter.pdf    8.5x11, for magazines / print shops
 *   <name>-letter.png    the same as an image
 *   <name>-whatsapp.png  1080x1350, WhatsApp status / Instagram
 *   all-ads-preview.png  every ad side by side
 *
 * Rebuild after a copy change:  node marketing/build-equity-statement-ads.js
 * Needs Playwright (Chromium). Fonts are bundled in marketing/fonts/.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out', 'equity-ads');
fs.mkdirSync(OUT, { recursive: true });

const NAVY = '#04162A', NAVY2 = '#0E2A47', GOLD = '#C0954A', CHAMP = '#E8C583';

const PHONE = '(845) 828-0731';
const SITE = 'jaycapitalfunding.com/heloc';
const FINE =
  'Example figures for illustration only. How much you can borrow depends on your home’s value, your existing mortgage and ' +
  'lender guidelines. A home equity line of credit is secured by your home. Subject to credit approval. ' +
  'Jay Capital Funding Inc. · 8 Murin Street, Spring Valley, NY 10977.';

// head: array of lines; wrap a word in *stars* to make it gold.
const ADS = [
  {
    name: 'tuition',
    head: ['Tuition season,', '*covered.*'],
    rows: [['Your home today', 875000], ['Still owed on the mortgage', -390000]],
    total: 485000,
    body: 'Draw what you need when the bills arrive, and pay interest only on what you use.',
  },
  {
    name: 'renovation',
    head: ['The kitchen you keep', '*putting off.*'],
    rows: [['Your home today', 1150000], ['Still owed on the mortgage', -520000]],
    total: 630000,
    body: 'Pay for the renovation from the house itself, and leave your savings where they are.',
  },
  {
    name: 'consolidate',
    head: ['One line of credit.', '*Not five card bills.*'],
    rows: [['Your home today', 720000], ['Still owed on the mortgage', -310000]],
    total: 410000,
    body: 'Bring what you owe together into a single line, with one payment to keep track of.',
  },
  {
    name: 'business',
    head: ['Business capital, from', 'what you *already own.*'],
    rows: [['Your home or investment property', 1400000], ['Still owed on the mortgage', -600000]],
    total: 800000,
    body: 'Inventory, a second location, a deal that will not wait. Draw on your equity on your schedule.',
  },
  {
    name: 'yiddish',
    rtl: true,
    eyebrow: 'דיין הויז האט געשפארט פאר דיר',
    head: ['שכר לימוד?', '*דיין הויז קען העלפן.*'],
    rows: [['דיין הויז היינט', 950000], ['וואס דו שולדיגסט נאך', -430000]],
    totalLabel: 'דיין עקוויטי',
    total: 520000,
    body: 'א ליין אוו קרעדיט: נעם ווען דו דארפסט, באצאל אינטערעסט נאר אויף וואס דו נוצט.',
  },
];

const b64 = f => fs.readFileSync(path.join(ROOT, f)).toString('base64');
const font = (fam, file, w) =>
  `@font-face{font-family:${fam};font-weight:${w};src:url(data:font/woff2;base64,${b64('fonts/' + file)}) format('woff2')}`;
const FONTS = [
  font('Lato', 'lato-latin-300-normal.woff2', 300),
  font('Lato', 'lato-latin-400-normal.woff2', 400),
  font('Lato', 'lato-latin-700-normal.woff2', 700),
  font('Cinzel', 'cinzel-latin-500-normal.woff2', 500),
  font('Cinzel', 'cinzel-latin-700-normal.woff2', 700),
  font('Heebo', 'heebo-hebrew-400-normal.woff2', 400),
  font('Heebo', 'heebo-hebrew-800-normal.woff2', 800),
].join('\n');

const LOGO = 'data:image/png;base64,' + b64('jcf-logo-horizontal-reverse-cropped.png');
const MARK = 'data:image/svg+xml;base64,' + b64('../public/logo-mark.svg');
const QR = 'data:image/svg+xml;base64,' + b64('heloc-qr.svg');

const money = n => (n < 0 ? '− ' : '') + '$' + Math.abs(n).toLocaleString('en-US');
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const gold = t => esc(t).replace(/\*(.+?)\*/g, '<em>$1</em>');

function page(ad, W, H) {
  const u = W / 816;
  const rtl = !!ad.rtl;
  const rows = ad.rows.map(([l, v]) =>
    `<div class="r"><span>${esc(l)}</span><span class="n">${money(v)}</span></div>`).join('');
  return `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:radial-gradient(120% 80% at 85% 0%,${NAVY2} 0%,${NAVY} 60%);color:#fff;font-family:Lato,Heebo,sans-serif;
  position:relative;display:flex;flex-direction:column;padding:${52 * u}px ${60 * u}px ${30 * u}px}
.frame{position:absolute;inset:${20 * u}px;border:${1 * u}px solid rgba(192,149,74,.45);pointer-events:none}
.mark{position:absolute;${rtl ? 'left' : 'right'}:${-40 * u}px;bottom:${150 * u}px;height:${560 * u}px;opacity:.07}
.top{display:flex;justify-content:space-between;align-items:center;direction:ltr}
.logo{width:${210 * u}px}
.tag{font-family:Cinzel;font-size:${11 * u}px;letter-spacing:${3 * u}px;color:${CHAMP}}
.mid{flex:1;display:flex;flex-direction:column;justify-content:center;position:relative}
.eyebrow{font-family:Cinzel;font-weight:500;font-size:${15 * u}px;letter-spacing:${4 * u}px;color:${GOLD};margin-bottom:${22 * u}px}
.rtl .eyebrow{font-family:Heebo;font-weight:800;letter-spacing:0;font-size:${20 * u}px}
h1{font-family:Cinzel;font-weight:500;font-size:${(rtl ? 64 : 52) * u}px;line-height:1.12;letter-spacing:${.5 * u}px}
h1 em{font-style:normal;color:${CHAMP}}
.rtl h1{font-family:Heebo;font-weight:800;line-height:1.1}
.card{margin-top:${42 * u}px;background:#fff;color:${NAVY};border-radius:${6 * u}px;padding:${26 * u}px ${30 * u}px ${24 * u}px;
  width:${470 * u}px;box-shadow:0 ${18 * u}px ${50 * u}px rgba(0,0,0,.35);border-top:${5 * u}px solid ${GOLD}}
.ch{display:flex;justify-content:space-between;font-size:${10.5 * u}px;letter-spacing:${2 * u}px;color:#6B7A90;font-weight:700;
  padding-bottom:${12 * u}px;border-bottom:${1 * u}px solid #DCE3EC;margin-bottom:${8 * u}px}
.r{display:flex;justify-content:space-between;font-size:${16 * u}px;padding:${8 * u}px 0;color:#2a3748}
.n{font-variant-numeric:tabular-nums;direction:ltr}
.t{display:flex;justify-content:space-between;align-items:baseline;margin-top:${8 * u}px;padding-top:${14 * u}px;border-top:${2 * u}px solid ${NAVY}}
.rtl .ch{letter-spacing:0;font-size:${13 * u}px}
.t span:first-child{font-size:${13 * u}px;letter-spacing:${2 * u}px;font-weight:700}
.rtl .t span:first-child{letter-spacing:0;font-size:${17 * u}px}
.t .n{font-family:Cinzel;font-weight:700;font-size:${38 * u}px;color:${GOLD}}
.body{margin-top:${30 * u}px;font-weight:300;font-size:${19 * u}px;line-height:1.5;color:rgba(255,255,255,.88);max-width:${560 * u}px}
.foot{display:flex;align-items:center;gap:${22 * u}px;padding-top:${20 * u}px;border-top:${1 * u}px solid rgba(192,149,74,.5);direction:ltr}
.qr{width:${84 * u}px;height:${84 * u}px;background:#fff;padding:${6 * u}px;border-radius:${4 * u}px}
.cta{flex:1}
.cta .a{font-family:Cinzel;font-size:${12 * u}px;letter-spacing:${2.5 * u}px;color:${CHAMP}}
.cta .p{font-size:${28 * u}px;font-weight:700;margin:${3 * u}px 0}
.cta .w{font-size:${15 * u}px;color:rgba(255,255,255,.8);letter-spacing:${.4 * u}px}
.promise{font-family:Cinzel;font-size:${12 * u}px;line-height:1.6;letter-spacing:${1.5 * u}px;color:rgba(255,255,255,.75);text-align:right;max-width:${210 * u}px}
.fine{margin-top:${14 * u}px;font-size:${7.6 * u}px;line-height:1.45;color:rgba(255,255,255,.45);direction:ltr;text-align:left}
</style></head><body>
<div class="frame"></div>
<img class="mark" src="${MARK}">
<div class="top"><img class="logo" src="${LOGO}"><div class="tag">HOME EQUITY LINES OF CREDIT</div></div>
<div class="mid ${rtl ? 'rtl' : ''}">
  <div class="eyebrow">${esc(ad.eyebrow || 'YOUR HOME HAS BEEN SAVING FOR YOU')}</div>
  <h1>${ad.head.map(gold).join('<br>')}</h1>
  <div class="card">
    <div class="ch"><span>${rtl ? 'עקוויטי סטעיטמענט' : 'EQUITY STATEMENT'}</span><span>${rtl ? 'ביישפיל' : 'EXAMPLE'}</span></div>
    ${rows}
    <div class="t"><span>${esc(ad.totalLabel || 'EQUITY YOU’VE BUILT')}</span><span class="n">${money(ad.total)}</span></div>
  </div>
  <div class="body">${esc(ad.body)}</div>
</div>
<div class="foot">
  <img class="qr" src="${QR}">
  <div class="cta"><div class="a">SEE WHAT YOURS COULD BE</div><div class="p">${PHONE}</div><div class="w">${SITE}</div></div>
  <div class="promise">One person with your file, from application to closing.</div>
</div>
<div class="fine">${FINE}</div>
</body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const shots = [];
  for (const ad of ADS) {
    for (const [kind, W, H, scale] of [['letter', 816, 1056, 1275 / 816], ['whatsapp', 1080, 1350, 1]]) {
      const html = page(ad, W, H);
      const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
      await p.setContent(html, { waitUntil: 'load' });
      await p.evaluate(() => document.fonts.ready);
      const png = path.join(OUT, `${ad.name}-${kind}.png`);
      await p.screenshot({ path: png });
      if (kind === 'letter') {
        await p.pdf({ path: path.join(OUT, `${ad.name}-letter.pdf`), width: '8.5in', height: '11in', printBackground: true, pageRanges: '1' });
        shots.push(png);
      }
      await p.close();
      console.log('  ', path.relative(ROOT, png));
    }
  }
  const imgs = shots.map(s => `<img style="width:400px;box-shadow:0 4px 18px rgba(0,0,0,.25)" src="data:image/png;base64,${fs.readFileSync(s).toString('base64')}">`).join('');
  const p = await browser.newPage({ viewport: { width: 2200, height: 600 } });
  await p.setContent(`<body style="margin:0;padding:24px;background:#DCE3EC;display:flex;gap:24px">${imgs}</body>`);
  await p.screenshot({ path: path.join(OUT, 'all-ads-preview.png'), fullPage: true });
  await browser.close();
  console.log('done ->', OUT);
})();
