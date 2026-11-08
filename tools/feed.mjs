// Generuje kanały RSS 2.0 bloga: public/blog/feed.xml (PL) i public/en/blog/feed.xml (EN).
// Źródło = kolejność wpisów w indeksie bloga + JSON-LD (headline, description, datePublished) każdego wpisu.
// Użycie: node tools/feed.mjs   (po dodaniu/zmianie wpisu, przed deployem)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://webskan.com';
const FEEDS = [
  { lang: 'pl', index: 'public/blog/index.html', out: 'public/blog/feed.xml', self: '/blog/feed.xml', link: '/blog/', prefix: '/blog/',
    title: 'Webskan – blog', desc: 'Zdrowie strony WWW małej firmy po ludzku: szybkość, bezpieczeństwo, SEO, dostępność, prawo.' },
  { lang: 'en', index: 'public/en/blog/index.html', out: 'public/en/blog/feed.xml', self: '/en/blog/feed.xml', link: '/en/blog/', prefix: '/en/blog/',
    title: 'Webskan – blog', desc: 'Website health for small businesses and the developers who ship for them: speed, security, SEO, accessibility.' },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function postMeta(urlPath) {
  const file = path.join(SITE, 'public', urlPath, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`brak JSON-LD: ${urlPath}`);
  const ld = JSON.parse(m[1]);
  const headline = ld.headline || html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, '');
  const description = ld.description || html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const published = ld.datePublished;
  const modified = ld.dateModified || published;
  if (!headline || !description || !published) throw new Error(`niepełne metadane: ${urlPath}`);
  return { headline, description, published, modified };
}

let changed = 0;
for (const f of FEEDS) {
  const index = fs.readFileSync(path.join(SITE, f.index), 'utf8');
  const paths = [...index.matchAll(new RegExp(`<li><a href="(${f.prefix.replace(/\//g, '\\/')}[^"/]+/)"`, 'g'))].map((m) => m[1]);
  if (!paths.length) throw new Error(`indeks bez wpisów: ${f.index}`);
  const items = paths.map((p) => ({ url: ORIGIN + p, ...postMeta(p) }));
  // kolejność: najnowsze pierwsze (indeks już tak jest, ale sortujemy stabilnie po dacie, zachowując kolejność indeksu w obrębie dnia)
  items.sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0));
  const newest = items.reduce((d, i) => (i.modified > d ? i.modified : d), items[0].modified);
  const rfc = (d) => new Date(`${d}T08:00:00+01:00`).toUTCString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(f.title)}</title>
<link>${ORIGIN}${f.link}</link>
<atom:link href="${ORIGIN}${f.self}" rel="self" type="application/rss+xml"/>
<description>${esc(f.desc)}</description>
<language>${f.lang}</language>
<lastBuildDate>${rfc(newest)}</lastBuildDate>
${items.map((i) => `<item>
<title>${esc(i.headline)}</title>
<link>${i.url}</link>
<guid isPermaLink="true">${i.url}</guid>
<pubDate>${rfc(i.published)}</pubDate>
<description>${esc(i.description)}</description>
</item>`).join('\n')}
</channel>
</rss>
`;
  const outFile = path.join(SITE, f.out);
  const old = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  if (old !== xml) { fs.writeFileSync(outFile, xml); changed++; }
  console.log(`${f.out}: ${items.length} wpisów, najnowszy ${items[0].published}${old === xml ? ' (bez zmian)' : ' (zapisano)'}`);
}
process.exitCode = 0;
