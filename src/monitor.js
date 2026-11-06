// Webskan Monitor – dostępność co minutę (Cron Trigger → Durable Object MonitorHub), zdarzenia down/up dla pollera, strona stanu dla klienta.
// API (nagłówek x-scan-key): POST /api/monitor {url,email,lang,sub_id,order_id} | GET /api/monitor/list | POST /api/monitor/:id {active,url,email}
//   GET /api/monitor/events (niedostarczone) | POST /api/monitor/events/ack {ids} | GET /api/monitor/:id/stats?days=30 | POST /api/monitor/run (ręczny cykl)
// Publicznie: /status/<token> (PL), /en/status/<token> (EN).
import { DurableObject } from 'cloudflare:workers';
import { layout } from './scan.js';

const CHECK_TIMEOUT_MS = 15000;
const DOWN_AFTER = 2; // kolejne nieudane kontrole (minuty) zanim ogłosimy awarię – jedna nieudana to zwykle chwilowy czkawka sieci
const KEEP_CHECKS_DAYS = 35;
const UA = 'Mozilla/5.0 (compatible; WebskanMonitor/1.0; +https://webskan.com)';

const hub = (env) => env.MONITOR_HUB.get(env.MONITOR_HUB.idFromName('hub'));
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

export class MonitorHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS monitors(id TEXT PRIMARY KEY, token TEXT UNIQUE, url TEXT, host TEXT, email TEXT, lang TEXT, active INTEGER, created INTEGER,
        sub_id TEXT, order_id TEXT, state TEXT, since INTEGER, fails INTEGER DEFAULT 0, last_at INTEGER, last_ms INTEGER, last_status INTEGER, last_err TEXT, note TEXT);
      CREATE TABLE IF NOT EXISTS checks(mid TEXT, at INTEGER, ok INTEGER, status INTEGER, ms INTEGER, err TEXT);
      CREATE INDEX IF NOT EXISTS checks_mid ON checks(mid, at);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, mid TEXT, at INTEGER, kind TEXT, payload TEXT, delivered INTEGER DEFAULT 0);
      CREATE INDEX IF NOT EXISTS events_delivered ON events(delivered, id)`);
    try { this.sql.exec('ALTER TABLE monitors ADD COLUMN until INTEGER'); } catch {} // monitoring w cenie audytu: koniec okresu (ms); NULL = abonament/bezterminowo
  }
  list() { return this.sql.exec('SELECT * FROM monitors ORDER BY created').toArray(); }
  get(id) { return this.sql.exec('SELECT * FROM monitors WHERE id=?', id).toArray()[0] || null; }
  byToken(token) { return this.sql.exec('SELECT * FROM monitors WHERE token=?', token).toArray()[0] || null; }
  async create(m) {
    const existing = this.sql.exec('SELECT * FROM monitors WHERE url=? AND email=?', m.url, m.email).toArray()[0];
    if (existing) { // ponowne zamówienie tej samej strony: abonament kasuje termin „w cenie audytu”, sam audyt (until) nie skraca opłaconego abonamentu
      this.sql.exec('UPDATE monitors SET active=1, sub_id=COALESCE(?,sub_id), order_id=COALESCE(?,order_id), until=CASE WHEN ? IS NOT NULL OR sub_id IS NOT NULL THEN NULL ELSE COALESCE(?,until) END WHERE id=?', m.sub_id || null, m.order_id || null, m.sub_id || null, m.until || null, existing.id);
      return { ...this.get(existing.id), existed: true };
    }
    const id = hex(6), token = hex(16);
    this.sql.exec('INSERT INTO monitors(id,token,url,host,email,lang,active,created,sub_id,order_id,state,since,fails,until) VALUES(?,?,?,?,?,?,1,?,?,?,?,?,0,?)',
      id, token, m.url, new URL(m.url).hostname, m.email, m.lang === 'en' ? 'en' : 'pl', Date.now(), m.sub_id || null, m.order_id || null, 'unknown', Date.now(), m.until || null);
    await this.checkOne(this.get(id));
    return this.get(id);
  }
  update(id, patch) {
    const m = this.get(id); if (!m) return null;
    for (const k of ['active', 'url', 'email', 'lang', 'sub_id', 'note', 'until']) if (patch[k] !== undefined) this.sql.exec(`UPDATE monitors SET ${k}=? WHERE id=?`, patch[k], id);
    if (patch.url) this.sql.exec('UPDATE monitors SET host=? WHERE id=?', new URL(patch.url).hostname, id); // stan zostaje: otwarta awaria domknie się zdarzeniem „up”
    return this.get(id);
  }
  async checkOne(m) {
    const t0 = Date.now();
    let ok = false, status = 0, err = null;
    try {
      const ac = new AbortController(); const timer = setTimeout(() => ac.abort('timeout'), CHECK_TIMEOUT_MS);
      try {
        const res = await fetch(m.url, { redirect: 'follow', signal: ac.signal, cache: 'no-store', headers: { 'user-agent': UA, accept: 'text/html,*/*' } });
        status = res.status;
        // Odpowiada = działa. 401/403 (ochrona przed botami) liczymy jako „serwer odpowiada”; 404 i 5xx to awaria z punktu widzenia klienta.
        ok = (status >= 200 && status < 400) || status === 401 || status === 403;
        if (!ok) err = `HTTP ${status}`;
        await res.body?.cancel();
      } finally { clearTimeout(timer); }
    } catch (e) { err = String(e?.message || e).slice(0, 200); if (/abort|timeout/i.test(err)) err = 'timeout'; }
    const ms = Date.now() - t0, at = Date.now();
    this.sql.exec('INSERT INTO checks(mid,at,ok,status,ms,err) VALUES(?,?,?,?,?,?)', m.id, at, ok ? 1 : 0, status, ms, err);
    let fails = ok ? 0 : (m.fails || 0) + 1, state = m.state, since = m.since;
    if (ok && m.state !== 'up') {
      if (m.state === 'down') this.event(m.id, 'up', { downtime_s: Math.round((at - m.since) / 1000), since: m.since, status, ms });
      state = 'up'; since = at;
    } else if (!ok && m.state !== 'down' && fails >= DOWN_AFTER) {
      state = 'down'; since = at - (fails - 1) * 60000;
      this.event(m.id, 'down', { status, err, since, ms });
    }
    this.sql.exec('UPDATE monitors SET state=?, since=?, fails=?, last_at=?, last_ms=?, last_status=?, last_err=? WHERE id=?', state, since, fails, at, ms, status, err, m.id);
    return { ok, status, ms, err };
  }
  event(mid, kind, payload) { this.sql.exec('INSERT INTO events(mid,at,kind,payload) VALUES(?,?,?,?)', mid, Date.now(), kind, JSON.stringify(payload)); }
  async runAll() {
    const ms = this.sql.exec('SELECT * FROM monitors WHERE active=1').toArray();
    const results = await Promise.allSettled(ms.map((m) => this.checkOne(m)));
    if (Math.random() < 0.02) this.sql.exec('DELETE FROM checks WHERE at < ?', Date.now() - KEEP_CHECKS_DAYS * 86400000);
    return { checked: ms.length, down: results.filter((r) => r.status === 'fulfilled' && !r.value.ok).length };
  }
  events() { return this.sql.exec('SELECT e.*, m.url, m.email, m.lang, m.token, m.host FROM events e JOIN monitors m ON m.id=e.mid WHERE e.delivered=0 ORDER BY e.id LIMIT 50').toArray().map((r) => ({ ...r, payload: JSON.parse(r.payload || '{}') })); }
  ack(ids) { for (const id of ids) this.sql.exec('UPDATE events SET delivered=1 WHERE id=?', id); return ids.length; }
  stats(id, days = 30) {
    const from = Date.now() - days * 86400000;
    const agg = this.sql.exec('SELECT COUNT(*) n, SUM(ok) oks, AVG(CASE WHEN ok=1 THEN ms END) avg_ms, MAX(CASE WHEN ok=1 THEN ms END) max_ms FROM checks WHERE mid=? AND at>=?', id, from).toArray()[0];
    const incidents = this.sql.exec('SELECT at, kind, payload FROM events WHERE mid=? AND at>=? AND kind IN (?,?) ORDER BY at', id, from, 'down', 'up').toArray().map((r) => ({ ...r, payload: JSON.parse(r.payload || '{}') }));
    const byDay = this.sql.exec("SELECT date(at/1000,'unixepoch') d, COUNT(*) n, SUM(ok) oks, AVG(CASE WHEN ok=1 THEN ms END) avg_ms FROM checks WHERE mid=? AND at>=? GROUP BY d ORDER BY d", id, from).toArray();
    return { days, checks: agg.n || 0, uptime: agg.n ? +(100 * agg.oks / agg.n).toFixed(agg.n > 2000 ? 3 : 2) : null, avg_ms: agg.avg_ms ? Math.round(agg.avg_ms) : null, max_ms: agg.max_ms || null, incidents, byDay };
  }
}

// --- Cron ---
export async function monitorCron(env) { return hub(env).runAll(); }

// --- API (poller) ---
function authed(request, env) { const k = request.headers.get('x-scan-key') || ''; return Boolean(env.SCAN_KEY) && k.length === env.SCAN_KEY.length && k === env.SCAN_KEY; }
export async function monitorApi(request, env, pathname, normalizeUrl) {
  if (!authed(request, env)) return new Response('Unauthorized', { status: 401 });
  const h = hub(env);
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  if (pathname === '/api/monitor' && request.method === 'POST') {
    const url = normalizeUrl(body.url); if (!url || !body.email) return Response.json({ error: 'url/email' }, { status: 400 });
    return Response.json(await h.create({ url, email: String(body.email).toLowerCase(), lang: body.lang, sub_id: body.sub_id, order_id: body.order_id, until: body.until ? +body.until : null }));
  }
  if (pathname === '/api/monitor/list') return Response.json(await h.list());
  if (pathname === '/api/monitor/events') return Response.json(await h.events());
  if (pathname === '/api/monitor/events/ack' && request.method === 'POST') return Response.json({ acked: await h.ack((body.ids || []).map(Number)) });
  if (pathname === '/api/monitor/run' && request.method === 'POST') return Response.json(await h.runAll());
  let m = pathname.match(/^\/api\/monitor\/([0-9a-f]+)\/stats$/); if (m) return Response.json(await h.stats(m[1], Math.min(90, +(new URL(request.url).searchParams.get('days') || 30))));
  m = pathname.match(/^\/api\/monitor\/([0-9a-f]+)$/);
  if (m && request.method === 'POST') { if (body.url) { body.url = normalizeUrl(body.url); if (!body.url) return Response.json({ error: 'url' }, { status: 400 }); } const r = await h.update(m[1], body); return r ? Response.json(r) : new Response('Not found', { status: 404 }); }
  if (m) { const r = await h.get(m[1]); return r ? Response.json(r) : new Response('Not found', { status: 404 }); }
  return new Response('Not found', { status: 404 });
}

// --- Strona stanu dla klienta ---
const S = {
  pl: { title: (h) => `Stan strony ${h}`, up: 'Działa', down: 'Awaria', unknown: 'Sprawdzamy…', paused: 'Monitoring wstrzymany', since: 'od', lastCheck: 'Ostatnia kontrola', resp: 'czas odpowiedzi', uptime: 'Dostępność', d1: 'ostatnie 24 h', d7: 'ostatnie 7 dni', d30: 'ostatnie 30 dni', avg: 'Średni czas odpowiedzi', incidents: 'Awarie (30 dni)', none: 'Brak awarii w tym okresie.', downAt: 'awaria', upAt: 'przywrócono', dur: 'czas trwania', min: 'min', how: 'Sprawdzamy stronę co minutę z sieci Cloudflare. Awarię ogłaszamy po dwóch kolejnych nieudanych próbach i wysyłamy e-mail; drugi e-mail, gdy strona wróci.', footer: 'Webskan Monitor', checks: 'kontroli', ago: 'temu', s: 's', nodata: 'brak danych' },
  en: { title: (h) => `Status of ${h}`, up: 'Up', down: 'Down', unknown: 'Checking…', paused: 'Monitoring paused', since: 'since', lastCheck: 'Last check', resp: 'response time', uptime: 'Uptime', d1: 'last 24 h', d7: 'last 7 days', d30: 'last 30 days', avg: 'Average response time', incidents: 'Incidents (30 days)', none: 'No incidents in this period.', downAt: 'down', upAt: 'recovered', dur: 'duration', min: 'min', how: 'We check the site every minute from the Cloudflare network. An outage is declared after two consecutive failed checks and you get an e-mail; a second e-mail when the site is back.', footer: 'Webskan Monitor', checks: 'checks', ago: 'ago', s: 's', nodata: 'no data' },
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (ts, lang) => new Date(ts).toLocaleString(lang === 'en' ? 'en-GB' : 'pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' });
const fmtDur = (s, t) => s < 3600 ? `${Math.max(1, Math.round(s / 60))} ${t.min}` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} ${t.min}`;
export async function statusPage(env, lang, token) {
  const t = S[lang], h = hub(env);
  const m = await h.byToken(token);
  if (!m) { const t404 = lang === 'en' ? ['Status page not found', 'This status link is invalid or the monitor was removed.', '/en/', 'Home page'] : ['Nie ma takiej strony stanu', 'Ten link jest nieprawidłowy albo monitor został usunięty.', '/', 'Strona główna']; const r = layout(lang, t404[0], `<section class="hero"><p class="eyebrow">404</p><h1>${t404[0]}</h1><p class="lead">${t404[1]}</p><p><a class="btn sec" href="${t404[2]}">${t404[3]}</a></p></section>`); return new Response(r.body, { status: 404, headers: r.headers }); }
  const [s1, s7, s30] = await Promise.all([h.stats(m.id, 1), h.stats(m.id, 7), h.stats(m.id, 30)]);
  const state = !m.active ? 'paused' : m.state;
  const color = { up: '#1a7f37', down: '#b42318', unknown: '#6b7280', paused: '#6b7280' }[state];
  const pct = (s) => s.uptime == null ? t.nodata : `${s.uptime.toLocaleString(lang === 'en' ? 'en-GB' : 'pl-PL')} %`;
  const incidents = [];
  let open = null;
  for (const e of s30.incidents) { if (e.kind === 'down') open = e; else if (e.kind === 'up') { incidents.push({ down: open ? open.at : e.payload.since, up: e.at, dur: e.payload.downtime_s }); open = null; } }
  if (open) incidents.push({ down: open.at, up: null, dur: Math.round((Date.now() - open.at) / 1000) });
  incidents.reverse();
  const body = `
<section class="hero" style="padding-bottom:1rem"><p class="eyebrow">${t.footer}</p><h1>${esc(t.title(m.host))}</h1>
<p><a href="${esc(m.url)}" rel="noopener">${esc(m.url)}</a></p></section>
<section class="status-card" style="border:1px solid #e5e7eb;border-radius:12px;padding:1.25rem 1.5rem;margin:0 0 1.5rem">
  <p style="margin:0;font-size:1.6rem;font-weight:700;color:${color}">● ${t[state]}</p>
  <p style="margin:.25rem 0 0;color:#4b5563">${[state === 'up' || state === 'down' ? `${t.since} ${fmtDate(m.since, lang)}` : '', m.last_at ? `${t.lastCheck}: ${fmtDate(m.last_at, lang)}${m.last_ms ? `, ${t.resp} ${m.last_ms} ms` : ''}${m.last_err ? ` (${esc(m.last_err)})` : ''}` : ''].filter(Boolean).join(' · ')}</p>
</section>
<section><h2>${t.uptime}</h2>
<div class="grid3" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem">
  ${[[t.d1, s1], [t.d7, s7], [t.d30, s30]].map(([l, s]) => `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:.9rem .8rem"><p style="margin:0;color:#6b7280;font-size:.85rem">${l}</p><p style="margin:.2rem 0 0;font-size:1.5rem;font-weight:700">${pct(s)}</p><p style="margin:0;color:#6b7280;font-size:.85rem">${s.checks} ${t.checks}${s.avg_ms ? ` · ${t.avg.toLowerCase()} ${s.avg_ms} ms` : ''}</p></div>`).join('')}
</div></section>
<section><h2>${t.incidents}</h2>
${incidents.length ? `<ul style="list-style:none;padding:0;margin:0">${incidents.map((i) => `<li style="border-top:1px solid #e5e7eb;padding:.6rem 0;display:flex;flex-wrap:wrap;gap:.25rem 1.25rem"><span style="color:#b42318;font-weight:600">${t.downAt} ${fmtDate(i.down, lang)}</span><span>${i.up ? `${t.upAt} ${fmtDate(i.up, lang)}` : '…'}</span><span style="color:#6b7280">${t.dur}: ${fmtDur(i.dur, t)}</span></li>`).join('')}</ul>` : `<p>${t.none}</p>`}
</section>
<section><p style="color:#6b7280;font-size:.9rem">${t.how}</p></section>`;
  return layout(lang, t.title(m.host), body, '<style>@media(max-width:600px){.grid3{grid-template-columns:1fr!important}.grid3>div{display:grid;grid-template-columns:1fr auto;column-gap:12px;align-items:baseline}.grid3>div p:last-child{grid-column:1/-1}}</style>'); // layout: noindex + no-store
}
