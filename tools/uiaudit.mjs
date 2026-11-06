#!/usr/bin/env node
// Codzienny audyt UI/UX webskan.com.
//   node tools/uiaudit.mjs run      – zrzuty (telefon + komputer) wszystkich stron, testy automatyczne,
//                                     porównanie z bazą, raport → ~/brain/UI_AUDIT.md (+ NEXT_RUN=now)
//   node tools/uiaudit.mjs approve  – bieżący przebieg staje się bazą (po przejrzeniu przez sesję)
//   node tools/uiaudit.mjs sheets <page-key> – wypisuje ścieżki arkuszy do obejrzenia
// Nic tu nie woła modelu: oglądanie arkuszy robi sesja agenta.
import { chromium, devices } from '/home/agent/projects/audit/node_modules/playwright/index.mjs';
import pixelmatch from '/home/agent/projects/orders/node_modules/pixelmatch/index.js';
import { PNG } from '/home/agent/projects/orders/node_modules/pngjs/lib/png.js';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = process.env.UIAUDIT_BASE || 'https://webskan.com';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname, 'uiaudit');
const RUNS = path.join(ROOT, 'runs');
const BASELINE = path.join(ROOT, 'baseline');
const BRAIN = '/home/agent/brain';
const AXE = '/home/agent/projects/audit/node_modules/axe-core/axe.min.js';
const SCAN_KEY = fs.readFileSync('/home/agent/.secrets/scan_key.txt', 'utf8').trim();
const today = new Date().toISOString().slice(0, 10);

// Strony: klucz → ścieżka (lub funkcja zwracająca ścieżkę). Dynamiczne: status monitora, recheck, wynik skanu, 404.
const PAGES = {
  home_pl: '/', home_en: '/en/',
  sample_pl: '/przyklad/', sample_en: '/en/sample/',
  terms_pl: '/regulamin/', terms_en: '/en/terms/',
  privacy_pl: '/prywatnosc/', privacy_en: '/en/privacy/',
  blog_pl: '/blog/', blog_en: '/en/blog/',
  post_pl: '/blog/co-sprawdzic-po-wdrozeniu-nowej-strony/', post_en: '/en/blog/website-launch-checklist/',
  thanks_pl: '/dziekujemy/', thanks_en: '/en/thanks/',
  status_pl: async () => `/status/${await statusToken()}`, status_en: async () => `/en/status/${await statusToken()}`,
  recheck_pl: '/recheck/00000000000000000000000000000000', recheck_en: '/en/recheck/00000000000000000000000000000000',
  scan_pl: async () => scanPath('pl'), scan_en: async () => scanPath('en'),
  notfound: '/nie-ma-takiej-strony/',
};
const PROFILES = {
  m: { ...devices['iPhone 13'], deviceScaleFactor: 2 },
  d: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
};
const FREEZE_CSS = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

async function statusToken() {
  const r = await fetch(`${BASE}/api/monitor/list`, { headers: { 'x-scan-key': SCAN_KEY } });
  const list = await r.json();
  const m = (Array.isArray(list) ? list : list.monitors || []).find((x) => x.active && /webskan\.com/.test(x.url)) || list[0];
  return m.token;
}
async function scanPath(lang) {
  // Darmowy skan kamilobstawski.com – wynik z pamięci podręcznej (7 dni) albo nowy; zarazem test dymny lejka.
  const body = new URLSearchParams({ url: 'https://kamilobstawski.com', lang });
  const r = await fetch(`${BASE}/api/scan`, { method: 'POST', body, redirect: 'manual' });
  const loc = r.headers.get('location');
  if (!loc) throw new Error(`scan POST ${r.status} bez przekierowania`);
  return new URL(loc).pathname;
}

const CHECKS = `(() => {
  const vw = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
  const issues = [];
  const sel = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '');
  const txt = (el) => (el.textContent || el.getAttribute('aria-label') || el.placeholder || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
  if (sw > vw + 1) issues.push({ k: 'page-overflow', d: 'scrollWidth ' + sw + ' > viewport ' + vw });
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if ((b.right > vw + 1 || b.left < -1) && !(cs.position === 'absolute' && b.right < 0)) { const s = sel(el); if (!seen.has(s)) { seen.add(s); issues.push({ k: 'off-viewport', d: s + ' [' + Math.round(b.left) + '..' + Math.round(b.right) + ']' }); } }
    if (cs.overflow !== 'visible' && el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && !/^(pre|code|table)$/i.test(el.tagName)) issues.push({ k: 'clipped-text', d: sel(el) + ' "' + txt(el) + '"' });
    const fs = parseFloat(cs.fontSize);
    if (fs && fs < 12 && el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) issues.push({ k: 'tiny-font', d: sel(el) + ' ' + fs + 'px "' + txt(el) + '"' });
  }
  for (const el of document.querySelectorAll('a,button,input,select,textarea,summary,[role=button]')) {
    const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
    if (el.type === 'hidden') continue;
    if (el.tagName === 'INPUT' && el.closest('label')) continue; // cel dotyku = cała etykieta
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 20) continue; // link w zdaniu (wyjątek WCAG 2.5.8)
    if (vw < 700 && (b.height < 24 || b.width < 24)) issues.push({ k: 'tap-target', d: sel(el) + ' "' + txt(el) + '" ' + Math.round(b.width) + 'x' + Math.round(b.height) });
  }
  for (const img of document.images) {
    if (!img.hasAttribute('alt')) issues.push({ k: 'img-no-alt', d: img.currentSrc || img.src });
    if (img.complete && img.naturalWidth === 0 && !img.loading) issues.push({ k: 'img-broken', d: img.currentSrc || img.src });
  }
  for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea')) {
    const ok = el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label');
    if (!ok && el.getAttribute('aria-hidden') !== 'true') issues.push({ k: 'no-label', d: sel(el) + ' ' + (el.name || '') });
  }
  const h1 = document.querySelectorAll('h1').length; if (h1 !== 1) issues.push({ k: 'h1-count', d: String(h1) });
  if (!document.querySelector('meta[name=viewport]')) issues.push({ k: 'no-viewport-meta', d: '' });
  return { vw, sw, height: document.documentElement.scrollHeight, issues: issues.slice(0, 40) };
})()`;

async function shoot(page, outDir, key, prof, url) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
  page.on('requestfailed', (r) => errors.push('request failed: ' + r.url().slice(0, 120)));
  page.on('response', (r) => { if (r.status() >= 400 && !/\/api\//.test(r.url())) errors.push(`http ${r.status()}: ` + r.url().slice(0, 120)); });
  const res = await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch((e) => { if (/ERR_HTTP_RESPONSE_CODE_FAILURE/.test(String(e))) { errors.push('pusta odpowiedź z kodem błędu (brak strony błędu)'); return null; } throw e; });
  await page.addStyleTag({ content: FREEZE_CSS });
  // Strona wyniku skanu odświeża się sama – czekamy na wynik lub błąd (do 100 s).
  if (/\/(skan|scan)\//.test(url)) {
    try { await page.waitForFunction(() => /Wydajno|Performance|błąd|error|nie uda|failed/i.test(document.body.innerText) && !/odświeża|refresh/i.test(document.title), null, { timeout: 100000, polling: 2000 }); } catch { errors.push('scan: wynik nie pojawił się w 100 s'); }
    await page.addStyleTag({ content: FREEZE_CSS });
  }
  await page.waitForTimeout(400);
  const info = await page.evaluate(CHECKS);
  let axe = [];
  try {
    await page.addScriptTag({ path: AXE });
    const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['color-contrast', 'label', 'link-name', 'button-name', 'image-alt', 'heading-order', 'target-size', 'html-has-lang', 'document-title', 'list', 'landmark-one-main'] })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0, 2).map((n) => n.target.join(' ') + (n.failureSummary ? ' – ' + n.failureSummary.split('\n')[1]?.trim().slice(0, 120) : '')) })));
    axe = r;
  } catch (e) { errors.push('axe: ' + String(e).slice(0, 120)); }
  const file = path.join(outDir, `${key}-${prof}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  const expected404 = /^(notfound|recheck_)/.test(key); // strony błędu: 404 dokumentu jest oczekiwane
  const errs = [...new Set(errors)].filter((e) => !(expected404 && /^(http 404: |console: Failed to load resource: the server responded with a status of 404)/.test(e)));
  return { key, prof, url, status: res?.status(), file, ...info, axe, errors: errs.slice(0, 10) };
}

function readPng(f) { return PNG.sync.read(fs.readFileSync(f)); }
function diffPng(aFile, bFile, outFile) {
  const a = readPng(aFile), b = readPng(bFile);
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  const pad = (p) => { if (p.width === w && p.height === h) return p; const q = new PNG({ width: w, height: h, fill: true }); q.data.fill(255); PNG.bitblt(p, q, 0, 0, p.width, p.height, 0, 0); return q; };
  const A = pad(a), B = pad(b), out = new PNG({ width: w, height: h });
  const n = pixelmatch(A.data, B.data, out.data, w, h, { threshold: 0.1, includeAA: false });
  fs.writeFileSync(outFile, PNG.sync.write(out));
  return { changedPct: +(100 * n / (w * h)).toFixed(2), heightBefore: a.height, heightAfter: b.height };
}

// Arkusze do oglądania: zrzut cięty na kolumny ~1400 px (CSS), 3 kolumny obok siebie, przeskalowane do 0,75 (telefon) / 0,8 (komputer).
function sheets(file, prof) {
  const py = `
import sys
from PIL import Image
f, prof = sys.argv[1], sys.argv[2]
im = Image.open(f); w, h = im.size
scale = 0.75 if prof == 'm' else 0.8
im = im.resize((int(w*scale), int(h*scale)), Image.LANCZOS); w, h = im.size
col = 1500 if prof == 'm' else 1100
cols = [im.crop((0, y, w, min(y+col, h))) for y in range(0, h, col)]
per = 3 if prof == 'm' else 2
out = []
for i in range(0, len(cols), per):
    group = cols[i:i+per]; gh = max(c.size[1] for c in group)
    sheet = Image.new('RGB', (w*len(group) + 12*(len(group)-1), gh), (210, 210, 210))
    for j, c in enumerate(group): sheet.paste(c, (j*(w+12), 0))
    name = f[:-4] + f'-sheet{i//per+1}.png'; sheet.save(name); out.append(name)
print('\\n'.join(out))`;
  return execFileSync('python3', ['-I', '-c', py, file, prof], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
}

// Kontrola treści: nieaktualne ceny i nazwy produktów w całym public/ i src/ (wpadka 06.11: blog reklamował „pełny audyt 99 zł” przez 9 h po zmianie cennika).
const STALE = [/99\s?zł/, /\$\s?29\b/, /[Pp]ełny audyt/, /[Ff]ull audit/, /zwrot(?:y|ów)? bez (?:pytań|podania przyczyny)/i, /no[- ]questions[- ]asked/i];
function contentCheck() {
  const SITE = path.resolve(new URL('..', import.meta.url).pathname);
  const roots = [path.join(SITE, 'public'), path.join(SITE, 'src')];
  const hits = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(html|js|xml)$/.test(e.name)) { const txt = fs.readFileSync(f, 'utf8'); for (const re of STALE) { const m = txt.match(re); if (m) hits.push(`${path.relative(SITE, f)}: „${m[0]}”`); } } } };
  for (const r of roots) if (fs.existsSync(r)) walk(r);
  return hits;
}

async function run() {
  const outDir = path.join(RUNS, today);
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const results = [];
  for (const [key, p] of Object.entries(PAGES)) {
    let pth; try { pth = typeof p === 'function' ? await p() : p; } catch (e) { results.push({ key, prof: '-', url: '', errors: ['nie udało się ustalić adresu: ' + String(e).slice(0, 160)] }); continue; }
    for (const prof of Object.keys(PROFILES)) {
      const ctx = await browser.newContext({ ...PROFILES[prof], bypassCSP: true, reducedMotion: 'reduce', locale: key.endsWith('_en') ? 'en-US' : 'pl-PL' });
      const page = await ctx.newPage();
      try {
        const r = await shoot(page, outDir, key, prof, BASE + pth);
        r.sheets = sheets(r.file, prof);
        const baseFile = path.join(BASELINE, `${key}-${prof}.png`);
        if (fs.existsSync(baseFile)) r.diff = diffPng(baseFile, r.file, path.join(outDir, `${key}-${prof}-diff.png`));
        results.push(r);
        console.log(`${r.status} ${key}/${prof} h=${r.height} issues=${r.issues.length} axe=${r.axe.length} err=${r.errors.length}${r.diff ? ` diff=${r.diff.changedPct}%` : ' (brak bazy)'}`);
      } catch (e) { results.push({ key, prof, url: BASE + pth, errors: ['zrzut nieudany: ' + String(e).slice(0, 200)] }); console.log(`FAIL ${key}/${prof} ${e.message?.slice(0, 120)}`); }
      await ctx.close();
    }
  }
  await browser.close();
  const stale = contentCheck();
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 1));
  const md = report(results, outDir, stale);
  fs.writeFileSync(path.join(outDir, 'report.md'), md);
  fs.writeFileSync(path.join(BRAIN, 'UI_AUDIT.md'), md);
  fs.writeFileSync(path.join(BRAIN, 'NEXT_RUN'), 'now\n');
  console.log('→', path.join(BRAIN, 'UI_AUDIT.md'));
}

function report(results, outDir, stale = []) {
  const dow = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'][new Date().getDay()];
  const full = new Date().getDay() === 1 || !fs.existsSync(BASELINE);
  const changed = results.filter((r) => r.diff && (r.diff.changedPct >= 0.5 || Math.abs(r.diff.heightAfter - r.diff.heightBefore) > 40));
  const noBase = results.filter((r) => r.file && !r.diff);
  const broken = results.filter((r) => !r.file || (r.status && r.status >= 400 && !/^(notfound|recheck_)/.test(r.key)) || r.errors?.some((e) => /scan:|zrzut|adresu|pusta odpowiedź/.test(e)));
  const L = [];
  L.push(`# UI_AUDIT – ${today} (${dow})`, '', `status: do przeglądu`, '', `Przebieg: \`${outDir}\` · stron ${Object.keys(PAGES).length} × profile telefon (iPhone 13, 390 px) i komputer (1280 px). ${full ? '**Dzisiaj pełny przegląd** (poniedziałek lub brak bazy): obejrzyj arkusze WSZYSTKICH stron z listą kontrolną z ROUTINES.md.' : 'Dzień powszedni: obejrzyj arkusze stron zmienionych + wszystkie problemy automatyczne; jedną stronę wybierz losowo do świeżego spojrzenia.'}`, '');
  if (broken.length) { L.push('## Awarie (najpierw to)'); for (const r of broken) L.push(`- ${r.key}/${r.prof} ${r.url} status=${r.status ?? '-'}: ${(r.errors || []).join('; ')}`); L.push(''); }
  L.push('## Zmiany wobec bazy (do obejrzenia)');
  if (!changed.length && !noBase.length) L.push('- brak zmian wizualnych (próg 0,5 % pikseli lub 40 px wysokości)');
  for (const r of changed) L.push(`- **${r.key}/${r.prof}** ${r.diff.changedPct} % pikseli, wysokość ${r.diff.heightBefore}→${r.diff.heightAfter}; arkusze: ${r.sheets.map((s) => path.relative(outDir, s)).join(', ')}; diff: ${r.key}-${r.prof}-diff.png`);
  for (const r of noBase) L.push(`- ${r.key}/${r.prof} – brak bazy (nowa strona); arkusze: ${r.sheets.map((s) => path.relative(outDir, s)).join(', ')}`);
  L.push('', '## Problemy automatyczne');
  let any = false;
  if (stale.length) { any = true; L.push('- **Nieaktualne ceny/nazwy produktów w plikach** (lista STALE w uiaudit.mjs):'); for (const h of stale) L.push(`  - ${h}`); }
  for (const r of results) {
    const items = [...(r.issues || []).map((i) => `${i.k}: ${i.d}`), ...(r.axe || []).map((a) => `axe ${a.id} (${a.impact}, ${a.n}×): ${a.ex.join(' | ')}`), ...(r.errors || [])];
    if (!items.length) continue; any = true;
    L.push(`- **${r.key}/${r.prof}** (${r.url})`); for (const it of items.slice(0, 12)) L.push(`  - ${it}`);
  }
  if (!any) L.push('- brak (overflow, elementy poza ekranem, obcięty tekst, czcionka <12 px, cele dotyku <24 px, alt, etykiety pól, h1, axe: kontrast/etykiety/nazwy linków/nagłówki/target-size, błędy konsoli i żądań)');
  L.push('', '## Przegląd sesji (wypełnia agent)', '- ustalenia:', '- poprawione:', '- do kolejki:', '', `Po przeglądzie: \`node ~/projects/site/tools/uiaudit.mjs approve\` (bieżące zrzuty → baza) i zmień status na \`przejrzane ${today}\`.`);
  return L.join('\n') + '\n';
}

function approve() {
  const outDir = path.join(RUNS, today);
  if (!fs.existsSync(path.join(outDir, 'report.json'))) throw new Error('brak dzisiejszego przebiegu');
  fs.mkdirSync(BASELINE, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (/^[a-z_]+-[md]\.png$/.test(f)) fs.copyFileSync(path.join(outDir, f), path.join(BASELINE, f));
  const ui = path.join(BRAIN, 'UI_AUDIT.md');
  if (fs.existsSync(ui)) fs.writeFileSync(ui, fs.readFileSync(ui, 'utf8').replace(/^status: .*$/m, `status: przejrzane ${today}`));
  // Porządek: przebiegi starsze niż 14 dni.
  for (const d of fs.readdirSync(RUNS)) if (d < new Date(Date.now() - 14 * 86400e3).toISOString().slice(0, 10)) fs.rmSync(path.join(RUNS, d), { recursive: true, force: true });
  console.log('baza zaktualizowana:', BASELINE);
}

const cmd = process.argv[2];
if (cmd === 'run') await run();
else if (cmd === 'approve') approve();
else if (cmd === 'check') { const h = contentCheck(); console.log(h.length ? h.join('\n') : 'OK: brak nieaktualnych cen/nazw'); process.exit(h.length ? 1 : 0); }
else if (cmd === 'sheets') { const r = JSON.parse(fs.readFileSync(path.join(RUNS, today, 'report.json'), 'utf8')); for (const x of r) if (!process.argv[3] || x.key === process.argv[3]) console.log(x.key, x.prof, (x.sheets || []).join(' ')); }
else { console.error('użycie: uiaudit.mjs run|approve|check|sheets [page]'); process.exit(2); }
