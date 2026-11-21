// Webskan – sprawdzenie zależności projektu (strona /zaleznosci/, /en/dependencies/).
// POST /api/deps/check  (multipart: file[] – pliki zależności, text – wklejona treść, lang) → strona wyniku;
//                        z nagłówkiem „accept: application/json” albo ?format=json → JSON (do użycia w CI: curl -F file=@requirements.txt …).
// Plików nie zapisujemy: treść jest czytana w pamięci, do OSV.dev idą tylko nazwy i wersje pakietów.
import { layout } from "./scan.js";
import { parseManifest, checkDeps } from "./deps.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const MAX_BYTES = 3 * 1024 * 1024;
const pn = (n, a, b, c) => `${n} ${n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c}`;

const L = {
  pl: {
    page: "/zaleznosci/", title: "Zależności projektu", back: "Sprawdź inny plik",
    sev: { high: ["poor", "ważne"], medium: ["needs", "warto poprawić"], low: ["good", "drobiazg"] },
    errs: {
      EMPTYFORM: ["Brak pliku", "Wybierz plik zależności albo wklej jego treść."],
      TOOBIG: ["Plik jest za duży", "Limit to 3 MB na jedno sprawdzenie."],
      NEED_LOCK_NPM: ["Potrzebny plik z dokładnymi wersjami", "<code>package.json</code> podaje zakresy wersji (np. <code>^4.18.0</code>), a nie to, co faktycznie jest zainstalowane. Wyślij <code>package-lock.json</code>, <code>yarn.lock</code> albo <code>pnpm-lock.yaml</code>."],
      NEED_LOCK_PY: ["Potrzebny plik z dokładnymi wersjami", "<code>pyproject.toml</code> podaje zakresy wersji. Wyślij <code>poetry.lock</code>, <code>uv.lock</code> albo wynik polecenia <code>pip freeze</code>."],
      PARSE: ["Nie udało się odczytać pliku", "Plik wygląda na uszkodzony albo ma nieobsługiwany format. Obsługujemy: requirements.txt, poetry.lock, uv.lock, pdm.lock, Pipfile.lock, package-lock.json, yarn.lock, pnpm-lock.yaml."],
      EMPTY: ["Nie znaleźliśmy pakietów", "W pliku nie ma pozycji w formie <code>nazwa==wersja</code> ani bloków pliku blokady. Obsługujemy: requirements.txt, poetry.lock, uv.lock, pdm.lock, Pipfile.lock, package-lock.json, yarn.lock, pnpm-lock.yaml."],
      OSV: ["Baza luk chwilowo nie odpowiada", "Spróbuj ponownie za minutę."],
    },
    h1: (v, n) => (v ? `${pn(v, "pakiet ma", "pakiety mają", "pakietów ma")} znane luki` : "Nie znaleźliśmy znanych luk"),
    lead: (v, n, files) => `Sprawdziliśmy ${pn(n, "pakiet", "pakiety", "pakietów")} (${esc(files)}) w bazie znanych luk bezpieczeństwa.`,
    tiles: ["Pakiety", "Z lukami", "Luki ważne"],
    clean: "Żadna z przypiętych wersji nie ma dziś wpisu w bazie luk. Nowe luki ogłaszane są codziennie, także dla wersji, które dziś są czyste.",
    upd: (f) => `zaktualizuj do ${f}`, noFix: "brak wersji z poprawką dla wszystkich luk",
    count: (n, h) => `${pn(n, "znana luka", "znane luki", "znanych luk")}${h ? `, w tym ${h} ${h === 1 ? "ważna" : h < 5 ? "ważne" : "ważnych"}` : ""}.`,
    fixIn: (f) => `poprawka w ${f}`, noFixOne: "bez poprawki", more: (n) => `Pozostałe (${n})`, dev: "tylko środowisko deweloperskie", malicious: "złośliwy pakiet",
    unpinnedH: "Nie sprawdzono pakietów bez przypiętej wersji",
    unpinnedP: (list, n) => `${esc(list)}${n > 12 ? ` i ${n - 12} innych` : ""}. Bez dokładnej wersji nie da się stwierdzić, czy luka dotyczy projektu. Najprościej: <code>pip freeze &gt; requirements.txt</code> na serwerze albo plik blokady (poetry.lock, uv.lock).`,
    truncated: "Lista jest długa: szczegóły pobraliśmy dla pierwszych pakietów, pozostałe mają same identyfikatory z odnośnikiem do bazy.",
    note: "Opisy luk pochodzą z bazy i są po angielsku. Luka w bibliotece nie zawsze oznacza lukę w aplikacji – zależy, czy kod używa podatnej funkcji – ale aktualizacja zamyka temat bez analizy.",
    src: 'Dane: <a href="https://osv.dev/">OSV.dev</a> – GitHub Advisory Database (CC-BY 4.0), PyPA Advisory Database (CC-BY 4.0), OpenSSF Malicious Packages. Pliku nie zapisujemy; do bazy wysłaliśmy tylko nazwy i wersje pakietów.',
  },
  en: {
    page: "/en/dependencies/", title: "Project dependencies", back: "Check another file",
    sev: { high: ["poor", "important"], medium: ["needs", "worth fixing"], low: ["good", "minor"] },
    errs: {
      EMPTYFORM: ["No file", "Choose a dependency file or paste its content."],
      TOOBIG: ["The file is too large", "The limit is 3 MB per check."],
      NEED_LOCK_NPM: ["A file with exact versions is needed", "<code>package.json</code> lists version ranges (e.g. <code>^4.18.0</code>), not what is actually installed. Send <code>package-lock.json</code>, <code>yarn.lock</code> or <code>pnpm-lock.yaml</code>."],
      NEED_LOCK_PY: ["A file with exact versions is needed", "<code>pyproject.toml</code> lists version ranges. Send <code>poetry.lock</code>, <code>uv.lock</code> or the output of <code>pip freeze</code>."],
      PARSE: ["The file could not be read", "It looks damaged or uses an unsupported format. Supported: requirements.txt, poetry.lock, uv.lock, pdm.lock, Pipfile.lock, package-lock.json, yarn.lock, pnpm-lock.yaml."],
      EMPTY: ["No packages found", "The file has no <code>name==version</code> entries or lock-file blocks. Supported: requirements.txt, poetry.lock, uv.lock, pdm.lock, Pipfile.lock, package-lock.json, yarn.lock, pnpm-lock.yaml."],
      OSV: ["The vulnerability database is not responding", "Try again in a minute."],
    },
    h1: (v) => (v ? `${v} ${v === 1 ? "package has" : "packages have"} known vulnerabilities` : "No known vulnerabilities found"),
    lead: (v, n, files) => `We checked ${n} ${n === 1 ? "package" : "packages"} (${esc(files)}) against the database of known security vulnerabilities.`,
    tiles: ["Packages", "Vulnerable", "Important issues"],
    clean: "None of the pinned versions has an entry in the vulnerability database today. New vulnerabilities are published every day, including for versions that are clean today.",
    upd: (f) => `update to ${f}`, noFix: "no version fixes all of them yet",
    count: (n, h) => `${n} known ${n === 1 ? "vulnerability" : "vulnerabilities"}${h ? `, ${h} important` : ""}.`,
    fixIn: (f) => `fixed in ${f}`, noFixOne: "no fix", more: (n) => `The rest (${n})`, dev: "development only", malicious: "malicious package",
    unpinnedH: "Packages without a pinned version were not checked",
    unpinnedP: (list, n) => `${esc(list)}${n > 12 ? ` and ${n - 12} more` : ""}. Without an exact version it is impossible to tell whether a vulnerability applies. Easiest: <code>pip freeze &gt; requirements.txt</code> on the server, or a lock file (poetry.lock, uv.lock).`,
    truncated: "The list is long: details were fetched for the first packages, the rest show identifiers with a link to the database.",
    note: "A vulnerability in a library does not always mean a vulnerability in the application – it depends on whether your code uses the affected function – but updating settles it without analysis.",
    src: 'Data: <a href="https://osv.dev/">OSV.dev</a> – GitHub Advisory Database (CC-BY 4.0), PyPA Advisory Database (CC-BY 4.0), OpenSSF Malicious Packages. The file is not stored; only package names and versions were sent to the database.',
  },
};

function vulnLine(v, t) {
  return `<li><a href="${esc(v.url)}" rel="noopener nofollow">${esc(v.id)}</a>${v.malicious ? ` <span class="badge poor">${t.malicious}</span>` : ""} <span class="badge ${t.sev[v.severity][0]}">${t.sev[v.severity][1]}</span> ${esc(v.summary)}${v.summary ? " · " : ""}<span class="fx">${v.fixed ? t.fixIn(esc(v.fixed)) : t.noFixOne}</span></li>`;
}
export function renderResult(lang, r, meta) {
  const t = L[lang]; const v = r.vulnerable.length, highs = r.vulnerable.reduce((s, p) => s + p.vulns.filter((x) => x.severity === "high").length, 0);
  const tiles = `<div class="grid3 deps-tiles"><div><p>${t.tiles[0]}</p><p class="v">${r.checked}</p></div><div><p>${t.tiles[1]}</p><p class="v${v ? " bad" : " ok"}">${v}</p></div><div><p>${t.tiles[2]}</p><p class="v${highs ? " bad" : " ok"}">${highs}</p></div></div>`;
  const items = r.vulnerable.map((p) => {
    const h = p.vulns.filter((x) => x.severity === "high").length, first = p.vulns.slice(0, 3), rest = p.vulns.slice(3, 40);
    return `<li class="${p.top}"><span class="badge ${t.sev[p.top][0]}">${t.sev[p.top][1]}</span>${p.dev ? ` <span class="badge">${t.dev}</span>` : ""}<b><code>${esc(p.name)}</code> ${esc(p.version)} <span class="arrow">→</span> ${p.fixAll ? t.upd(`<code>${esc(p.fixAll)}</code>`) : t.noFix}</b><p>${t.count(p.vulns.length, h)}</p><ul class="vl">${first.map((x) => vulnLine(x, t)).join("")}</ul>${rest.length ? `<details class="vmore"><summary>${t.more(p.vulns.length - 3)}</summary><ul class="vl">${rest.map((x) => vulnLine(x, t)).join("")}</ul></details>` : ""}</li>`;
  }).join("");
  const unp = meta.unpinned.length ? `<div class="lhfail"><h2>${t.unpinnedH}</h2><p>${t.unpinnedP(meta.unpinned.slice(0, 12).join(", "), meta.unpinned.length)}</p></div>` : "";
  const body = `<section class="hero"><h1>${t.h1(v)}</h1><p class="lead">${t.lead(v, r.checked, meta.files.join(", "))}</p></section>
${tiles}${v ? `<ul class="issues deps">${items}</ul>` : `<div class="lhfail okbox"><p>${t.clean}</p></div>`}${unp}${r.truncated ? `<p class="small muted">${t.truncated}</p>` : ""}
<p class="small muted">${t.note}</p><p class="small muted">${t.src}</p><p><a class="btn sec" href="${t.page}">${t.back}</a></p>`;
  return layout(lang, t.title, body);
}

export async function depsCheck(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST") return Response.redirect(new URL("/zaleznosci/", request.url).href, 302);
  const wantJson = url.searchParams.get("format") === "json" || /application\/json/.test(request.headers.get("accept") || "");
  const len = Number(request.headers.get("content-length") || 0);
  let form = null, lang = "pl";
  const fail = (code, status = 400) => {
    const t = L[lang]; const [title, msg] = t.errs[code];
    if (wantJson) return Response.json({ ok: false, error: code, message: msg.replace(/<[^>]+>/g, "") }, { status });
    const r = layout(lang, title, `<section class="hero"><h1>${title}</h1><p>${msg}</p><p><a class="btn sec" href="${t.page}">${t.back}</a></p></section>`);
    return new Response(r.body, { status, headers: r.headers });
  };
  if (len > MAX_BYTES + 4096) return fail("TOOBIG", 413);
  try { form = await request.formData(); } catch { return fail("EMPTYFORM"); }
  lang = form.get("lang") === "en" ? "en" : "pl";
  if (form.get("website")) return Response.redirect(new URL(L[lang].page, request.url).href, 303); // honeypot
  const inputs = []; let bytes = 0;
  for (const f of form.getAll("file")) { if (f && typeof f === "object" && f.size) { bytes += f.size; if (bytes > MAX_BYTES) return fail("TOOBIG", 413); inputs.push({ name: f.name || "plik", text: await f.text() }); } else if (typeof f === "string" && f.trim()) inputs.push({ name: "plik", text: f }); }
  const pasted = String(form.get("text") || ""); if (pasted.trim()) { bytes += pasted.length; if (bytes > MAX_BYTES) return fail("TOOBIG", 413); inputs.push({ name: lang === "pl" ? "wklejona treść" : "pasted content", text: pasted }); }
  if (!inputs.length) return fail("EMPTYFORM");
  const packages = [], unpinned = [], files = []; let firstErr = null;
  for (const inp of inputs.slice(0, 10)) {
    const m = parseManifest(inp.name, inp.text);
    if (m.error && !m.unpinned.length) { firstErr = firstErr || m.error; continue; }
    files.push(inp.name === "plik" || /wklejona|pasted/.test(inp.name) ? m.format : inp.name.split(/[\\/]/).pop().slice(0, 60));
    packages.push(...m.packages); unpinned.push(...m.unpinned);
  }
  if (!packages.length && !unpinned.length) return fail(firstErr || "EMPTY");
  const uniq = [...new Map(packages.map((p) => [`${p.ecosystem}:${p.name}@${p.version}`, p])).values()].slice(0, 3000);
  let r;
  try { r = uniq.length ? await checkDeps(uniq, { maxDetails: 40 }) : { checked: 0, vulnerable: [], truncated: false, source: "OSV.dev", at: new Date().toISOString() }; }
  catch { return fail("OSV", 502); }
  if (wantJson) return Response.json({ ok: true, files, checked: r.checked, vulnerablePackages: r.vulnerable.length, unpinned: [...new Set(unpinned)], truncated: r.truncated, source: "OSV.dev (GitHub Advisory Database CC-BY 4.0, PyPA Advisory Database CC-BY 4.0)", packages: r.vulnerable.map((p) => ({ ecosystem: p.ecosystem, name: p.name, version: p.version, dev: p.dev, severity: p.top, updateTo: p.fixAll, vulnerabilities: p.vulns.map((x) => ({ id: x.id, aliases: x.aliases, severity: x.severity, summary: x.summary, fixed: x.fixed, url: x.url })) })) }, { headers: { "cache-control": "no-store" } });
  return renderResult(lang, r, { files, unpinned: [...new Set(unpinned)] });
}

// --- Stały dozór zależności (projekty z tokenem) ---
// POST /api/deps/project   (x-scan-key; JSON {token, name})      – rejestracja projektu (laptop: monitor.mjs deps-add) → KV `depsproj:<token>`
// POST /api/deps/push/<token>  (multipart file[] / text)          – z potoku CI: zapis samej listy pakietów (nazwa, wersja) → KV `depsdata:<token>`; odpowiedź = wynik sprawdzenia (JSON)
// GET  /api/deps/export    (x-scan-key)                           – wszystkie listy dla dozoru dziennego (laptop)
const authed = (request, env) => { const k = request.headers.get("x-scan-key") || ""; return Boolean(env.SCAN_KEY) && k.length === env.SCAN_KEY.length && k === env.SCAN_KEY; };
const TOKEN_RE = /^[0-9a-f]{32}$/;

export async function depsProject(request, env) {
  if (!authed(request, env)) return new Response("Unauthorized", { status: 401 });
  const j = await request.json().catch(() => null);
  if (!j || !TOKEN_RE.test(j.token || "")) return new Response("Bad token", { status: 400 });
  if (j.remove) { await env.ORDERS.delete(`depsproj:${j.token}`); await env.ORDERS.delete(`depsdata:${j.token}`); return Response.json({ ok: true, removed: true }); }
  await env.ORDERS.put(`depsproj:${j.token}`, JSON.stringify({ name: String(j.name || "").slice(0, 120), created: new Date().toISOString() }));
  return Response.json({ ok: true });
}

// --- Abonament „Webskan Zależności” (konto z limitem projektów; 3 projekty 79 zł/mies., 10 projektów 149 zł/mies.) ---
// KV `depsacct:<token>` {limit, active, projects:[slug…], created}; listy pakietów: `depsdata:<token>:<slug>`.
// POST   /api/deps/account            (x-scan-key; JSON {token, limit, active, remove}) – zakłada/zmienia konto (poller po płatności, dozór dzienny po końcu abonamentu)
// POST   /api/deps/push/<token>?project=<nazwa>   – wysyła listę pakietów projektu; pierwszy raz = projekt zajmuje miejsce w limicie
// GET    /api/deps/push/<token>                   – stan konta: limit i lista projektów
// DELETE /api/deps/push/<token>?project=<nazwa>   – usuwa projekt (zwalnia miejsce)
// POST   /api/deps/order              (formularz: email, plan=3|10, lang, consent) → checkout Polar
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,59}$/;
export const DEPS_PLANS = { 3: { pln: 79, usd: 25 }, 10: { pln: 149, usd: 45 } };
const noStore = { headers: { "cache-control": "no-store" } };
const jerr = (status, error, message, extra = {}) => Response.json({ ok: false, error, message, ...extra }, { status, headers: { "cache-control": "no-store" } });

export async function depsAccount(request, env) {
  if (!authed(request, env)) return new Response("Unauthorized", { status: 401 });
  const j = await request.json().catch(() => null);
  if (!j || !TOKEN_RE.test(j.token || "")) return new Response("Bad token", { status: 400 });
  const key = `depsacct:${j.token}`; const old = JSON.parse((await env.ORDERS.get(key)) || "null");
  if (j.remove) { for (const s of old?.projects || []) await env.ORDERS.delete(`depsdata:${j.token}:${s}`); await env.ORDERS.delete(key); return Response.json({ ok: true, removed: true }); }
  const acct = { limit: Number(j.limit) === 10 ? 10 : Number(j.limit) === 3 ? 3 : old?.limit || 3, active: j.active === undefined ? old?.active ?? true : Boolean(j.active), projects: old?.projects || [], created: old?.created || new Date().toISOString() };
  await env.ORDERS.put(key, JSON.stringify(acct));
  return Response.json({ ok: true, ...acct });
}

export async function depsPush(request, env, token) {
  token = token.replace(/\/$/, "");
  if (!TOKEN_RE.test(token)) return jerr(404, "UNKNOWN_TOKEN", "Unknown token.");
  const url = new URL(request.url);
  const acct = JSON.parse((await env.ORDERS.get(`depsacct:${token}`)) || "null");
  let dataKey = `depsdata:${token}`, slug = null;
  if (acct) {
    if (request.method === "GET") return Response.json({ ok: true, active: acct.active, limit: acct.limit, used: acct.projects.length, projects: acct.projects }, noStore);
    if (!acct.active) return jerr(402, "SUBSCRIPTION_ENDED", "The subscription has ended; the list was not stored. Renew at https://webskan.com/zaleznosci/#dozor");
    slug = String(url.searchParams.get("project") || "").trim().toLowerCase();
    if (!SLUG_RE.test(slug)) return jerr(400, "PROJECT_NAME", "Add ?project=<name> to the address: 1-60 characters, lowercase letters, digits, dot, dash or underscore, e.g. ?project=shop-backend", { projects: acct.projects });
    dataKey = `depsdata:${token}:${slug}`;
    if (request.method === "DELETE") {
      if (!acct.projects.includes(slug)) return jerr(404, "UNKNOWN_PROJECT", "No such project on this account.", { projects: acct.projects });
      acct.projects = acct.projects.filter((x) => x !== slug);
      await env.ORDERS.put(`depsacct:${token}`, JSON.stringify(acct)); await env.ORDERS.delete(dataKey);
      return Response.json({ ok: true, removed: slug, limit: acct.limit, used: acct.projects.length, projects: acct.projects }, noStore);
    }
    if (request.method !== "POST") return jerr(405, "METHOD", "Use POST (send a list), GET (account status) or DELETE (remove a project).");
    if (!acct.projects.includes(slug) && acct.projects.length >= acct.limit) return jerr(409, "PROJECT_LIMIT", `The plan covers ${acct.limit} projects and all are in use. Remove one (curl -X DELETE "https://webskan.com/api/deps/push/<token>?project=<name>") or change the plan at https://webskan.com/zaleznosci/#dozor`, { limit: acct.limit, projects: acct.projects });
  } else {
    if (request.method !== "POST") return jerr(405, "METHOD", "Use POST.");
    if (!(await env.ORDERS.get(`depsproj:${token}`))) return jerr(404, "UNKNOWN_TOKEN", "Unknown token.");
  }
  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES + 4096) return Response.json({ ok: false, error: "TOOBIG" }, { status: 413 });
  const form = await request.formData().catch(() => null);
  if (!form) return jerr(400, "EMPTYFORM", "Send the dependency file as a multipart field named file, e.g. curl -F file=@requirements.txt …");
  const files = {}, unpinned = []; let err = null, bytes = 0;
  const entries = [...form.getAll("file")]; const pasted = form.get("text"); if (typeof pasted === "string" && pasted.trim()) entries.push(pasted);
  for (const f of entries.slice(0, 10)) {
    const name = typeof f === "object" ? (f.name || "plik") : "plik", text = typeof f === "object" ? await f.text() : f;
    bytes += text.length; if (bytes > MAX_BYTES) return Response.json({ ok: false, error: "TOOBIG" }, { status: 413 });
    const m = parseManifest(name, text);
    if (m.error && !m.unpinned.length) { err = err || m.error; continue; }
    const key = name === "plik" ? m.format : name.split(/[\\/]/).pop().slice(0, 60);
    files[key] = m.packages.map((p) => [p.ecosystem === "npm" ? "n" : "p", p.name, p.version, p.dev ? 1 : 0]); unpinned.push(...m.unpinned);
  }
  if (!Object.keys(files).length) return Response.json({ ok: false, error: err || "EMPTY", message: (L.en.errs[err || "EMPTY"] || ["", ""])[1].replace(/<[^>]+>/g, "") }, { status: 400 });
  // zapis tylko przy zmianie listy (oszczędza dzienny limit zapisów KV, gdy CI wysyła ten sam plik przy każdym buildzie)
  const body = JSON.stringify({ files, unpinned: [...new Set(unpinned)].slice(0, 200) });
  const old = await env.ORDERS.get(dataKey);
  const changed = !old || JSON.parse(old).body !== body;
  if (changed) await env.ORDERS.put(dataKey, JSON.stringify({ body, at: new Date().toISOString() }));
  let created = false;
  if (acct && !acct.projects.includes(slug)) { acct.projects.push(slug); created = true; await env.ORDERS.put(`depsacct:${token}`, JSON.stringify(acct)); }
  const pkgs = Object.values(files).flat().map(([e, name, version, dev]) => ({ ecosystem: e === "n" ? "npm" : "PyPI", name, version, dev: !!dev }));
  const uniq = [...new Map(pkgs.map((p) => [`${p.ecosystem}:${p.name}@${p.version}`, p])).values()];
  let r = null; try { r = await checkDeps(uniq, { maxDetails: 40 }); } catch {}
  return Response.json({ ok: true, stored: true, changed, ...(acct ? { project: slug, newProject: created, limit: acct.limit, used: acct.projects.length } : {}), files: Object.keys(files), packages: uniq.length, unpinned: [...new Set(unpinned)], ...(r ? { vulnerablePackages: r.vulnerable.length, vulnerable: r.vulnerable.map((p) => ({ name: p.name, version: p.version, severity: p.top, updateTo: p.fixAll, ids: p.vulns.map((x) => x.id) })) } : { check: "unavailable" }) }, { headers: { "cache-control": "no-store" } });
}

const OT = {
  pl: { back: '<a href="/zaleznosci/#dozor">Wróć do formularza</a>', badEmail: ["Nieprawidłowy e-mail", "Sprawdź adres e-mail."], noConsent: ["Brak akceptacji regulaminu", "Aby zamówić dozór zależności, zaakceptuj regulamin i politykę prywatności."], fail: ["Coś poszło nie tak", "Nie udało się uruchomić płatności. Spróbuj ponownie za chwilę albo napisz na kontakt@webskan.com."], thanks: "/zaleznosci/dziekujemy/" },
  en: { back: '<a href="/en/dependencies/#watch">Back to the form</a>', badEmail: ["Invalid e-mail", "Please check your e-mail address."], noConsent: ["Terms not accepted", "To order dependency monitoring, please accept the terms and privacy policy."], fail: ["Something went wrong", "We could not start the checkout. Please try again in a moment or write to kontakt@webskan.com."], thanks: "/en/dependencies/thanks/" },
};
export async function depsOrder(request, env) {
  if (request.method !== "POST") return Response.redirect(new URL("/zaleznosci/#dozor", request.url).href, 302); // tylko POST z formularza – crawlery nie tworzą pustych checkoutów
  const form = await request.formData().catch(() => null);
  const lang = form?.get("lang") === "en" ? "en" : "pl"; const t = OT[lang];
  const msg = ([title, text], status = 400) => { const r = layout(lang, title, `<section class="hero"><h1>${title}</h1><p>${text} ${t.back}.</p></section>`); return new Response(r.body, { status, headers: r.headers }); };
  if (!form) return msg(t.fail);
  if (form.get("website")) return Response.redirect(new URL(L[lang].page, request.url).href, 303); // honeypot
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return msg(t.badEmail);
  if (!form.get("consent")) return msg(t.noConsent);
  const plan = String(form.get("plan")) === "10" ? 10 : 3;
  const productId = env[`POLAR_PRODUCT_DEPS${plan}_${lang.toUpperCase()}`];
  if (!env.POLAR_TOKEN || !productId) return msg(t.fail, 503);
  const origin = new URL(request.url).origin, ip = request.headers.get("cf-connecting-ip") || "";
  const r = await fetch(`${env.POLAR_API}/v1/checkouts/`, { method: "POST", headers: { authorization: `Bearer ${env.POLAR_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ products: [productId], customer_email: email, metadata: { product: "deps", plan: String(plan), lang, source: "webskan" }, success_url: `${origin}${t.thanks}?checkout_id={CHECKOUT_ID}`, locale: lang === "pl" ? "pl-PL" : "en-US", currency: lang === "pl" ? "pln" : "usd", customer_ip_address: ip || undefined, allow_discount_codes: true }) });
  if (r.ok) { const c = await r.json(); return Response.redirect(c.url, 303); }
  const err = await r.text();
  await env.ORDERS.put(`error:${Date.now()}`, JSON.stringify({ product: "deps", plan, email, lang, status: r.status, err: err.slice(0, 2000) }), { expirationTtl: 60 * 60 * 24 * 30 });
  if (r.status === 422 && /"customer_email"/.test(err)) return msg(t.badEmail);
  return msg(t.fail, 502);
}
export function depsThanks(lang) {
  return lang === "pl"
    ? layout("pl", "Dziękujemy", `<section class="hero"><h1>Dziękujemy – dozór zależności jest opłacony</h1><p class="lead">W ciągu kilku minut wyślemy na podany adres e-mail z gotowym poleceniem <code>curl</code> dla Twojego potoku CI. Pierwsze wysłanie pliku zakłada projekt i od razu zwraca wynik; od następnego dnia sprawdzamy listę codziennie. Sprawdź też folder spam. Potwierdzenie płatności i fakturę dostaniesz osobno od operatora płatności (Polar).</p><p><a class="btn sec" href="/zaleznosci/">Wróć do sprawdzania zależności</a></p></section>`)
    : layout("en", "Thank you", `<section class="hero"><h1>Thank you – dependency monitoring is paid</h1><p class="lead">Within a few minutes we will e-mail you a ready-to-use <code>curl</code> command for your CI pipeline. The first upload creates the project and returns the result straight away; from the next day we check the list daily. Please check your spam folder too. The payment confirmation and invoice come separately from the payment operator (Polar).</p><p><a class="btn sec" href="/en/dependencies/">Back to the dependency check</a></p></section>`);
}

export async function depsExport(request, env) {
  if (!authed(request, env)) return new Response("Unauthorized", { status: 401 });
  const out = []; let cursor;
  do {
    const l = await env.ORDERS.list({ prefix: "depsdata:", cursor }); cursor = l.list_complete ? null : l.cursor;
    for (const k of l.keys) { const v = await env.ORDERS.get(k.name); if (!v) continue; const j = JSON.parse(v); const id = k.name.slice(9); out.push({ token: id.slice(0, 32), project: id.length > 33 ? id.slice(33) : null, at: j.at, ...JSON.parse(j.body) }); }
  } while (cursor);
  return Response.json({ ok: true, projects: out });
}
