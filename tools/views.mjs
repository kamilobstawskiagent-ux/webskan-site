// Wejścia na raporty studiów (/r/<token>) z własnego licznika w workerze (KV `wlv:`; od 22.11.2026). Użycie: node tools/views.mjs [--raw]
// Dane sprzed 22.11: tools/cfopens.mjs (Cloudflare, próbkowane, z dokładnością do godziny).
import fs from 'node:fs';
const H = process.env.HOME, key = fs.readFileSync(`${H}/.secrets/scan_key.txt`, 'utf8').trim();
const j = await (await fetch('https://webskan.com/api/agency/views', { headers: { 'x-scan-key': key } })).json();
const dom = {};
for (const l of fs.readFileSync(`${H}/projects/outreach/agency-sent.tsv`, 'utf8').split('\n')) { const p = l.split('\t'); if (p[3]) dom[p[3].split('/r/')[1]] = `${p[1]} (wysłano ${p[0].slice(0, 16)}Z)`; }
if (process.argv.includes('--raw')) { console.log(JSON.stringify(j.views, null, 1)); process.exit(0); }
const by = {};
for (const v of j.views) (by[v.token] ||= []).push(v);
console.log(`raporty z wejściami: ${Object.keys(by).length}, wejść razem: ${j.views.length}`);
for (const [t, vs] of Object.entries(by)) { console.log(`\n${dom[t] || 'poza rejestrem wysyłek'} /r/${t.slice(0, 8)}… – ${vs.length} wejść`); for (const v of vs.sort((a, b) => a.t.localeCompare(b.t))) console.log(`  ${v.t.slice(0, 19)}Z ${v.b} ${v.d} ${v.o} ${v.c}${v.ref ? ' z: ' + v.ref : ''}`); }
