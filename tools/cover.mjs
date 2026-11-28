// Okładki wpisów na kanały zewnętrzne (dev.to, Wykop) i awatar profilu, w stylu v5.
//   node tools/cover.mjs avatar <out.png>
//   node tools/cover.mjs <devto|wykop|og> <out.png> "<duża liczba albo hasło>" "<podpis>" ["<nadtytuł>"]
// devto = 1000x420 (cover_image), wykop = 1200x675 (załącznik wpisu), og = 1200x630.
// Liczby na okładce tylko takie, które są w tytule albo treści wpisu (te same, zweryfikowane).
import { chromium } from '/home/agent/projects/audit/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [kind, out, big, caption, kicker] = process.argv.slice(2);
const sizes = { avatar: [1000, 1000], devto: [1000, 420], wykop: [1200, 675], og: [1200, 630] };
if (!sizes[kind] || !out || (kind !== 'avatar' && (!big || !caption))) {
  console.error('użycie: cover.mjs avatar <out> | cover.mjs <devto|wykop|og> <out> "<liczba>" "<podpis>" ["<nadtytuł>"]');
  process.exit(1);
}
const [W, H] = sizes[kind];
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(root, 'public/fonts', f)).toString('base64');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const s = H / 630; // skala względem OG

let html;
if (kind === 'avatar') {
  // Znak z favicon.svg na pełnym tle (serwisy same przycinają do koła – znak mieści się w kole wpisanym).
  html = `<!doctype html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0E3B43"/><rect x="17" y="17" width="30" height="30" rx="7.5" fill="none" stroke="#E9B949" stroke-width="4.2"/><path d="M24.5 32h15" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/></svg></body>`;
} else {
  const bigSize = Math.round((big.length <= 6 ? 190 : big.length <= 9 ? 150 : big.length <= 14 ? 112 : 84) * s);
  html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:Bricolage;src:url(${font('bricolage.woff2')});font-weight:500 800;unicode-range:U+0000-00FF,U+2000-206F}
  @font-face{font-family:Bricolage;src:url(${font('bricolage-ext.woff2')});font-weight:500 800;unicode-range:U+0100-02BA}
  @font-face{font-family:Plex;src:url(${font('plexsans.woff2')});font-weight:400 600;unicode-range:U+0000-00FF,U+2000-206F,U+2192}
  @font-face{font-family:Plex;src:url(${font('plexsans-ext.woff2')});font-weight:400 600;unicode-range:U+0100-02BA}
  @font-face{font-family:PlexMono;src:url(${font('plexmono.woff2')});font-weight:500;unicode-range:U+0000-00FF,U+2000-206F}
  @font-face{font-family:PlexMono;src:url(${font('plexmono-ext.woff2')});font-weight:500;unicode-range:U+0100-02BA}
  *{box-sizing:border-box}
  body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#0E3B43 radial-gradient(90% 110% at 100% 0,rgba(233,185,73,.22),transparent 60%);font-family:Plex,system-ui,sans-serif;color:#EAF2F1;position:relative}
  .wrap{position:absolute;inset:0;padding:${44 * s}px ${72 * s}px ${40 * s}px;display:flex;flex-direction:column}
  .logo{display:flex;align-items:center;gap:${13 * s}px;font:700 ${38 * s}px/1 Bricolage;letter-spacing:-1px;color:#fff}.logo span{color:#E9B949}
  .logo i{width:${42 * s}px;height:${42 * s}px;border:${5.5 * s}px solid #E9B949;border-radius:${10 * s}px;background:linear-gradient(#fff,#fff) center/${21 * s}px ${5.5 * s}px no-repeat}
  .mid{flex:1;display:flex;flex-direction:column;justify-content:center}
  .kick{font:500 ${20 * s}px/1.3 PlexMono;letter-spacing:.08em;text-transform:uppercase;color:#9FC2BE;margin:0 0 ${10 * s}px}
  .big{font:800 ${bigSize}px/.95 Bricolage;letter-spacing:-.035em;color:#E9B949;margin:0 0 ${18 * s}px;white-space:nowrap}
  .cap{font:600 ${40 * s}px/1.18 Bricolage;letter-spacing:-.01em;color:#fff;margin:0;max-width:${W * 0.8}px;text-wrap:balance}
  .foot{font:500 ${19 * s}px PlexMono;color:#9FC2BE;display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,.16);padding-top:${16 * s}px}
  .deco{position:absolute;right:${-90 * s}px;bottom:${-110 * s}px;width:${430 * s}px;height:${430 * s}px;border:${46 * s}px solid rgba(233,185,73,.10);border-radius:${100 * s}px}
  .deco:after{content:"";position:absolute;left:22%;right:22%;top:50%;height:${46 * s}px;margin-top:${-23 * s}px;border-radius:99px;background:rgba(255,255,255,.07)}
  </style></head><body><div class="deco"></div><div class="wrap">
  <div class="logo"><i></i><div>web<span>skan</span></div></div>
  <div class="mid">${kicker ? `<p class="kick">${esc(kicker)}</p>` : ''}<p class="big">${esc(big)}</p><p class="cap">${esc(caption)}</p></div>
  <div class="foot"><span>webskan.com</span></div>
  </div></body></html>`;
}
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.setContent(html, { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
await p.screenshot({ path: out, type: 'png' });
await browser.close();
console.log('ok', out, `${W}x${H}`);
