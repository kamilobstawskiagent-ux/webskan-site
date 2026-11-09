// Ponowne sprawdzenie po audycie: link z tokenem w raporcie PDF (ważny 30 dni, jednorazowy) → strona potwierdzenia → kolejka dla pollera → e-mail „naprawione / nadal otwarte / nowe”.
// KV ORDERS: rtoken:<token> = { url, lang, email, job, created, expires, status: new|queued|running|done|failed, requested_at, done_at, summary }
// API (x-scan-key): POST /api/recheck/register {token,url,lang,email,job,expires} | GET /api/recheck/next | POST /api/recheck/done {token,status,summary}
// Publicznie: GET/POST /recheck/<token>, /en/recheck/<token>
import { layout } from './scan.js';

const key = (t) => `rtoken:${t}`;
// Limit darmowego KV: 1000 list/dzień – kolejkowanie ustawia flagę `rtoken-dirty`, a /next listuje tylko, gdy flaga różni się od `rtoken-seen` (albo `?full=1`).
const DIRTY = 'rtoken-dirty', SEEN = 'rtoken-seen';
const markDirty = (env) => env.ORDERS.put(DIRTY, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (iso, lang) => new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'long' });
function authed(request, env) { const k = request.headers.get('x-scan-key') || ''; return Boolean(env.SCAN_KEY) && k.length === env.SCAN_KEY.length && k === env.SCAN_KEY; }

export async function recheckApi(request, env, pathname) {
  if (!authed(request, env)) return new Response('Unauthorized', { status: 401 });
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  if (pathname === '/api/recheck/register' && request.method === 'POST') {
    if (!/^[0-9a-f]{32}$/.test(body.token || '') || !body.url || !body.email) return Response.json({ error: 'token/url/email' }, { status: 400 });
    const expires = body.expires || new Date(Date.now() + 33 * 86400000).toISOString();
    const rec = { url: body.url, lang: body.lang === 'en' ? 'en' : 'pl', email: body.email, job: body.job || null, created: new Date().toISOString(), expires, status: 'new' };
    await env.ORDERS.put(key(body.token), JSON.stringify(rec), { expirationTtl: Math.max(60, Math.floor((new Date(expires) - Date.now()) / 1000) + 90 * 86400) });
    return Response.json({ ok: true, token: body.token, ...rec });
  }
  if (pathname === '/api/recheck/next') {
    const full = new URL(request.url).searchParams.get('full') === '1';
    const dirty = await env.ORDERS.get(DIRTY);
    if (!full) { const seen = await env.ORDERS.get(SEEN); if (!dirty || dirty === seen) return Response.json([]); }
    const out = [];
    let cursor;
    try {
      do {
        const page = await env.ORDERS.list({ prefix: 'rtoken:', cursor });
        for (const k of page.keys) { const rec = JSON.parse((await env.ORDERS.get(k.name)) || 'null'); if (rec && rec.status === 'queued') out.push({ token: k.name.slice(7), ...rec }); }
        cursor = page.list_complete ? null : page.cursor;
      } while (cursor);
    } catch (e) { return Response.json({ error: `KV list: ${String(e.message || e).slice(0, 200)}` }, { status: 503 }); }
    for (const r of out) await env.ORDERS.put(key(r.token), JSON.stringify({ ...r, token: undefined, status: 'running', started_at: new Date().toISOString() }));
    // Flaga bywa widoczna wcześniej niż sam wpis na liście (list KV spójny po 10–60 s) – przy pustym wyniku uznajemy flagę za obsłużoną dopiero po 3 min.
    if (dirty && (out.length || Date.now() - (Number(String(dirty).split('-')[0]) || 0) > 3 * 60 * 1000)) await env.ORDERS.put(SEEN, dirty);
    return Response.json(out);
  }
  if (pathname === '/api/recheck/done' && request.method === 'POST') {
    const rec = JSON.parse((await env.ORDERS.get(key(body.token || ''))) || 'null');
    if (!rec) return new Response('Not found', { status: 404 });
    const status = body.status === 'failed' ? 'queued' : 'done'; // nieudane wraca do kolejki (poller spróbuje ponownie w następnym cyklu, max 3 razy po swojej stronie)
    if (status === 'queued') await markDirty(env);
    await env.ORDERS.put(key(body.token), JSON.stringify({ ...rec, status: body.status === 'failed' && (rec.attempts || 0) >= 2 ? 'failed' : status, attempts: (rec.attempts || 0) + 1, done_at: status === 'done' ? new Date().toISOString() : rec.done_at, summary: body.summary || rec.summary || null }));
    return Response.json({ ok: true });
  }
  return new Response('Not found', { status: 404 });
}

const T = {
  pl: {
    title: 'Ponowne sprawdzenie strony', notFound: 'Nie znamy tego linku. Sprawdź, czy link z raportu jest skopiowany w całości, albo odpisz na e-mail z raportem.', expired: (d) => `Ten link wygasł ${d}. Ponowne sprawdzenie jest dostępne przez 30 dni od audytu. Jeśli potrzebujesz kolejnego, odpisz na e-mail z raportem – ustalimy, co dalej.`,
    done: (d) => `Ponowne sprawdzenie zostało już wykonane ${d}, a wynik wysłaliśmy e-mailem na adres z zamówienia. Każdy link działa raz; jeśli potrzebujesz kolejnej powtórki, odpisz na e-mail z raportem.`,
    queued: 'Ponowne sprawdzenie jest już w kolejce. Wynik przyjdzie e-mailem na adres z zamówienia, zwykle w ciągu godziny, najpóźniej w 24 h.',
    confirm: (url) => `<p>Uruchomimy jeszcze raz pełne badanie strony <strong>${esc(url)}</strong> (podstrony, linki, dostępność, wydajność, formularze) i porównamy je z raportem z audytu.</p><p>Wynik przyjdzie e-mailem na adres z zamówienia jako lista: <strong>naprawione</strong>, <strong>nadal otwarte</strong>, <strong>nowe</strong>. Link działa raz, więc kliknij, gdy poprawki są już wdrożone.</p>`,
    button: 'Uruchom ponowne sprawdzenie', thanks: 'Przyjęliśmy zlecenie. Badanie potrwa kilka minut, a wynik wyślemy e-mailem na adres z zamówienia – zwykle w ciągu godziny, najpóźniej w 24 h.', back: 'Wróć na stronę główną',
  },
  en: {
    title: 'Re-check your website', notFound: 'We do not recognise this link. Check that you copied it in full from the report, or reply to the e-mail with your report.', expired: (d) => `This link expired on ${d}. The re-check is available for 30 days after the audit. If you need another one, reply to the e-mail with your report and we will sort it out.`,
    done: (d) => `The re-check was already run on ${d} and the result was e-mailed to the address from your order. Each link works once; if you need another re-check, reply to the e-mail with your report.`,
    queued: 'The re-check is already queued. The result will arrive by e-mail at the address from your order, usually within an hour and within 24 h at the latest.',
    confirm: (url) => `<p>We will run the full examination of <strong>${esc(url)}</strong> again (subpages, links, accessibility, performance, forms) and compare it with your audit report.</p><p>The result arrives by e-mail at the address from your order as a list: <strong>fixed</strong>, <strong>still open</strong>, <strong>new</strong>. The link works once, so click it when your fixes are live.</p>`,
    button: 'Run the re-check', thanks: 'Request received. The examination takes a few minutes and we will e-mail the result to the address from your order – usually within an hour, within 24 h at the latest.', back: 'Back to the homepage',
  },
};
export async function recheckPage(request, env, lang, token) {
  const t = T[lang];
  const home = lang === 'en' ? '/en/' : '/';
  const page = (body, status = 200) => { const r = layout(lang, t.title, `<section class="hero"><p class="eyebrow">Webskan</p><h1>${t.title}</h1>${body}<p><a href="${home}">${t.back}</a></p></section>`); return new Response(r.body, { status, headers: r.headers }); };
  const rec = JSON.parse((await env.ORDERS.get(key(token))) || 'null');
  if (!rec) return page(`<p>${t.notFound}</p>`, 404);
  if (rec.status === 'done') return page(`<p>${t.done(fmtDate(rec.done_at, lang))}</p>`);
  if (rec.status === 'queued' || rec.status === 'running') return page(`<p>${t.queued}</p>`);
  if (new Date(rec.expires) < Date.now()) return page(`<p>${t.expired(fmtDate(rec.expires, lang))}</p>`);
  if (request.method === 'POST') {
    await env.ORDERS.put(key(token), JSON.stringify({ ...rec, status: 'queued', requested_at: new Date().toISOString(), ip: request.headers.get('cf-connecting-ip') || '' }));
    await markDirty(env);
    return page(`<p>${t.thanks}</p>`);
  }
  return page(`${t.confirm(rec.url)}<form method="post" action="${lang === 'en' ? '/en' : ''}/recheck/${esc(token)}"><button class="btn" type="submit">${t.button}</button></form>`);
}
