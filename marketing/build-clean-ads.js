#!/usr/bin/env node
/*
 * Clean, minimal home equity ads: white page, one gold line drawing,
 * one short sentence.
 *
 * Produces, in marketing/out/clean-ads/:
 *   <name>-letter.pdf    8.5x11, for magazines / print shops
 *   <name>-letter.png    the same as an image
 *   <name>-whatsapp.png  1080x1350, WhatsApp status / Instagram
 *   all-ads-preview.png  every ad side by side
 *
 * Rebuild after a copy change:  node marketing/build-clean-ads.js
 * Needs Playwright (Chromium). Fonts are bundled in marketing/fonts/.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out', 'clean-ads');
fs.mkdirSync(OUT, { recursive: true });

const NAVY = '#04162A', GOLD = '#C0954A', SLATE = '#6B7A90';
const PHONE = '(845) 828-0731';
const SITE = 'jaycapitalfunding.com/heloc';
const FINE =
  'A home equity line of credit is secured by your home. Subject to credit approval, property valuation and lender ' +
  'guidelines. Jay Capital Funding Inc. · 8 Murin Street, Spring Valley, NY 10977.';

// Fine line drawings, 120x120, stroked in gold.
const ICONS = {
  // wingback armchair
  chair: `<path d="M38 60V32q0-10 10-10h24q10 0 10 10v28"/><path d="M38 52q-14-2-14 10v16h16"/><path d="M82 52q14-2 14 10v16H80"/>
    <rect x="38" y="60" width="44" height="10" rx="3"/><path d="M40 70v8M80 70v8M24 78h72v6H24z"/><path d="M30 84l-2 10M90 84l2 10"/>
    <path d="M48 32q12 6 24 0" opacity=".55"/>`,
  // two-storey house front
  house: `<path d="M8 100h104"/><path d="M18 54 60 22l42 32"/><path d="M80 37V24h8v19"/><path d="M26 48v52h68V48"/>
    <path d="M52 100V80q8-8 16 0v20"/><circle cx="64" cy="90" r="1"/>
    <rect x="33" y="58" width="13" height="14"/><path d="M39.5 58v14M33 65h13"/>
    <rect x="74" y="58" width="13" height="14"/><path d="M80.5 58v14M74 65h13"/>
    <path d="M56 100l-6 12M64 100l6 12"/>`,
  // arched front door with fanlight
  door: `<path d="M34 104V44q0-24 26-24t26 24v60"/><path d="M40 104V46q0-18 20-18t20 18v58"/><path d="M40 46h40"/>
    <path d="M60 46V30M60 46 48 34M60 46l12-12"/><rect x="45" y="54" width="30" height="20" rx="1"/><rect x="45" y="80" width="30" height="18" rx="1"/>
    <circle cx="73" cy="77" r="1.6"/><path d="M26 104h68M22 110h76"/>`,
};

const ADS = [
  {
    name: 'sitting-on-it',
    icon: 'chair',
    head: 'You’re sitting on it.',
    sub: 'The equity in your home, available as a line of credit whenever you need it.',
  },
  {
    name: 'live-in-it',
    icon: 'house',
    head: 'Live in it.<br>Borrow from it.',
    sub: 'Keep your home and your first mortgage, and draw on the value you’ve built.',
  },
  {
    name: 'more-options',
    icon: 'door',
    head: 'Same house.<br>More options.',
    sub: 'Tuition, a renovation, a business opportunity. Draw what you need, and pay interest only on what you use.',
  },
  {
    name: 'yiddish',
    icon: 'chair',
    rtl: true,
    head: 'דו זיצט דערויף.',
    sub: 'די עקוויטי אין דיין הויז, אלס א ליין אוו קרעדיט ווען דו דארפסט עס.',
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
  font('Heebo', 'heebo-hebrew-400-normal.woff2', 400),
].join('\n');

const LOGO = 'data:image/png;base64,' + b64('jcf-logo-horizontal-cropped.png');
const QR = 'data:image/svg+xml;base64,' + b64('heloc-qr.svg');

function page(ad, W, H) {
  const u = W / 816;
  const rtl = !!ad.rtl;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#fff}
body{font-family:Lato,sans-serif;color:${NAVY};display:flex;flex-direction:column;padding:${64 * u}px ${80 * u}px ${36 * u}px}
.logo{width:${170 * u}px}
.mid{flex:1;display:flex;flex-direction:column;justify-content:center}
.rtl{direction:rtl;text-align:right}
.icon{width:${190 * u}px;height:${190 * u}px;margin-left:${-14 * u}px;fill:none;stroke:${GOLD};stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;margin-bottom:${44 * u}px}
h1{font-weight:300;font-size:${76 * u}px;line-height:1.08;letter-spacing:${-1.5 * u}px}
.rtl h1{font-family:Heebo;font-weight:400;letter-spacing:0;font-size:${84 * u}px}
.rule{width:${56 * u}px;height:${2 * u}px;background:${GOLD};margin:${36 * u}px 0 ${28 * u}px}
.sub{font-weight:300;font-size:${21 * u}px;line-height:1.55;color:${SLATE};max-width:${520 * u}px}
.rtl .sub{font-family:Heebo;font-weight:400}
.foot{display:flex;align-items:flex-end;justify-content:space-between;gap:${24 * u}px}
.k{font-family:Cinzel;font-size:${11 * u}px;letter-spacing:${3 * u}px;color:${GOLD};margin-bottom:${8 * u}px}
.p{font-size:${24 * u}px;font-weight:400;letter-spacing:${.5 * u}px}
.w{font-size:${15 * u}px;color:${SLATE};margin-top:${2 * u}px}
.qr{width:${76 * u}px;height:${76 * u}px}
.fine{margin-top:${22 * u}px;padding-top:${14 * u}px;border-top:${1 * u}px solid #E4EAF3;font-size:${7.6 * u}px;color:#9AA6B6;line-height:1.45}
</style></head><body>
<img class="logo" src="${LOGO}">
<div class="mid ${rtl ? 'rtl' : ''}">
  <svg class="icon" viewBox="0 0 120 120">${ICONS[ad.icon]}</svg>
  <h1>${ad.head}</h1>
  <div class="rule"></div>
  <div class="sub">${ad.sub}</div>
</div>
<div class="foot">
  <div><div class="k">HOME EQUITY LINES OF CREDIT</div><div class="p">${PHONE}</div><div class="w">${SITE}</div></div>
  <img class="qr" src="${QR}">
</div>
<div class="fine">${FINE}</div>
</body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const shots = [];
  for (const ad of ADS) {
    for (const [kind, W, H, scale] of [['letter', 816, 1056, 1275 / 816], ['whatsapp', 1080, 1350, 1]]) {
      const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
      await p.setContent(page(ad, W, H), { waitUntil: 'load' });
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
  const imgs = shots.map(s => `<img style="width:420px;box-shadow:0 4px 18px rgba(0,0,0,.14)" src="data:image/png;base64,${fs.readFileSync(s).toString('base64')}">`).join('');
  const p = await browser.newPage({ viewport: { width: 1900, height: 600 } });
  await p.setContent(`<body style="margin:0;padding:24px;background:#E4EAF3;display:flex;gap:24px">${imgs}</body>`);
  await p.screenshot({ path: path.join(OUT, 'all-ads-preview.png'), fullPage: true });
  await browser.close();
  console.log('done ->', OUT);
})();
