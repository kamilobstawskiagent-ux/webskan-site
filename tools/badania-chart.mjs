// Wykres zbiorczy do /badania/ (PNG 1200×1200, do wklejenia np. na LinkedIn).
// Dane: tools/badania-chart.json  →  node tools/badania-chart.mjs
import { chromium } from '/home/agent/projects/audit/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync(new URL('./badania-chart.json', import.meta.url), 'utf8'));
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(new URL('../public/fonts/' + f, import.meta.url)).toString('base64');
const rows = cfg.rows.map((r) => `<div class="row"><div class="lab">${r.label}<small>${r.sample}</small></div><div class="track"><i style="width:${r.value}%"></i></div><b>${r.text}</b></div>`).join('');
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:B;src:url(${font('bricolage.woff2')});font-weight:500 800;unicode-range:U+0000-00FF,U+2013,U+201D,U+201E}
@font-face{font-family:B;src:url(${font('bricolage-ext.woff2')});font-weight:500 800;unicode-range:U+0100-02BA}
@font-face{font-family:P;src:url(${font('plexsans.woff2')});font-weight:400 600;unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:P;src:url(${font('plexsans-ext.woff2')});font-weight:400 600;unicode-range:U+0100-02BA}
@font-face{font-family:M;src:url(${font('plexmono.woff2')});font-weight:500;unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:M;src:url(${font('plexmono-ext.woff2')});font-weight:500;unicode-range:U+0100-02BA}
*{box-sizing:border-box;margin:0}body{width:1200px;height:1200px;background:#F3F5F4;font-family:P,sans-serif;color:#14262A;display:flex;flex-direction:column}
.top{background:#0E3B43;color:#fff;padding:44px 72px 36px}
.eb{font:500 21px M;letter-spacing:.1em;text-transform:uppercase;color:#F3D27F;margin-bottom:18px}
h1{font:700 50px/1.08 B;letter-spacing:-.02em}
.body{flex:1;padding:30px 72px 0;gap:14px;display:flex;flex-direction:column;justify-content:space-evenly}
.row{display:grid;grid-template-columns:1fr 190px;column-gap:24px;row-gap:7px;align-items:end}
.lab{font:500 26px/1.2 P}.lab small{display:block;font:500 17px/1.3 M;color:#4F6266;margin-top:3px}
.row b{font:600 44px/1 M;white-space:nowrap;color:#14262A;text-align:right;grid-row:1 / span 2;grid-column:2;align-self:center}
.track{height:14px;border-radius:4px;background:#DDE5E3;overflow:hidden}.track i{display:block;height:100%;background:#13696B;border-radius:4px}
.foot{padding:26px 72px 40px;display:flex;justify-content:space-between;align-items:baseline;font:500 19px M;color:#4F6266}
.logo{font:700 34px B;color:#0E3B43;letter-spacing:-.02em}.logo span{color:#13696B}
</style><div class="top"><div class="eb">${cfg.eyebrow}</div><h1>${cfg.title}</h1></div><div class="body">${rows}</div><div class="foot"><span>${cfg.source}</span><span class="logo">web<span>skan</span></span></div>`;
// Wariant na telefon (27.11, uwaga Kamila: 1200 px ściśnięte do ekranu było nieczytelne): szerokość 600 px CSS × 2, wysokość z treści, większe pismo.
const mobileCss = `<style>body{width:600px;height:auto;display:block}.top{padding:30px 32px 26px}.eb{font-size:17px;margin-bottom:12px}h1{font-size:38px}
.body{display:block;padding:8px 32px 0}.row{grid-template-columns:1fr 150px;column-gap:12px;row-gap:9px;padding:20px 0;border-bottom:1px solid #DDE5E3}.row:last-child{border-bottom:0}
.lab{font-size:25px;line-height:1.24}.lab small{font-size:18px;margin-top:5px}.row b{font-size:33px}.track{height:12px}
.foot{display:block;padding:22px 32px 30px;font-size:17px;line-height:1.4}.foot .logo{display:block;margin-top:12px;font-size:30px}</style>`;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1200, height: 1200 } });
await p.setContent(html); await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: new URL('../public' + cfg.out, import.meta.url).pathname });
console.log('ok', cfg.out);
if (cfg.outMobile) {
  const m = await b.newPage({ viewport: { width: 600, height: 900 }, deviceScaleFactor: 2 });
  await m.setContent(html + mobileCss); await m.evaluate(() => document.fonts.ready);
  await m.screenshot({ path: new URL('../public' + cfg.outMobile, import.meta.url).pathname, fullPage: true });
  console.log('ok', cfg.outMobile, await m.evaluate(() => [document.documentElement.scrollWidth * 2, document.documentElement.scrollHeight * 2].join('x')));
}
await b.close();
