// Webskan – webhook Polar (Standard Webhooks) → KV, odbierany przez poller zamówień.
// POST /api/polar/webhook  – Polar wysyła zdarzenia; podpis weryfikowany sekretem POLAR_WEBHOOK_SECRET (whsec_…).
//   order.paid → KV `pw:order:<id>` (payload zamówienia, TTL 7 dni); subscription.* → KV `pw:sub:<id>` (ostatni stan).
// GET  /api/polar/pending   (x-scan-key) – lista nieodebranych zdarzeń [{key, type, data, received_at}].
// POST /api/polar/ack       (x-scan-key) {keys:[…]} – usunięcie odebranych.
// Poller (orders/poll.mjs) pyta /pending co minutę i kolejkuje zamówienie z payloadu – nie czeka na pełny odczyt /v1/orders.
// Limit darmowego KV: 1000 operacji list/dzień (09.11 e-mail CF „KV requests are temporarily blocked”). Dlatego webhook ustawia flagę `pw-dirty` (znacznik czasu),
//   a /pending czyta tylko flagę (get – 100 k/dzień) i listuje dopiero, gdy flaga różni się od `pw-seen`; `?full=1` wymusza listowanie (poller robi to co 30 min kontrolnie).

const TTL = 7 * 24 * 3600;
const PREFIX = 'pw:';
const DIRTY = 'pw-dirty', SEEN = 'pw-seen'; // poza prefiksem, żeby list ich nie zwracał
const markDirty = (env) => env.ORDERS.put(DIRTY, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`);

function authed(request, env) { const k = request.headers.get('x-scan-key') || ''; return Boolean(env.SCAN_KEY) && k.length === env.SCAN_KEY.length && k === env.SCAN_KEY; }

function b64ToBytes(b64) { const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
function bytesToB64(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function safeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

// Standard Webhooks: HMAC-SHA256(secret, `${id}.${timestamp}.${body}`), base64, nagłówek `webhook-signature: v1,<sig> [v1,<sig2>…]`.
// Sekret `whsec_<base64>` – klucz = zdekodowany base64. Dla starszych sekretów Polar (sprzed 2026-09-08) kluczem są bajty całego napisu – sprawdzamy oba warianty.
export async function verifyStandardWebhook(secret, headers, body, { toleranceSec = 300, now = Date.now() } = {}) {
  const id = headers.get('webhook-id'); const ts = headers.get('webhook-timestamp'); const sigHeader = headers.get('webhook-signature');
  if (!id || !ts || !sigHeader || !secret) return { ok: false, reason: 'missing headers or secret' };
  const t = Number(ts); if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > toleranceSec) return { ok: false, reason: 'timestamp out of tolerance' };
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const keys = [];
  try { keys.push(b64ToBytes(raw)); } catch { /* nie base64 */ }
  keys.push(new TextEncoder().encode(secret));
  const msg = new TextEncoder().encode(`${id}.${ts}.${body}`);
  const given = sigHeader.split(/\s+/).map((p) => p.split(',')).filter((p) => p[0] === 'v1' && p[1]).map((p) => p[1]);
  for (const k of keys) {
    const key = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = bytesToB64(new Uint8Array(await crypto.subtle.sign('HMAC', key, msg)));
    if (given.some((g) => safeEqual(g, sig))) return { ok: true, id, ts: t };
  }
  return { ok: false, reason: 'signature mismatch' };
}

export async function polarApi(request, env, pathname) {
  if (pathname === '/api/polar/webhook') {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const body = await request.text();
    const v = await verifyStandardWebhook(env.POLAR_WEBHOOK_SECRET, request.headers, body);
    if (!v.ok) return new Response(`Forbidden: ${v.reason}`, { status: 403 });
    let evt; try { evt = JSON.parse(body); } catch { return new Response('Bad JSON', { status: 400 }); }
    const type = String(evt.type || ''); const data = evt.data || {};
    const rec = JSON.stringify({ type, data, webhook_id: v.id, received_at: new Date().toISOString() });
    if (type === 'order.paid' && data.id) await env.ORDERS.put(`${PREFIX}order:${data.id}`, rec, { expirationTtl: TTL });
    else if (type.startsWith('subscription.') && data.id) await env.ORDERS.put(`${PREFIX}sub:${data.id}`, rec, { expirationTtl: TTL });
    else if (type === 'order.created' || type === 'order.updated' || type === 'checkout.created' || type === 'checkout.updated') { /* bez akcji – zamówienie trafia przez order.paid */ }
    else await env.ORDERS.put(`${PREFIX}other:${v.id}`, rec, { expirationTtl: 3 * 24 * 3600 });
    await markDirty(env);
    return new Response('', { status: 202 });
  }
  if (!authed(request, env)) return new Response('Unauthorized', { status: 401 });
  if (pathname === '/api/polar/pending' && request.method === 'GET') {
    const full = new URL(request.url).searchParams.get('full') === '1';
    const dirty = await env.ORDERS.get(DIRTY);
    if (!full) { const seen = await env.ORDERS.get(SEEN); if (!dirty || dirty === seen) return Response.json([]); }
    const out = [];
    let cursor;
    try {
      do {
        const l = await env.ORDERS.list({ prefix: PREFIX, cursor, limit: 100 });
        for (const k of l.keys) { const v = await env.ORDERS.get(k.name); if (v) { try { out.push({ key: k.name, ...JSON.parse(v) }); } catch { /* pomiń */ } } }
        cursor = l.list_complete ? undefined : l.cursor;
      } while (cursor);
    } catch (e) { return Response.json({ error: `KV list: ${String(e.message || e).slice(0, 200)}` }, { status: 503 }); }
    // Flaga bywa widoczna wcześniej niż sam wpis na liście (list KV spójny po 10–60 s) – przy pustym wyniku uznajemy flagę za obsłużoną dopiero po 3 min.
    if (dirty && (out.length || Date.now() - (Number(String(dirty).split('-')[0]) || 0) > 3 * 60 * 1000)) await env.ORDERS.put(SEEN, dirty);
    return Response.json(out);
  }
  if (pathname === '/api/polar/ack' && request.method === 'POST') {
    const { keys } = await request.json().catch(() => ({}));
    const ks = Array.isArray(keys) ? keys.filter((k) => typeof k === 'string' && k.startsWith(PREFIX)).slice(0, 200) : [];
    await Promise.all(ks.map((k) => env.ORDERS.delete(k)));
    return Response.json({ deleted: ks.length });
  }
  return new Response('Not found', { status: 404 });
}
