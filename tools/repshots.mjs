// Miniatury przykładowych raportów ze strony (rep-{pl,en}-{1,2,3}.webp, agencje/img/{report-agency,step}.webp).
// Użycie: node tools/repshots.mjs <katalog z report.pl.html, report.en.html, wl/report.pl.html> [--step N]
// PNG → WebP przez Pillow (python3). Po zmianie próbek uruchomić i obejrzeć wynik.
import { chromium } from '/home/agent/projects/audit/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const src = path.resolve(process.argv[2]); const stepN = Number(process.argv.includes('--step') ? process.argv[process.argv.indexOf('--step') + 1] : 1);
const pub = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'public');
const tmp = fs.mkdtempSync('/tmp/repshots-');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const jobs = [];
const shotAt = async (file, w, h, scale, locate, out) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale }); const page = await ctx.newPage();
  await page.goto('file://' + file, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready);
  const y = await page.evaluate(locate); await page.evaluate((yy) => scrollTo(0, yy), y); await page.waitForTimeout(200);
  const png = path.join(tmp, path.basename(out) + '.png'); await page.screenshot({ path: png }); await ctx.close(); jobs.push([png, out]);
};
const h2 = (re) => `(() => { const e = [...document.querySelectorAll('h2')].find((x) => ${re}.test(x.textContent)); return e ? e.getBoundingClientRect().top + scrollY - 28 : 0; })()`;
for (const lang of ['pl', 'en']) {
  const f = path.join(src, `report.${lang}.html`);
  await shotAt(f, 720, 931, 1, '0', path.join(pub, `img/rep-${lang}-1.webp`));
  await shotAt(f, 720, 931, 1, h2('/^(Plan działań|Action plan)/'), path.join(pub, `img/rep-${lang}-2.webp`));
  await shotAt(f, 720, 931, 1, h2('/^(Ścieżki klienta|Customer journeys)/'), path.join(pub, `img/rep-${lang}-3.webp`));
}
const wl = path.join(src, 'wl/report.pl.html');
await shotAt(wl, 950, 838, 1.2, '0', path.join(pub, 'agencje/img/report-agency.webp'));
{ // jeden punkt planu, przycięty do elementu
  // 22.11 (uwaga Kamila): zrzut samego elementu nie miał marginesów (ramki dotykały krawędzi karty), a przy 800 px tekst był na telefonie nieczytelny – węższy widok i własny odstęp wokół punktu
  const ctx = await browser.newContext({ viewport: { width: 600, height: 1400 }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
  await page.goto('file://' + wl, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready);
  const el = page.locator('.step').nth(stepN - 1); await el.evaluate((e) => { e.style.padding = '30px 32px 26px'; e.style.margin = '0'; e.style.border = '0'; e.style.background = '#fff'; e.style.boxSizing = 'border-box'; }); await el.scrollIntoViewIfNeeded(); const png = path.join(tmp, 'step.png'); await el.screenshot({ path: png }); await ctx.close(); jobs.push([png, path.join(pub, 'agencje/img/step.webp')]);
}
await browser.close();
execFileSync('python3', ['-c', `
import sys, json
from PIL import Image
for png, out in json.loads(sys.argv[1]):
    im = Image.open(png).convert('RGB'); im.save(out, 'WEBP', quality=86, method=6); print(out, im.size)
`, JSON.stringify(jobs)], { stdio: 'inherit' });
