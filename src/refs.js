// Źródła wejść: zliczanie, skąd przychodzą prawdziwe przeglądarki (pierwsza strona wizyty).
// Tylko liczniki zbiorcze w KV (dzień | źródło | ścieżka | kraj) – bez IP, bez cookies, bez danych osobowych.
// Darmowy plan Cloudflare nie udostępnia referera w analityce, stąd własny licznik.
import { authed } from './scan.js';
const OWN = /(^|\.)webskan\.com$/;
const BOT = /bot|crawl|spider|headless|lighthouse|preview|monitor|curl|python|node|scan/i;

export function trackEntry(request, env, ctx, u) {
  try {
    if (request.method !== 'GET') return;
    const h = request.headers;
    if (h.get('sec-fetch-mode') !== 'navigate' || h.get('sec-fetch-dest') !== 'document') return; // tylko nawigacja prawdziwej przeglądarki
    const site = h.get('sec-fetch-site') || '';
    if (site === 'same-origin' || site === 'same-site') return; // kolejna strona tej samej wizyty
    const ua = h.get('user-agent') || '';
    if (!ua.startsWith('Mozilla/') || BOT.test(ua)) return;
    if (/\.[a-z0-9]{2,5}$/i.test(u.pathname) || /\/(wp-|\.|xmlrpc|admin)/i.test(u.pathname)) return; // sondy skanerów (wp-includes/*.js, *.php, /.env) – nasze strony nie mają rozszerzeń
    let src = '';
    const utm = (u.searchParams.get('utm_source') || u.searchParams.get('ref') || u.searchParams.get('src') || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40);
    try { const r = h.get('referer'); if (r) { const host = new URL(r).hostname.toLowerCase(); if (!OWN.test(host)) src = host.replace(/[^a-z0-9.-]/g, '').slice(0, 60); else return; } } catch { /* zły referer = brak */ }
    if (!src) src = site === 'none' ? '(direct)' : '(hidden)'; // direct = wpisany adres, zakładka, link z aplikacji; hidden = inna strona bez referera
    if (utm) src += `+utm:${utm}`;
    const path = u.pathname.replace(/\/(skan|scan|recheck|status)\/[0-9a-f]{8,}.*/, '/$1/*').slice(0, 60);
    const day = new Date().toISOString().slice(0, 10);
    const key = `ref:${day}:${src}|${path}|${request.cf?.country || '??'}`;
    ctx.waitUntil((async () => {
      const n = parseInt(await env.ORDERS.get(key) || '0', 10);
      if (n >= 50) return; // ograniczenie zapisów KV na klucz
      await env.ORDERS.put(key, String(n + 1), { expirationTtl: 120 * 24 * 3600 });
    })().catch(() => {}));
  } catch { /* licznik nie może zepsuć strony */ }
}

// GET /api/refs?day=YYYY-MM-DD (x-scan-key) → [{day, src, path, country, n}]
export async function refsApi(request, env) {
  if (!authed(request, env)) return new Response('unauthorized', { status: 401 });
  const day = new URL(request.url).searchParams.get('day') || '';
  const out = []; let cursor;
  do {
    const l = await env.ORDERS.list({ prefix: `ref:${/^\d{4}-\d{2}(-\d{2})?$/.test(day) ? day : ''}`, cursor, limit: 1000 });
    for (const k of l.keys) { const [d, rest] = [k.name.slice(4, 14), k.name.slice(15)]; const [src, path, country] = rest.split('|'); out.push({ day: d, src, path, country, n: parseInt(await env.ORDERS.get(k.name) || '0', 10) }); }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return Response.json(out);
}
