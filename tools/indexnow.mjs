#!/usr/bin/env node
// IndexNow: zgłasza adresy do Bing/Yandex/Seznam/Naver (jeden POST, bez konta). Klucz = plik public/<klucz>.txt.
// Użycie: node tools/indexnow.mjs [--all | url1 url2 ...]   (--all = wszystkie adresy z public/sitemap.xml)
import fs from 'node:fs';
import path from 'node:path';
const SITE = path.resolve(new URL('..', import.meta.url).pathname);
const keyFile = fs.readdirSync(path.join(SITE, 'public')).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) { console.error('brak pliku klucza public/<32 hex>.txt'); process.exit(1); }
const key = keyFile.replace(/\.txt$/, '');
let urls = process.argv.slice(2).filter((a) => a.startsWith('http'));
if (process.argv.includes('--all')) urls = [...fs.readFileSync(path.join(SITE, 'public/sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urls.length) { console.error('podaj adresy albo --all'); process.exit(1); }
const body = { host: 'webskan.com', key, keyLocation: `https://webskan.com/${key}.txt`, urlList: urls.slice(0, 10000) };
const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
console.log(`IndexNow: HTTP ${r.status} dla ${urls.length} adresów${r.status === 200 || r.status === 202 ? ' – przyjęte' : ' – ' + (await r.text()).slice(0, 300)}`);
process.exit(r.status === 200 || r.status === 202 ? 0 : 1);
