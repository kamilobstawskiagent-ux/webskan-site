// Webskan dla agencji (white-label): zgłoszenie próby + hostowanie raportów pod marką agencji.
// POST /api/agency/trial   – formularz ze strony /agencje/ (agency, email, url, logo = strona studia [wymagana], note, consent, plan=trial|paid, website=honeypot, src); plan=paid → checkout Polar (POLAR_PRODUCT_AGENCY) → KV `pw:agency:<id>` + flaga pw-dirty;
//                            poller zamówień (orders/poll.mjs) odbiera to przez /api/polar/pending i budzi agenta (realizacja prób ręcznie w sesji).
// POST /api/agency/report?token=<32 hex>  (x-scan-key) – treść HTML raportu → KV `wl:<token>` (TTL 90 dni).
// GET  /r/<token>          – raport HTML pod marką agencji (noindex); wejścia z przeglądarek liczone w KV `wlv:<token>:<ms>-<rand>` (metadane, bez IP).
// GET  /api/agency/views   (x-scan-key) – lista wejść.
import { layout } from "./scan.js";
import { markDirty } from "./polar.js";
import { normalizeUrl } from "./url.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
function authed(request, env) { const k = request.headers.get("x-scan-key") || ""; return Boolean(env.SCAN_KEY) && k.length === env.SCAN_KEY.length && k === env.SCAN_KEY; }
const back = '<p><a href="/agencje/#proba">Wróć do formularza</a></p>';

export async function agencyTrial(request, env) {
  if (request.method !== "POST") return Response.redirect(new URL("/agencje/#proba", request.url).href, 302);
  const form = await request.formData().catch(() => null);
  if (!form) return layout("pl", "Błąd formularza", `<section class="hero"><h1>Błąd formularza</h1>${back}</section>`);
  const ok = () => layout("pl", "Zgłoszenie przyjęte", `<section class="hero"><h1>Zgłoszenie przyjęte</h1><p class="lead">Dziękujemy. Każde zgłoszenie sprawdzamy (próba jest dla agencji i studiów). Pierwszy raport pod Twoją marką wyślemy na podany adres e-mail najpóźniej następnego dnia roboczego.</p><p>Jeśli chcesz dosłać logo w lepszej jakości albo kolejne adresy stron do próby (łącznie 3 raporty), napisz na <a href="mailto:kontakt@webskan.com">kontakt@webskan.com</a>.</p><p><a href="/agencje/">Wróć na stronę dla agencji</a></p></section>`);
  if (form.get("website")) return ok(); // honeypot – udajemy sukces
  const agency = clean(form.get("agency"), 120), email = clean(form.get("email"), 254).toLowerCase(), logo = clean(form.get("logo"), 500), note = clean(form.get("note"), 600);
  const url = normalizeUrl(clean(form.get("url"), 500));
  const bad = (title, msg) => { const r = layout("pl", title, `<section class="hero"><h1>${title}</h1><p>${msg}</p>${back}</section>`); return new Response(r.body, { status: 400, headers: r.headers }); };
  if (!agency) return bad("Brak nazwy", "Podaj nazwę agencji lub studia – trafi do nagłówka raportu.");
  if (!EMAIL_RE.test(email)) return bad("Nieprawidłowy e-mail", "Sprawdź adres e-mail.");
  if (!url) return bad("Nieprawidłowy adres strony", "Podaj publiczny adres strony do audytu, np. <code>https://klient.pl</code>.");
  if (!form.get("consent")) return bad("Brak akceptacji regulaminu", "Aby uruchomić próbę, zaakceptuj regulamin i politykę prywatności.");
  // Strona studia jest wymagana: po niej sprawdzamy, kto prosi o raporty (próba jest dla agencji i studiów), i z niej bierzemy logo.
  const site = normalizeUrl(logo);
  if (!site) return bad("Brak adresu strony agencji", "Podaj adres strony swojej agencji lub studia, np. <code>https://twojaagencja.pl</code> – z niej pobierzemy logo do raportu.");
  const siteHost = new URL(site).hostname.replace(/^www\./, "");
  const plan = String(form.get("plan") || ""); const paid = plan === "paid" || plan === "paid30";
  const agProduct = plan === "paid30" ? env.POLAR_PRODUCT_AGENCY30 : env.POLAR_PRODUCT_AGENCY, agLimit = plan === "paid30" ? "30" : "10";
  // Limit: 5 zgłoszeń na godzinę z jednego adresu IP.
  const ip = request.headers.get("cf-connecting-ip") || "0";
  const rlKey = `agrl:${ip}:${Math.floor(Date.now() / 3600000)}`;
  const n = Number(await env.ORDERS.get(rlKey)) || 0;
  if (n >= 5) return bad("Za dużo zgłoszeń", "Z tego adresu przyszło już kilka zgłoszeń w ostatniej godzinie. Napisz na kontakt@webskan.com.");
  await env.ORDERS.put(rlKey, String(n + 1), { expirationTtl: 7200 });
  if (paid) { // plan 149 zł netto (10 raportów) albo 349 zł netto (30 raportów) od razu: checkout Polar w PLN; zamówienie odbiera poller (product: agency)
    if (!env.POLAR_TOKEN || !agProduct || env.SALES_MODE === "presale") return bad("Płatność chwilowo niedostępna", "Napisz na kontakt@webskan.com – wyślemy link do płatności.");
    const origin = new URL(request.url).origin;
    const r = await fetch(`${env.POLAR_API}/v1/checkouts/`, { method: "POST", headers: { authorization: `Bearer ${env.POLAR_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ products: [agProduct], customer_email: email, currency: "pln", locale: "pl-PL", customer_ip_address: ip !== "0" ? ip : undefined,
        success_url: `${origin}/agencje/dziekujemy/`, metadata: { product: "agency", limit: agLimit, agency: agency.slice(0, 120), url, site, source: "webskan", ...(note ? { note: note.slice(0, 400) } : {}) } }) });
    if (!r.ok) return bad("Nie udało się otworzyć płatności", "Spróbuj ponownie za chwilę albo napisz na kontakt@webskan.com.");
    const c = await r.json();
    return Response.redirect(c.url, 303);
  }
  // Jedna próba na studio (po domenie strony studia).
  if (await env.ORDERS.get(`agdom:${siteHost}`)) return bad("Próba już zgłoszona", `Dla strony ${esc(siteHost)} mamy już zgłoszenie próby. Kolejne adresy do audytu w ramach próby (łącznie 3 raporty) prześlij w odpowiedzi na naszą wiadomość albo na kontakt@webskan.com.`);
  await env.ORDERS.put(`agdom:${siteHost}`, new Date().toISOString(), { expirationTtl: 365 * 24 * 3600 });
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const rec = { type: "agency.trial", data: { id, agency, email, url, logo, note, src: clean(form.get("src"), 40).replace(/[^a-z0-9_.-]/gi, ""), country: request.cf?.country || "" }, received_at: new Date().toISOString() };
  await env.ORDERS.put(`pw:agency:${id}`, JSON.stringify(rec), { expirationTtl: 30 * 24 * 3600 });
  await markDirty(env);
  return ok();
}

export async function agencyReportPut(request, env) {
  if (!authed(request, env)) return new Response("Unauthorized", { status: 401 });
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!/^[0-9a-f]{32}$/.test(token)) return new Response("Bad token", { status: 400 });
  const html = await request.text();
  if (html.length < 1000 || html.length > 20 * 1024 * 1024) return new Response("Bad size", { status: 400 });
  await env.ORDERS.put(`wl:${token}`, html, { expirationTtl: 90 * 24 * 3600 });
  return Response.json({ ok: true, url: `https://webskan.com/r/${token}`, bytes: html.length });
}

// Licznik wejść na raport: jeden wpis KV na wejście z przeglądarki (bez IP, bez ciasteczek) – godzina, rodzina przeglądarki, urządzenie, kraj.
// Automaty (curl, headless, boty, podglądy linków) pomijane. Limit 40 wpisów na raport na dobę, żeby pętla odświeżeń nie zjadła dziennego limitu zapisów KV.
const BOT_RE = /bot|crawl|spider|curl|wget|headless|python|node|go-http|preview|scan|monitor|fetch|lighthouse|playwright|puppeteer|facebookexternalhit|slack|whatsapp|telegram/i;
function uaFamily(ua) {
  const b = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "inna";
  const d = /iPhone|Android.*Mobile|Mobile/.test(ua) ? "telefon" : /iPad|Android/.test(ua) ? "tablet" : "komputer";
  const o = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "inny";
  return { b, d, o };
}
async function logView(request, env, token) {
  const ua = request.headers.get("user-agent") || "";
  if (!ua || BOT_RE.test(ua) || request.method !== "GET") return;
  const purpose = request.headers.get("sec-purpose") || request.headers.get("purpose") || "";
  if (/prefetch|preview/i.test(purpose)) return;
  const now = new Date(), day = now.toISOString().slice(0, 10);
  const capKey = `wlvc:${token}:${day}`;
  const n = Number(await env.ORDERS.get(capKey)) || 0;
  if (n >= 40) return;
  const meta = { t: now.toISOString(), ...uaFamily(ua), c: request.cf?.country || "", ref: (request.headers.get("referer") || "").slice(0, 80) };
  await env.ORDERS.put(`wlv:${token}:${now.getTime()}-${crypto.randomUUID().slice(0, 6)}`, "", { metadata: meta, expirationTtl: 120 * 24 * 3600 });
  await env.ORDERS.put(capKey, String(n + 1), { expirationTtl: 2 * 24 * 3600 });
}

// Pasek nad raportem PRZYKŁADOWYM (raport strony studia wysłany w wiadomości do studia): pole na adres strony klienta + przycisk.
// Pokazywany tylko, gdy istnieje KV `wlp:<token>` = {name, domain, email} (zapisuje outreach/agency-prospect.mjs). Raporty dostarczane
// w próbie/planie (strona klienta studia) NIE mają wpisu `wlp:` – studio przekazuje je dalej, więc paska tam nie ma. Pasek nie drukuje się.
const BAR_CSS = `<style>.wsx{background:#0E3B43;color:#fff;font:400 16px/1.45 "Plex",system-ui,-apple-system,"Segoe UI",sans-serif;padding:18px 20px 16px;border-bottom:4px solid #E9B949}.wsx *{box-sizing:border-box}.wsx-in{max-width:960px;margin:0 auto}.wsx-t{margin:0 0 12px;font:700 21px/1.25 "Bricolage","Plex",system-ui,sans-serif;color:#fff;letter-spacing:-.01em}.wsx-t span{display:inline-block;margin-right:10px;padding:2px 9px;border-radius:6px;background:#E9B949;color:#0E3B43;font:600 12px/1.6 "PlexMono",ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;vertical-align:3px}.wsx form{display:flex;gap:10px;margin:0}.wsx input[type=text]{flex:1;min-width:0;height:52px;padding:0 16px;border:2px solid transparent;border-radius:10px;background:#fff;color:#14262A;font:500 17px "Plex",system-ui,sans-serif}.wsx input[type=text]:focus{outline:0;border-color:#E9B949}.wsx button{height:52px;padding:0 24px;border:0;border-radius:10px;background:#E9B949;color:#0E3B43;font:700 17px "Bricolage","Plex",system-ui,sans-serif;cursor:pointer;white-space:nowrap}.wsx button:hover,.wsx button:focus-visible{background:#F3D27F}.wsx-s{margin:10px 0 0;font-size:13.5px;color:#C5D6D6}.wsx-s a{color:#fff}.wsx .hp{position:absolute;left:-9999px}@media(max-width:600px){.wsx{padding:16px 16px 14px}.wsx-t{font-size:19px}.wsx-t span{display:table;margin:0 0 8px}.wsx form{flex-direction:column}.wsx input[type=text]{flex:none;width:100%}.wsx button{width:100%}}@media print{.wsx{display:none!important}}</style>`;
function sampleBar(token, p) {
  return `${BAR_CSS}<aside class="wsx" aria-label="Zamów raport dla strony klienta"><div class="wsx-in"><p class="wsx-t"><span>To przykład</span>Chcecie taki raport dla strony klienta? Wpiszcie jej adres.</p><form action="/api/agency/client" method="post"><input type="hidden" name="token" value="${token}"><input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><input type="text" name="url" inputmode="url" autocomplete="off" placeholder="https://strona-klienta.pl" aria-label="Adres strony klienta" required maxlength="500"><button type="submit">Zamów raport</button></form><p class="wsx-s">Bezpłatnie, w ramach 3 raportów na próbę. Raport z logo ${esc(p.name)} wyślemy na ${esc(maskEmail(p.email))} najpóźniej następnego dnia roboczego. Tego paska nie ma w raportach dla klientów. Przygotował Webskan · <a href="/regulamin/">regulamin</a> · <a href="/prywatnosc/">prywatność</a></p></div></aside>`;
}
const maskEmail = (e) => { const [u, d] = String(e || "").split("@"); return d ? `${u.slice(0, 1)}…@${d}` : "adres, na który pisaliśmy"; };

// POST /api/agency/prospect (x-scan-key), JSON {token, name, domain, email} → KV `wlp:<token>`; {token, off:true} usuwa pasek.
export async function agencyProspectPut(request, env) {
  if (!authed(request, env)) return new Response("Unauthorized", { status: 401 });
  const b = await request.json().catch(() => null);
  if (!b || !/^[0-9a-f]{32}$/.test(b.token || "")) return new Response("Bad token", { status: 400 });
  if (b.off) { await env.ORDERS.delete(`wlp:${b.token}`); return Response.json({ ok: true, off: true }); }
  const name = clean(b.name, 120), domain = clean(b.domain, 200).toLowerCase(), email = clean(b.email, 254).toLowerCase();
  if (!name || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || !EMAIL_RE.test(email)) return new Response("Bad data", { status: 400 });
  await env.ORDERS.put(`wlp:${b.token}`, JSON.stringify({ name, domain, email }), { expirationTtl: 120 * 24 * 3600 });
  return Response.json({ ok: true });
}

// POST /api/agency/client – pole nad raportem przykładowym: token raportu + adres strony klienta → zgłoszenie próby (jak formularz /agencje/, dane studia z `wlp:`).
// Drugi krok (opcjonalny, ze strony potwierdzenia): rid + email/need → zdarzenie `agency.trial.more`.
export async function agencyClient(request, env) {
  if (request.method !== "POST") return Response.redirect(new URL("/agencje/", request.url).href, 302);
  const form = await request.formData().catch(() => null);
  const token = clean(form?.get("token"), 40);
  const page = (title, body, status = 200) => { const r = layout("pl", title, `<section class="hero"><h1>${title}</h1>${body}</section>`); return new Response(r.body, { status, headers: r.headers }); };
  const backLink = /^[0-9a-f]{32}$/.test(token) ? `<p><a href="/r/${token}">Wróć do raportu</a></p>` : "";
  const p = form && /^[0-9a-f]{32}$/.test(token) ? await env.ORDERS.get(`wlp:${token}`, "json") : null;
  if (!p) return page("Nie udało się przyjąć zgłoszenia", `<p>Napisz na <a href="mailto:kontakt@webskan.com">kontakt@webskan.com</a> – podaj adres strony klienta, a przygotujemy raport.</p>`, 400);
  if (form.get("website")) return page("Zgłoszenie przyjęte", `<p class="lead">Dziękujemy.</p>${backLink}`); // honeypot
  const rid = clean(form.get("rid"), 40);
  if (rid) { // krok 2: inny adres e-mail / ile raportów potrzeba
    if ((await env.ORDERS.get(`wlpr:${rid}`)) !== token) return page("Nie udało się zapisać", `<p>Napisz na <a href="mailto:kontakt@webskan.com">kontakt@webskan.com</a>.</p>${backLink}`, 400);
    const email = clean(form.get("email"), 254).toLowerCase(), need = clean(form.get("need"), 600);
    if (email && !EMAIL_RE.test(email)) return page("Nieprawidłowy e-mail", `<p>Sprawdź adres e-mail i wyślij ponownie (wstecz w przeglądarce).</p>`, 400);
    if (email || need) {
      await env.ORDERS.put(`pw:agency:${rid}-more-${crypto.randomUUID().slice(0, 4)}`, JSON.stringify({ type: "agency.trial.more", data: { id: rid, agency: p.name, email, need }, received_at: new Date().toISOString() }), { expirationTtl: 30 * 24 * 3600 });
      await env.ORDERS.delete(`wlpr:${rid}`); // jeden zapis uzupełnienia na zgłoszenie
      await markDirty(env);
    }
    return page("Zapisane", `<p class="lead">Dziękujemy${email ? ` – raport wyślemy na ${esc(email)}` : ""}.</p>${backLink}`);
  }
  const url = normalizeUrl(clean(form.get("url"), 500));
  if (!url) return page("Nieprawidłowy adres strony", `<p>Podaj publiczny adres strony klienta, np. <code>https://klient.pl</code>.</p>${backLink}`, 400);
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host === p.domain) return page("To adres z przykładu", `<p>Raport dla ${esc(p.domain)} już Państwo mają – to ten przykład. Proszę podać adres strony klienta.</p>${backLink}`, 400);
  const ip = request.headers.get("cf-connecting-ip") || "0";
  const rlKey = `agrl:${ip}:${Math.floor(Date.now() / 3600000)}`;
  const n = Number(await env.ORDERS.get(rlKey)) || 0;
  const used = Number(await env.ORDERS.get(`wlpn:${token}`)) || 0;
  if (n >= 5 || used >= 3) return page(used >= 3 ? "Próba wykorzystana" : "Za dużo zgłoszeń", `<p>${used >= 3 ? "W próbie są 3 raporty i wszystkie zostały już zamówione." : "Z tego adresu przyszło już kilka zgłoszeń w ostatniej godzinie."} Napisz na <a href="mailto:kontakt@webskan.com">kontakt@webskan.com</a> albo zobacz <a href="/agencje/#cena-agencje">plany</a>.</p>${backLink}`, 429);
  await env.ORDERS.put(rlKey, String(n + 1), { expirationTtl: 7200 });
  await env.ORDERS.put(`wlpn:${token}`, String(used + 1), { expirationTtl: 120 * 24 * 3600 });
  await env.ORDERS.put(`agdom:${p.domain}`, new Date().toISOString(), { expirationTtl: 365 * 24 * 3600 });
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const rec = { type: "agency.trial", data: { id, agency: p.name, email: p.email, url, logo: `https://${p.domain}/`, note: `z pola nad raportem przykładowym /r/${token} (raport nr ${used + 1} z 3)`, src: "pole-raport", country: request.cf?.country || "" }, received_at: new Date().toISOString() };
  await env.ORDERS.put(`pw:agency:${id}`, JSON.stringify(rec), { expirationTtl: 30 * 24 * 3600 });
  await env.ORDERS.put(`wlpr:${id}`, token, { expirationTtl: 7 * 24 * 3600 });
  await markDirty(env);
  return page("Zgłoszenie przyjęte", `<p class="lead">Dziękujemy. Raport dla <strong>${esc(host)}</strong> z logo ${esc(p.name)} wyślemy na ${esc(maskEmail(p.email))} najpóźniej następnego dnia roboczego – PDF i wersja online.</p>
<form class="order" action="/api/agency/client" method="post" style="margin-top:28px"><input type="hidden" name="token" value="${token}"><input type="hidden" name="rid" value="${id}"><input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
<p><strong>Dwie rzeczy, które nam pomogą (nieobowiązkowe)</strong></p>
<label>Raport ma trafić na inny adres e-mail?<br><input type="email" name="email" placeholder="imie@agencja.pl" maxlength="254"></label>
<label>Ile takich raportów miesięcznie by się Państwu przydało i do czego (oferty, odbiory, opieka nad stronami)?<br><textarea name="need" rows="3" maxlength="600"></textarea></label>
<button class="btn" type="submit">Zapisz</button></form>${backLink}`);
}

export async function agencyReportGet(env, token, request, ctx) {
  const [raw, p] = await Promise.all([env.ORDERS.get(`wl:${token}`), env.ORDERS.get(`wlp:${token}`, "json").catch(() => null)]);
  if (!raw) return null;
  const html = p && p.name ? raw.replace(/<body[^>]*>/, (m) => m + sampleBar(token, p)) : raw;
  if (request && ctx) ctx.waitUntil(logView(request, env, token).catch(() => {}));
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "private, max-age=300" } });
}

// GET /api/agency/views[?token=<32 hex>] (x-scan-key) – lista wejść na raporty (z metadanych KV, bez odczytu wartości).
export async function agencyViews(request, env) {
  if (!authed(request, env)) return new Response("Unauthorized", { status: 401 });
  const token = new URL(request.url).searchParams.get("token") || "";
  if (token && !/^[0-9a-f]{32}$/.test(token)) return new Response("Bad token", { status: 400 });
  const views = []; let cursor;
  do {
    const l = await env.ORDERS.list({ prefix: `wlv:${token}`, cursor, limit: 1000 });
    for (const k of l.keys) views.push({ token: k.name.split(":")[1], ...(k.metadata || {}) });
    cursor = l.list_complete ? undefined : l.cursor;
  } while (cursor && views.length < 5000);
  return Response.json({ ok: true, views });
}
