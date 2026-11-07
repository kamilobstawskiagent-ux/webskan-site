import { chromium } from '/home/agent/projects/audit/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); 
const ctx = await b.newContext({ viewport: { width: 1270, height: 760 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto('https://webskan.com/developers/', { waitUntil: 'networkidle' });
await p.evaluate(() => { const h=[...document.querySelectorAll('h2')].find(e=>/Why not/.test(e.textContent)); if(h) h.style.marginTop='300px'; });
await p.screenshot({ path: '/home/agent/tmp/ph/1-developers.png' });
await p.goto('https://webskan.com/developers/#tools', { waitUntil: 'networkidle' });
await p.evaluate(() => { const t=document.querySelector('#tools'); if(t) t.scrollIntoView(); window.scrollBy(0,-24); });
await p.waitForTimeout(300);
await p.screenshot({ path: '/home/agent/tmp/ph/3-sample.png' });
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#0f172a;color:#e2e8f0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;height:760px;width:1270px;overflow:hidden}
.wrap{padding:52px 60px}.h{font-family:Inter,system-ui,sans-serif;font-size:36px;font-weight:700;color:#fff;margin:0 0 6px}
.sub{font-family:Inter,system-ui,sans-serif;color:#94a3b8;font-size:19px;margin:0 0 30px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:28px}.box{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px 22px;font-size:18px;line-height:1.6;min-height:470px;white-space:pre}
.t{color:#7dd3fc;font-size:13px;margin-bottom:10px;font-family:Inter,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.08em}
.k{color:#c4b5fd}.s{color:#fde68a}.ok{color:#86efac}.warn{color:#fca5a5}.dim{color:#64748b}
</style></head><body><div class="wrap">
<p class="h">audit_website → fix → recheck_website</p>
<p class="sub">Stable finding ids, so the agent knows exactly what it fixed. Lighthouse scores reported separately, never counted as “fixed” on their own.</p>
<div class="cols"><div class="box"><div class="t">audit_website · one finding of 23</div>{
  <span class="k">"id"</span>: <span class="s">"seo.title.duplicate"</span>,
  <span class="k">"severity"</span>: <span class="s">"medium"</span>,
  <span class="k">"title"</span>: <span class="s">"Same &lt;title&gt; on 6 pages"</span>,
  <span class="k">"area"</span>: <span class="s">"seo"</span>,
  <span class="k">"detail"</span>: <span class="s">"“Example – Home” – search engines
    cannot tell which page to show.
    Give every page its own title."</span>,
  <span class="k">"pages"</span>: [<span class="s">"/"</span>, <span class="s">"/pricing"</span>, <span class="s">"/about"</span>,
    <span class="s">"/blog"</span>, <span class="s">"/blog/hello"</span>, <span class="s">"/contact"</span>]
}</div>
<div class="box"><div class="t">recheck_website · diff after the fix</div><span class="ok">✔ fixed (5)</span>
  seo.title.duplicate
  seo.description.missing
  links.internal.broken
  security.headers.hsts
  a11y.image.alt

<span class="warn">● still open (2)</span>
  perf.image.oversized   <span class="dim">/ hero.jpg 3.9 MB</span>
  a11y.contrast.low      <span class="dim">/ .muted 3.1:1</span>

<span class="s">＋ new (1)</span>
  seo.canonical.mismatch <span class="dim">/plans → /pricing</span>

<span class="dim">could not verify (0)</span></div></div>
</div></body></html>`;
await p.setContent(html);
await p.screenshot({ path: '/home/agent/tmp/ph/2-loop.png' });
await b.close();
