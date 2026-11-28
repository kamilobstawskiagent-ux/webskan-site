import { chromium } from '/home/agent/projects/audit/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync('/home/agent/projects/site/public/fonts/' + f).toString('base64');
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Bricolage;src:url(${font('bricolage.woff2')});font-weight:500 800;unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Bricolage;src:url(${font('bricolage-ext.woff2')});font-weight:500 800;unicode-range:U+0100-02BA}
@font-face{font-family:PlexMono;src:url(${font('plexmono.woff2')});font-weight:500;unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:PlexMono;src:url(${font('plexmono-ext.woff2')});font-weight:500;unicode-range:U+0100-02BA}
body{margin:0;width:1520px;height:350px;overflow:hidden;background:#0E3B43 radial-gradient(70% 160% at 100% 0,rgba(233,185,73,.24),transparent 60%);position:relative;color:#fff}
.c{position:absolute;left:470px;right:80px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center}
.w{font:700 92px/1 Bricolage;letter-spacing:-3px}.w span{color:#E9B949}
.t{font:500 27px/1.4 PlexMono;color:#CFE0DE;margin-top:20px;white-space:nowrap}
.d{position:absolute;right:-70px;bottom:-150px;width:360px;height:360px;border:40px solid rgba(233,185,73,.11);border-radius:86px}
</style><div class="d"></div><div class="c"><div class="w">web<span>skan</span></div><div class="t">audyt stron WWW z listą konkretnych poprawek</div></div>`;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 1520, height: 350 } })).newPage();
await p.setContent(html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
await p.screenshot({ path: '/home/agent/projects/site/docs/brand/wykop-banner.png' }); await b.close();
