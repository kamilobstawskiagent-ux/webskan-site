// Webskan dla agencji (white-label): zgłoszenie próby + hostowanie raportów pod marką agencji.
// POST /api/agency/trial   – formularz ze strony /agencje/ (agency, email, url, logo = strona studia [wymagana], note, consent, plan=trial|paid, website=honeypot, src); plan=paid → checkout Polar (POLAR_PRODUCT_AGENCY) → KV `pw:agency:<id>` + flaga pw-dirty;
//                            poller zamówień (orders/poll.mjs) odbiera to przez /api/polar/pending i budzi agenta (realizacja prób ręcznie w sesji).
// POST /api/agency/report?token=<32 hex>  (x-scan-key) – treść HTML raportu → KV `wl:<token>` (TTL 90 dni).
// GET  /r/<token>          – raport HTML pod marką agencji (noindex).
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
  const paid = form.get("plan") === "paid";
  // Limit: 5 zgłoszeń na godzinę z jednego adresu IP.
  const ip = request.headers.get("cf-connecting-ip") || "0";
  const rlKey = `agrl:${ip}:${Math.floor(Date.now() / 3600000)}`;
  const n = Number(await env.ORDERS.get(rlKey)) || 0;
  if (n >= 5) return bad("Za dużo zgłoszeń", "Z tego adresu przyszło już kilka zgłoszeń w ostatniej godzinie. Napisz na kontakt@webskan.com.");
  await env.ORDERS.put(rlKey, String(n + 1), { expirationTtl: 7200 });
  if (paid) { // plan 149 zł/mies. od razu: checkout Polar w PLN; zamówienie odbiera poller (product: agency)
    if (!env.POLAR_TOKEN || !env.POLAR_PRODUCT_AGENCY || env.SALES_MODE === "presale") return bad("Płatność chwilowo niedostępna", "Napisz na kontakt@webskan.com – wyślemy link do płatności.");
    const origin = new URL(request.url).origin;
    const r = await fetch(`${env.POLAR_API}/v1/checkouts/`, { method: "POST", headers: { authorization: `Bearer ${env.POLAR_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ products: [env.POLAR_PRODUCT_AGENCY], customer_email: email, currency: "pln", locale: "pl-PL", customer_ip_address: ip !== "0" ? ip : undefined,
        success_url: `${origin}/agencje/dziekujemy/`, metadata: { product: "agency", agency: agency.slice(0, 120), url, site, source: "webskan", ...(note ? { note: note.slice(0, 400) } : {}) } }) });
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

export async function agencyReportGet(env, token) {
  const html = await env.ORDERS.get(`wl:${token}`);
  if (!html) return null;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "private, max-age=300" } });
}
