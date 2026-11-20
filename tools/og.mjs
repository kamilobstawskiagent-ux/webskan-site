// Generator obrazków Open Graph 1200x630: node tools/og.mjs [pl|en|dev|all]
// Podgląd raportu = zrzut żywej strony raportu (PL/EN) albo grafika pętli audyt→fix→recheck (dev).
import { chromium } from '/home/agent/projects/audit/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const variants = {
  pl: {
    out: 'public/og-pl.png', preview: 'https://webskan.com/przyklad/raport.html',
    title: 'Audyt strony WWW z listą konkretnych poprawek',
    sub: 'Szybkość · SEO · dostępność · bezpieczeństwo · linki',
    price: 'Audyt pogłębiony 249 zł · ponowne sprawdzenie po poprawkach · 30 dni Monitora w cenie',
    badge: 'Przykładowy raport · kamilobstawski.com',
  },
  en: {
    out: 'public/og-en.png', preview: 'https://webskan.com/en/sample/report.html',
    title: 'Website audit with a prioritised list of fixes',
    sub: 'Speed · SEO · accessibility · security · links',
    price: 'In-depth audit $69 · re-check after your fixes · 30 days of monitoring included',
    badge: 'Sample report · kamilobstawski.com',
  },
  dev: {
    out: 'public/og-dev.png', previewFile: 'docs/launch/ph-2-loop.png',
    title: 'Check the site your agent just shipped',
    sub: 'Remote MCP server · scan, whole-site audit, re-check with a diff',
    price: 'claude mcp add --transport http webskan https://webskan.com/mcp',
    badge: 'Free plan · no account · no key',
  },
};

const which = process.argv[2] || 'all';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
for (const [key, v] of Object.entries(variants)) {
  if (which !== 'all' && which !== key) continue;
  let dataUrl;
  if (v.preview) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1.5 });
    const p = await ctx.newPage();
    await p.goto(v.preview, { waitUntil: 'networkidle' });
    const buf = await p.screenshot({ type: 'png' });
    dataUrl = 'data:image/png;base64,' + buf.toString('base64');
    await ctx.close();
  } else {
    dataUrl = 'data:image/png;base64,' + fs.readFileSync(v.previewFile).toString('base64');
  }
  const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync('public/fonts/' + f).toString('base64');
  // Wygląd v5 (20.11): petrol + ochra, Bricolage / IBM Plex – jak strona.
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:Bricolage;src:url(${font('bricolage.woff2')});font-weight:500 800;unicode-range:U+0000-00FF,U+2000-206F}
  @font-face{font-family:Bricolage;src:url(${font('bricolage-ext.woff2')});font-weight:500 800;unicode-range:U+0100-02BA}
  @font-face{font-family:Plex;src:url(${font('plexsans.woff2')});font-weight:400 600;unicode-range:U+0000-00FF,U+2000-206F,U+2192}
  @font-face{font-family:Plex;src:url(${font('plexsans-ext.woff2')});font-weight:400 600;unicode-range:U+0100-02BA}
  @font-face{font-family:PlexMono;src:url(${font('plexmono.woff2')});font-weight:500;unicode-range:U+0000-00FF,U+2000-206F}
  @font-face{font-family:PlexMono;src:url(${font('plexmono-ext.woff2')});font-weight:500;unicode-range:U+0100-02BA}
  *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0E3B43 radial-gradient(90% 90% at 100% 0,rgba(233,185,73,.2),transparent 60%);font-family:Plex,system-ui,sans-serif;color:#EAF2F1;position:relative}
  .txt{position:absolute;left:72px;top:0;height:630px;width:590px;display:flex;flex-direction:column;justify-content:center;z-index:2}
  .logo{display:flex;align-items:center;gap:18px;font:700 54px/1 Bricolage;letter-spacing:-1.5px;margin-bottom:34px;color:#fff}.logo span{color:#E9B949}
  .logo i{width:58px;height:58px;border:7px solid #E9B949;border-radius:14px;background:linear-gradient(#fff,#fff) center/30px 7px no-repeat}
  h1{font:800 ${key === 'dev' ? 52 : 54}px/1.05 Bricolage;letter-spacing:-1.5px;margin:0 0 22px;color:#fff}
  .sub{font-size:24px;color:#CFE0DE;margin:0 0 20px;line-height:1.35}
  .price{font:500 ${key === 'dev' ? 17 : 19}px/1.45 PlexMono;color:#E9B949;margin:0;${key === 'dev' ? 'background:rgba(0,0,0,.3);color:#EAF2F1;padding:12px 16px;border-radius:10px;display:inline-block;white-space:nowrap;' : 'padding-top:18px;border-top:1px solid rgba(255,255,255,.18);'}}
  .shot{position:absolute;left:700px;top:64px;width:${key === 'dev' ? 560 : 520}px;height:${key === 'dev' ? 335 : 600}px;border-radius:14px;overflow:hidden;box-shadow:0 40px 70px -20px rgba(0,0,0,.6);transform:rotate(-3deg);background:#fff;${key === 'dev' ? 'top:140px;left:690px;' : ''}}
  .shot img{width:100%;display:block}
  .badge{position:absolute;white-space:nowrap;left:712px;top:${key === 'dev' ? 528 : 542}px;background:#E9B949;color:#0E3B43;font:500 19px PlexMono;padding:11px 18px;border-radius:8px;z-index:3;box-shadow:0 12px 26px rgba(0,0,0,.35)}
  </style></head><body>
  <div class="txt"><div class="logo"><i></i><div>web<span>skan</span></div></div><h1>${v.title}</h1><p class="sub">${v.sub}</p><p class="price">${v.price}</p></div>
  <div class="shot"><img src="${dataUrl}"></div><div class="badge">${v.badge}</div>
  </body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: v.out, type: 'png' });
  await ctx.close();
  console.log('ok', v.out);
  version(key, v.out);
}
await browser.close();

// Komunikatory i serwisy społecznościowe (Telegram, Facebook, LinkedIn) trzymają obrazek OG w pamięci
// podręcznej po ADRESIE obrazka, bez terminu ważności. Po zmianie treści obrazka adres musi się zmienić,
// inaczej nowe linki dalej pokazują starą grafikę (17.11: stare „99 zł” w podglądzie nowego wpisu, 10 dni
// po podmianie pliku). Dlatego: kopia pod nazwą z hashem treści + podmiana odwołań we wszystkich stronach.
// Plik bez hasha zostaje dla starych odwołań z zewnątrz.
function version(key, out) {
  const hash = crypto.createHash('sha1').update(fs.readFileSync(out)).digest('hex').slice(0, 8);
  const name = `og-${key}-${hash}.png`;
  for (const f of fs.readdirSync('public')) if (new RegExp(`^og-${key}-[0-9a-f]{8}\\.png$`).test(f) && f !== name) fs.unlinkSync(path.join('public', f));
  fs.copyFileSync(out, path.join('public', name));
  const re = new RegExp(`(https://webskan\\.com/)og-${key}(-[0-9a-f]{8})?\\.png`, 'g');
  let n = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (e.name.endsWith('.html')) { const a = fs.readFileSync(f, 'utf8'); const b = a.replace(re, `$1${name}`); if (a !== b) { fs.writeFileSync(f, b); n++; } }
  } };
  walk('public');
  console.log('versioned', name, 'refs updated in', n, 'files');
}
