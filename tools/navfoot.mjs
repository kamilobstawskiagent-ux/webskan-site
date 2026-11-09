#!/usr/bin/env node
// Ujednolica menu górne i stopkę na wszystkich statycznych stronach w public/.
// Użycie: node tools/navfoot.mjs [--check]   (--check: tylko wypisz pliki, które by się zmieniły, rc=1 gdy są)
// Zasady (UI audyt 09.11: „menu i stopki różnią się między typami stron”):
//  - strony-lądowiska (/, /en/, /developers/, /developers/findings/) zachowują własne menu z kotwicami,
//  - pozostałe strony treści: Blog · Cennik · FAQ · EN  (EN: Blog · Pricing · FAQ · PL; wpisy dla programistów: + For developers),
//    link językowy prowadzi do odpowiednika strony, a gdy go nie ma – do indeksu bloga w drugim języku,
//  - strony podziękowania bez menu (bez rozpraszania po zakupie),
//  - stopka wszędzie ta sama: Blog · [RSS na blogu] · Regulamin · Polityka prywatności · Dla programistów (EN) · kontakt
//    (EN: Blog · Terms · Privacy policy · For developers / na stronach developers: For business owners · contact).
// Wygenerowane raporty próbki (raport.html / report.html) są pomijane. Strony renderowane przez Workera mają to samo w src/scan.js layout().
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, 'public');
const CHECK = process.argv.includes('--check');
const MAIL = '<a href="mailto:kontakt@webskan.com">kontakt@webskan.com</a>';

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const LANDING = new Set(['index.html', 'en/index.html', 'developers/index.html', 'developers/findings/index.html']);
const SKIP = /(^|\/)(raport|report)\.html$/;
const THANKS = new Set(['dziekujemy/index.html', 'en/thanks/index.html']);
// strony bez odpowiednika językowego w nazwie: mapa ręczna
const PAIRS = { 'regulamin/': '/en/terms/', 'prywatnosc/': '/en/privacy/', 'przyklad/': '/en/sample/', 'en/terms/': '/regulamin/', 'en/privacy/': '/prywatnosc/', 'en/sample/': '/przyklad/', 'blog/': '/en/blog/', 'en/blog/': '/blog/' };

function footer(lang, rel) {
  const blog = rel.startsWith('blog/') || rel.startsWith('en/blog/');
  const dev = rel.startsWith('developers/');
  if (lang === 'pl') {
    return `<footer>© 2026 Webskan · <a href="/blog/">Blog</a>${blog ? ' · <a href="/blog/feed.xml">RSS</a>' : ''} · <a href="/regulamin/">Regulamin</a> · <a href="/prywatnosc/">Polityka prywatności</a> · <a href="/developers/" hreflang="en">Dla programistów (EN)</a> · kontakt: ${MAIL}</footer>`;
  }
  return `<footer>© 2026 Webskan · <a href="/en/blog/">Blog</a>${blog ? ' · <a href="/en/blog/feed.xml">RSS</a>' : ''} · <a href="/en/terms/">Terms</a> · <a href="/en/privacy/">Privacy policy</a> · ${dev ? '<a href="/en/">For business owners</a>' : '<a href="/developers/">For developers</a>'} · contact: ${MAIL}</footer>`;
}

function nav(lang, rel, oldNav) {
  const dir = rel.replace(/index\.html$/, '');
  // odpowiednik językowy: istniejący link EN/PL w starym menu > mapa > indeks bloga drugiego języka
  const oldAlt = (oldNav.match(/<a[^>]*href="([^"]+)"[^>]*>(?:EN|PL)<\/a>/) || [])[1];
  const alt = oldAlt || PAIRS[dir] || (lang === 'pl' ? '/en/blog/' : '/blog/');
  const devPost = lang === 'en' && /For developers/.test(oldNav);
  const sample = dir === 'przyklad/' || dir === 'en/sample/';
  if (lang === 'pl') {
    return `<nav><a href="/blog/">Blog</a><a href="/#cena">Cennik</a>${sample ? '<a href="/#zamow">Zamów</a>' : '<a href="/#faq">FAQ</a>'}<a href="${alt}" hreflang="en">EN</a></nav>`;
  }
  return `<nav><a href="/en/blog/">Blog</a>${devPost ? '<a class="m-hide" href="/developers/">For developers</a>' : ''}<a href="/en/#pricing">Pricing</a>${sample ? '<a href="/en/#order">Order</a>' : devPost ? '' : '<a href="/en/#faq">FAQ</a>'}<a href="${alt}" hreflang="pl">PL</a></nav>`;
}

let changed = 0;
for (const f of walk(ROOT)) {
  const rel = path.relative(ROOT, f);
  if (SKIP.test(rel)) continue;
  const lang = rel.startsWith('en/') || rel.startsWith('developers/') ? 'en' : 'pl';
  let html = fs.readFileSync(f, 'utf8');
  const orig = html;
  // stopka
  if (/<footer[^>]*>[\s\S]*?<\/footer>/.test(html)) html = html.replace(/<footer[^>]*>[\s\S]*?<\/footer>/, footer(lang, rel));
  else if (html.includes('</main>')) html = html.replace('</main>', `</main>\n${footer(lang, rel)}`);
  // menu
  if (!LANDING.has(rel) && !THANKS.has(rel)) {
    const m = html.match(/<header>([\s\S]*?)<\/header>/);
    if (m) {
      const oldNav = (m[1].match(/<nav[^>]*>[\s\S]*?<\/nav>/) || [''])[0];
      const logo = m[1].match(/<a class="logo"[^>]*>[\s\S]*?<\/a>/)[0];
      html = html.replace(m[0], `<header>${logo}${nav(lang, rel, oldNav)}</header>`);
    }
  }
  if (html !== orig) {
    changed++;
    console.log((CHECK ? 'would change ' : 'updated ') + rel);
    if (!CHECK) fs.writeFileSync(f, html);
  }
}
console.log(`${changed} file(s) ${CHECK ? 'differ' : 'updated'}`);
if (CHECK && changed) process.exit(1);
