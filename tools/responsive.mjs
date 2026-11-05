// Użycie: node tools/responsive.mjs <base> <outDir> [path ...]
// Dla każdej strony i szerokości: wykrywa poziomy overflow i elementy wystające poza viewport, robi zrzut całej strony.
import { chromium } from '/home/agent/projects/audit/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const [base, out, ...paths] = process.argv.slice(2);
const widths = [320, 360, 390, 414, 480, 600, 640, 768, 820, 1024, 1280, 1440, 1920];
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const problems = [];
for (const p of paths) {
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const r = await page.goto(base + p, { waitUntil: 'networkidle' });
    const info = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const sw = document.documentElement.scrollWidth;
      const over = [];
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0) continue;
        if (b.right > vw + 1 || b.left < -1) {
          const cs = getComputedStyle(el);
          if (cs.position === 'absolute' && b.right < 0) continue; // honeypot
          over.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} [${Math.round(b.left)}..${Math.round(b.right)}]`);
        }
      }
      // tekst obcinany / zbyt małe cele dotyku
      const tiny = [];
      for (const el of document.querySelectorAll('a,button,input,summary')) {
        const b = el.getBoundingClientRect(); if (b.width === 0 || b.height === 0) continue;
        if (b.height < 24) tiny.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.placeholder || '').trim().slice(0, 30)}" h=${Math.round(b.height)}`);
      }
      return { vw, sw, over: over.slice(0, 12), tiny: tiny.slice(0, 8) };
    });
    const name = `${p.replace(/[^a-z0-9]+/gi, '_') || 'root'}-${w}`;
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    const bad = info.sw > info.vw + 1 || info.over.length;
    if (bad) problems.push({ p, w, ...info });
    console.log(`${r.status()} ${p} @${w}: scrollWidth=${info.sw} vw=${info.vw}${bad ? ' OVERFLOW ' + info.over.join(' | ') : ' ok'}${info.tiny.length ? ' tiny: ' + info.tiny.join(' | ') : ''}`);
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(`${out}/problems.json`, JSON.stringify(problems, null, 1));
