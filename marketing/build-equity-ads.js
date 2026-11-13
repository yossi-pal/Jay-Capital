#!/usr/bin/env node
/*
 * Typographic "I did it with my home equity" ads for print and WhatsApp.
 *
 * Produces, in marketing/out/ads/:
 *   <name>-letter.pdf    8.5x11, for magazines / print shops
 *   <name>-letter.png    the same as an image (150dpi)
 *   <name>-whatsapp.png  1080x1350, WhatsApp status / Instagram
 *   all-ads-preview.png  every ad side by side
 *
 * Rebuild after a copy change:  node marketing/build-equity-ads.js
 * Needs Playwright (Chromium). Fonts are bundled in marketing/fonts/.
 *
 * To change wording, edit ADS below. Each headline line is [text, colour].
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out', 'ads');
fs.mkdirSync(OUT, { recursive: true });

const NAVY = '#04162A', GOLD = '#C0954A', SLATE = '#6B7A90', PALE = '#EDF2F8';
const N = NAVY, G = GOLD;

const PHONE = '(845) 828-0731';
const EMAIL = 'INFO@JAYCAPITALFUNDING.COM';
const SITE = 'JAYCAPITALFUNDING.COM/HELOC';
const FINE =
  'Illustrative scenarios, not actual customers. All loans subject to credit approval, property valuation ' +
  'and lender guidelines; not every applicant will qualify. Jay Capital Funding Inc. · 8 Murin Street, Spring Valley, NY 10977.';

const ADS = [
  {
    name: 'business',
    head: [['I EXPANDED', G], ['MY', N], ['BUSINESS.', N]],
    sub: ['THE CAPITAL I NEEDED', 'WAS ALREADY SITTING', 'IN MY HOME.'],
  },
  {
    name: 'chasuna',
    head: [['I MARRIED', N], ['OFF MY', N], ['DAUGHTER.', G]],
    sub: ['MY HOME EQUITY PAID FOR THE CHASUNA.', 'MY CREDIT CARDS STAYED', 'IN MY WALLET.'],
  },
  {
    name: 'extension',
    head: [['I BUILT', G], ['THE', N], ['EXTENSION.', N]],
    sub: ['THE FAMILY GREW.', 'NOW THE HOUSE DID TOO.'],
  },
  {
    name: 'credit-cards',
    head: [['I PAID', N], ['OFF MY', N], ['CREDIT', G], ['CARDS.', G]],
    sub: ['ONE LINE OF CREDIT.', 'INTEREST ONLY ON WHAT I DRAW.'],
  },
  {
    name: 'yiddish',
    rtl: true,
    head: [['דאס געלט', N], ['ליגט שוין', G], ['אין דיין הויז.', G]],
    sub: ['א היים עקוויטי ליין אוו קרעדיט.', 'באצאל אינטערעסט נאר אויף וואס דו נוצט.'],
  },
];

const b64 = f => fs.readFileSync(path.join(ROOT, f)).toString('base64');
const font = (fam, file, w) =>
  `@font-face{font-family:${fam};font-weight:${w};src:url(data:font/woff2;base64,${b64('fonts/' + file)}) format('woff2')}`;
const FONTS = [
  font('Lato', 'lato-latin-300-normal.woff2', 300),
  font('Lato', 'lato-latin-400-normal.woff2', 400),
  font('Lato', 'lato-latin-700-normal.woff2', 700),
  font('Lato', 'lato-latin-900-normal.woff2', 900),
  font('Heebo', 'heebo-hebrew-400-normal.woff2', 400),
  font('Heebo', 'heebo-hebrew-800-normal.woff2', 800),
  font('Heebo', 'heebo-hebrew-900-normal.woff2', 900),
].join('\n');

const LOGO = 'data:image/png;base64,' + b64('jcf-logo-horizontal-cropped.png');
const MARK = 'data:image/svg+xml;base64,' + b64('../public/logo-mark.svg');
const QR = 'data:image/svg+xml;base64,' + b64('heloc-qr.svg');

function page(ad, W, H) {
  const u = W / 816; // design is drawn for an 816px-wide letter page
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const head = ad.head.map(([t, c]) => `<div class="hl" style="color:${c}">${esc(t)}</div>`).join('');
  const sub = ad.sub.map(t => `<div>${esc(t)}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;background:#fff;overflow:hidden}
body{font-family:Lato,Heebo,sans-serif;color:${NAVY};position:relative;display:flex;flex-direction:column}
.bgA{position:absolute;right:${-120 * u}px;top:${80 * u}px;width:${520 * u}px;height:${760 * u}px;
  background:linear-gradient(160deg,${PALE} 0%,rgba(237,242,248,0) 75%);transform:skewY(-28deg);opacity:.9}
.bgB{position:absolute;left:${-160 * u}px;top:${330 * u}px;width:${420 * u}px;height:${520 * u}px;
  background:linear-gradient(200deg,rgba(232,197,131,.16) 0%,rgba(232,197,131,0) 70%);transform:skewY(28deg)}
.mark{position:absolute;right:${36 * u}px;top:${40 * u}px;height:${300 * u}px;opacity:.05}
.side{position:absolute;left:${14 * u}px;top:${40 * u}px;writing-mode:vertical-rl;transform:rotate(180deg);
  font-size:${8 * u}px;letter-spacing:${1 * u}px;color:#B7C3D3}
.main{position:relative;flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;
  padding:${40 * u}px ${56 * u}px ${10 * u}px;text-align:center}
.hl{white-space:nowrap}
.head{font-weight:900;line-height:.9;letter-spacing:${-1 * u}px}
.rtl .head{font-family:Heebo;font-weight:900;line-height:1.02;letter-spacing:0}
.rtl{direction:rtl}
.sub{margin-top:${34 * u}px;font-weight:300;font-size:${30 * u}px;line-height:1.28;letter-spacing:${.5 * u}px;color:#1d2a3a}
.rtl .sub{font-family:Heebo;font-weight:400;font-size:${30 * u}px;letter-spacing:0}
.foot{position:relative;padding:0 ${56 * u}px ${26 * u}px}
.row{display:flex;align-items:center;gap:${22 * u}px;padding-top:${22 * u}px;border-top:${1.5 * u}px solid ${GOLD}}
.logo{width:${190 * u}px}
.div{width:${1 * u}px;align-self:stretch;background:#B7C3D3}
.contact{font-size:${12.5 * u}px;line-height:1.55;letter-spacing:${.6 * u}px;color:${NAVY};flex:none}
.contact b{font-size:${18 * u}px;font-weight:700;letter-spacing:${.3 * u}px}
.contact .go{color:${GOLD};font-weight:700;white-space:nowrap}
.pitch{font-size:${12.5 * u}px;line-height:1.4;color:#2a3748;flex:1;min-width:0}
.pitch b{white-space:nowrap}
.pitch b{display:block;font-size:${13.5 * u}px;letter-spacing:${.8 * u}px;color:${NAVY};margin-bottom:${3 * u}px}
.qr{width:${78 * u}px;height:${78 * u}px}
.pill{margin-top:${18 * u}px;border:${1.2 * u}px solid ${GOLD};border-radius:${40 * u}px;
  padding:${8 * u}px ${20 * u}px;font-size:${11 * u}px;letter-spacing:${1.4 * u}px;color:${NAVY};text-align:center;font-weight:700}
.pill span{color:${GOLD};margin:0 ${10 * u}px}
.fine{margin-top:${12 * u}px;font-size:${7.2 * u}px;color:#8C99AB;text-align:center;line-height:1.4}
</style></head><body>
<div class="bgA"></div><div class="bgB"></div>
<img class="mark" src="${MARK}">
<div class="main ${ad.rtl ? 'rtl' : ''}"><div class="head" id="head">${head}</div><div class="sub">${sub}</div></div>
<div class="foot">
  <div class="row">
    <img class="logo" src="${LOGO}">
    <div class="div"></div>
    <div class="contact"><b>${PHONE}</b><br>${EMAIL}<br>APPLY IN MINUTES:<br><span class="go">→ ${SITE}</span></div>
    <div class="pitch"><b>NEED CAPITAL?</b>Your home may already have it.</div>
    <img class="qr" src="${QR}">
  </div>
  <div class="pill">HOME EQUITY LINES OF CREDIT<span>›</span>ONE PERSON WITH YOUR FILE, START TO CLOSE</div>
  <div class="fine">${FINE}</div>
</div>
<script>
window.fit = () => {
// Grow the headline until its widest line, or the space it has, is full.
const head = document.getElementById('head'), main = head.parentElement;
const maxW = main.clientWidth - ${150 * u};
let lo = 20, hi = 400;
for (let i = 0; i < 30; i++) {
  const mid = (lo + hi) / 2; head.style.fontSize = mid + 'px';
  const wide = Math.max(...[...head.children].map(c => { c.style.display='inline-block'; const w=c.getBoundingClientRect().width; c.style.display='block'; return w; }));
  const fits = wide <= maxW && main.scrollHeight <= main.clientHeight;
  fits ? lo = mid : hi = mid;
}
head.style.fontSize = Math.min(lo, ${150 * u}) + 'px';
};
</script>
</body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const shots = [];
  for (const ad of ADS) {
    for (const [kind, W, H, scale] of [['letter', 816, 1056, 1275 / 816], ['whatsapp', 1080, 1350, 1]]) {
      const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
      await p.setContent(page(ad, W, H), { waitUntil: 'load' });
      await p.evaluate(async () => { await document.fonts.ready; window.fit(); });
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
  // contact sheet
  const imgs = shots.map(s => `<img src="data:image/png;base64,${fs.readFileSync(s).toString('base64')}">`).join('');
  const p = await browser.newPage({ viewport: { width: 2200, height: 600 } });
  await p.setContent(`<body style="margin:0;padding:24px;background:#DCE3EC;display:flex;gap:24px">${imgs.replace(/<img /g, '<img style="width:400px;box-shadow:0 4px 18px rgba(0,0,0,.18)" ')}</body>`);
  await p.screenshot({ path: path.join(OUT, 'all-ads-preview.png'), fullPage: true });
  await browser.close();
  console.log('done ->', OUT);
})();
