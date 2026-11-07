// Generator obrazków Open Graph 1200x630: node tools/og.mjs [pl|en|dev|all]
// Podgląd raportu = zrzut żywej strony raportu (PL/EN) albo grafika pętli audyt→fix→recheck (dev).
import { chromium } from '/home/agent/projects/audit/node_modules/playwright/index.mjs';
import fs from 'node:fs';

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
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;overflow:hidden;background:#f6f8fb;font-family:Inter,"Segoe UI",system-ui,sans-serif;color:#0f172a;position:relative}
  .txt{position:absolute;left:72px;top:0;height:630px;width:600px;display:flex;flex-direction:column;justify-content:center;z-index:2}
  .logo{font-size:60px;font-weight:800;letter-spacing:-1.5px;margin-bottom:28px}.logo span{color:#2563eb}
  h1{font-size:${key==='dev'?50:50}px;line-height:1.08;font-weight:800;letter-spacing:-1px;margin:0 0 20px}
  .sub{font-size:24px;color:#475569;margin:0 0 14px}
  .price{font-size:${key==='dev'?19:21}px;font-weight:700;color:#2563eb;margin:0;${key==='dev'?'font-family:ui-monospace,Menlo,monospace;background:#0f172a;color:#e2e8f0;padding:12px 16px;border-radius:10px;display:inline-block;font-weight:500;':''}}
  .shot{position:absolute;left:690px;top:60px;width:${key==='dev'?560:540}px;height:${key==='dev'?335:600}px;border-radius:14px;overflow:hidden;box-shadow:0 30px 60px rgba(15,23,42,.22),0 0 0 1px rgba(15,23,42,.08);transform:rotate(-3deg);background:#fff;${key==='dev'?'top:140px;':''}}
  .shot img{width:100%;display:block}
  .badge{position:absolute;white-space:nowrap;left:700px;top:${key==='dev'?528:540}px;background:${key==='dev'?'#2563eb':'#0f172a'};color:#fff;font-size:21px;font-weight:600;padding:12px 24px;border-radius:999px;z-index:3;box-shadow:0 10px 24px rgba(15,23,42,.25)}
  </style></head><body>
  <div class="txt"><div class="logo">web<span>skan</span></div><h1>${v.title}</h1><p class="sub">${v.sub}</p><p class="price">${v.price}</p></div>
  <div class="shot"><img src="${dataUrl}"></div><div class="badge">${v.badge}</div>
  </body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: 'load' });
  await p.waitForTimeout(200);
  await p.screenshot({ path: v.out, type: 'png' });
  await ctx.close();
  console.log('ok', v.out);
}
await browser.close();
