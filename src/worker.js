// Webskan – Worker: statyczne pliki z public/ + /api/order (checkout Polar albo kolejka przedsprzedażowa w KV) + darmowy szybki skan (src/scan.js).
import { startScan, nextScans, scanResult, scanPage, ScanQueue } from "./scan.js";
import { MonitorHub, monitorCron, monitorApi, statusPage } from "./monitor.js";
import { recheckApi, recheckPage } from "./recheck.js";
export { ScanQueue, MonitorHub };
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;

function normalizeUrl(raw) {
  let s = (raw || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (u.username || u.password) return null; // "jan@firma.pl" wpisane w pole adresu to nie strona
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || PRIVATE_HOST.test(host)) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) && !/^xn--/.test(host.split(".").pop())) return null; // host z literową TLD (po IDN→punycode)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  u.hash = "";
  return u.toString();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function page(lang, title, body) {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} – Webskan</title><link rel="stylesheet" href="/style.css"></head><body><div class="wrap"><header><a class="logo" href="${lang === "pl" ? "/" : "/en/"}">web<span>skan</span></a></header><section class="hero"><h1>${title}</h1>${body}</section></div></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

const T = {
  pl: {
    badUrl: ["Nieprawidłowy adres strony", "<p>Podaj publiczny adres w formie <code>https://twojafirma.pl</code>. <a href=\"/#zamow\">Wróć do formularza</a>.</p>"],
    badEmail: ["Nieprawidłowy e-mail", "<p>Sprawdź adres e-mail. <a href=\"/#zamow\">Wróć do formularza</a>.</p>"],
    noConsent: ["Brak akceptacji regulaminu", "<p>Aby zamówić audyt, zaakceptuj regulamin i politykę prywatności. <a href=\"/#zamow\">Wróć do formularza</a>.</p>"],
    saved: ["Zgłoszenie przyjęte", "<p>Dziękujemy! Płatności uruchamiamy w ciągu kilku dni. Gdy tylko będzie można zapłacić, wyślemy na podany e-mail link do płatności dla Twojej strony. Nic nie zostało pobrane.</p><p><a href=\"/\">Wróć na stronę główną</a></p>"],
    fail: ["Coś poszło nie tak", "<p>Nie udało się uruchomić płatności. Spróbuj ponownie za chwilę albo napisz do nas. <a href=\"/#zamow\">Wróć do formularza</a>.</p>"],
    thanksPath: "/dziekujemy/",
  },
  en: {
    badUrl: ["Invalid website address", "<p>Enter a public address such as <code>https://yourcompany.com</code>. <a href=\"/en/#order\">Back to the form</a>.</p>"],
    badEmail: ["Invalid e-mail", "<p>Please check your e-mail address. <a href=\"/en/#order\">Back to the form</a>.</p>"],
    noConsent: ["Terms not accepted", "<p>To order an audit, please accept the terms and privacy policy. <a href=\"/en/#order\">Back to the form</a>.</p>"],
    saved: ["Request received", "<p>Thank you! Payments go live within a few days. As soon as checkout is open we will e-mail you a payment link for your site. Nothing has been charged.</p><p><a href=\"/en/\">Back to the homepage</a></p>"],
    fail: ["Something went wrong", "<p>We could not start the checkout. Please try again in a moment or e-mail us. <a href=\"/en/#order\">Back to the form</a>.</p>"],
    thanksPath: "/en/thanks/",
  },
};

async function handleOrder(request, env) {
  const form = await request.formData();
  const lang = form.get("lang") === "en" ? "en" : "pl";
  const t = T[lang];
  const url = normalizeUrl(form.get("url"));
  const email = (form.get("email") || "").trim().toLowerCase();
  const consent = form.get("consent") === "on" || form.get("consent") === "1";
  const product = form.get("product") === "monitor" ? "monitor" : "audit"; // audit = audyt pogłębiony (jednorazowo), monitor = abonament z audytem na start
  const competitors = String(form.get("competitors") || "").split(/[,\s;]+/).map((c) => normalizeUrl(c)).filter(Boolean).slice(0, 2);
  if (form.get("website")) return page(lang, ...t.saved); // honeypot: udajemy sukces
  if (!url) return page(lang, ...t.badUrl);
  if (!EMAIL_RE.test(email) || email.length > 254) return page(lang, ...t.badEmail);
  if (!consent) return page(lang, ...t.noConsent);

  const origin = new URL(request.url).origin;
  const ip = request.headers.get("cf-connecting-ip") || "";
  const record = { url, email, lang, product, competitors, ip, ua: request.headers.get("user-agent") || "", at: new Date().toISOString() };

  // Produkty Polar: POLAR_PRODUCT_AUDIT_{PL,EN}, POLAR_PRODUCT_MONITOR_{PL,EN}; stare POLAR_PRODUCT_{PL,EN} jako zapas dla audytu
  const L = lang.toUpperCase();
  const productId = product === "monitor" ? env[`POLAR_PRODUCT_MONITOR_${L}`] : (env[`POLAR_PRODUCT_AUDIT_${L}`] || env[`POLAR_PRODUCT_${L}`]);
  if (env.POLAR_TOKEN && productId && env.SALES_MODE !== "presale") { // SALES_MODE=presale do czasu zatwierdzenia konta Polar
    const body = {
      products: [productId],
      customer_email: email,
      metadata: { url, lang, product, competitors: competitors.join(","), source: "webskan" },
      success_url: `${origin}${t.thanksPath}?checkout_id={CHECKOUT_ID}`,
      locale: lang === "pl" ? "pl-PL" : "en-US",
      customer_ip_address: ip || undefined,
    };
    const r = await fetch(`${env.POLAR_API}/v1/checkouts/`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.POLAR_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const checkout = await r.json();
      await env.ORDERS.put(`checkout:${checkout.id}`, JSON.stringify({ ...record, checkout_id: checkout.id }), { expirationTtl: 60 * 60 * 24 * 90 });
      return Response.redirect(checkout.url, 303);
    }
    const err = await r.text();
    await env.ORDERS.put(`error:${Date.now()}`, JSON.stringify({ ...record, status: r.status, err: err.slice(0, 2000) }), { expirationTtl: 60 * 60 * 24 * 30 });
    return page(lang, ...t.fail);
  }

  // Przedsprzedaż: zapis zgłoszenia, bez płatności.
  await env.ORDERS.put(`pre:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`, JSON.stringify(record));
  return page(lang, ...t.saved);
}

const SECURITY_HEADERS = {
  "strict-transport-security": "max-age=15552000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://polar.sh https://*.polar.sh",
};
function secure(res) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

const CANONICAL_HOST = "webskan.com";

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    if (u.protocol === "http:") { u.protocol = "https:"; return Response.redirect(u.toString(), 301); }
    // Jeden kanoniczny host: www i stary adres workers.dev przekierowują na webskan.com (API bez przekierowania, żeby nie psuć pollera i formularzy POST).
    if (u.hostname !== CANONICAL_HOST && !u.pathname.startsWith("/api/")) { u.hostname = CANONICAL_HOST; return Response.redirect(u.toString(), 301); }
    return secure(await route(request, env, u.pathname));
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(monitorCron(env)); }, // co minutę: kontrola dostępności monitorowanych stron
};

async function route(request, env, pathname) {
  {
    if (pathname === "/api/order") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      try { return await handleOrder(request, env); }
      catch (e) { return page("pl", "Błąd", `<p>${String(e.message || e)}</p>`); }
    }
    if (pathname === "/api/scan" && request.method === "POST") return startScan(request, env, normalizeUrl);
    if (pathname === "/api/scan/next") return nextScans(request, env);
    if (pathname === "/api/scan/result" && request.method === "POST") return scanResult(request, env);
    { const m = pathname.match(/^\/skan\/([0-9a-f]+)\/?$/); if (m) return scanPage(request, env, "pl", m[1]); }
    { const m = pathname.match(/^\/en\/scan\/([0-9a-f]+)\/?$/); if (m) return scanPage(request, env, "en", m[1]); }
    if (pathname.startsWith("/api/monitor")) return monitorApi(request, env, pathname, normalizeUrl);
    if (pathname.startsWith("/api/recheck")) return recheckApi(request, env, pathname);
    { const m = pathname.match(/^\/recheck\/([0-9a-f]{32})\/?$/); if (m) return recheckPage(request, env, "pl", m[1]); }
    { const m = pathname.match(/^\/en\/recheck\/([0-9a-f]{32})\/?$/); if (m) return recheckPage(request, env, "en", m[1]); }
    { const m = pathname.match(/^\/status\/([0-9a-f]{32})\/?$/); if (m) return statusPage(env, "pl", m[1]); }
    { const m = pathname.match(/^\/en\/status\/([0-9a-f]{32})\/?$/); if (m) return statusPage(env, "en", m[1]); }
    if (pathname === "/api/health") return Response.json({ ok: true, polar: Boolean(env.POLAR_TOKEN && env.POLAR_PRODUCT_PL), mode: env.SALES_MODE || "live" });
    const res = await env.ASSETS.fetch(request);
    if (env.SALES_MODE === "presale" && (pathname === "/" || pathname === "/en/")) return presaleRewrite(res, pathname === "/en/" ? "en" : "pl");
    return res;
  }
}

// Tryb przedsprzedaży: ten sam statyczny HTML, ale uczciwy przycisk i notka (bez „przejdź do płatności”, gdy Polar jeszcze nie przyjmuje płatności).
const PRESALE = {
  pl: { btn: "Zarezerwuj (płatność po uruchomieniu)", note: "Płatności uruchamiamy w najbliższych dniach. Zostaw adres strony i e-mail, a wyślemy Ci link do płatności. Nic nie pobieramy teraz." },
  en: { btn: "Reserve (pay when checkout opens)", note: "Payments go live within days. Leave your URL and e-mail and we will send you a payment link. Nothing is charged now." },
};
function presaleRewrite(res, lang) {
  const t = PRESALE[lang];
  return new HTMLRewriter()
    .on("button[data-cta=order]", { element(el) { el.setInnerContent(t.btn); } })
    .on("p[data-presale-note]", { element(el) { el.setInnerContent(t.note); } })
    .transform(res);
}
