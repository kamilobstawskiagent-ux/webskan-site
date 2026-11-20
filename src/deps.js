// Webskan – sprawdzenie zależności projektu (Python / Node.js) w bazie znanych luk OSV.dev.
// Czysty JS bez API Node – działa w Workerze (strona /zaleznosci/) i na laptopie (Monitor zależności, orders/monitor.mjs).
// parseManifest(nazwa, tekst) → { format, ecosystem, packages:[{ecosystem,name,version,dev}], unpinned:[nazwy], error }
// checkDeps(packages, { fetch, maxDetails, cache }) → { checked, vulnerable:[{ecosystem,name,version,dev,vulns:[…]}], truncated, source }
// Źródła: OSV.dev (GitHub Advisory Database CC-BY 4.0, PyPA Advisory Database CC-BY 4.0, OpenSSF Malicious Packages Apache-2.0).

const pyName = (n) => String(n).trim().toLowerCase().replace(/[-_.]+/g, "-");
const MAX_PACKAGES = 3000;

function parseRequirements(text) {
  const packages = [], unpinned = [];
  const lines = String(text).replace(/\\\r?\n/g, " ").split(/\r?\n/);
  for (let raw of lines) {
    let l = raw.replace(/(^|\s)#.*$/, "").trim();
    if (!l || l.startsWith("-") || /^(https?:|git\+|file:|\.{0,2}\/)/i.test(l)) continue; // opcje pip, adresy, ścieżki
    l = l.split(";")[0].replace(/\s--hash=\S+/g, "").trim(); // znaczniki środowiska, skróty
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*(.*)$/.exec(l);
    if (!m) continue;
    const pin = /^(===?)\s*([A-Za-z0-9][A-Za-z0-9.!+_-]*)\s*$/.exec(m[3]);
    if (pin && !pin[2].includes("*")) packages.push({ ecosystem: "PyPI", name: pyName(m[1]), version: pin[2], dev: false });
    else unpinned.push(pyName(m[1]));
  }
  return { format: "requirements.txt", ecosystem: "PyPI", packages, unpinned };
}

// poetry.lock / uv.lock / pdm.lock: bloki [[package]] z polami name i version (TOML – czytamy tylko te dwa pola)
function parseTomlLock(text, format) {
  const packages = [];
  for (const block of String(text).split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const head = block.split(/^\[/m)[0];
    const name = /^name\s*=\s*"([^"]+)"/m.exec(head), version = /^version\s*=\s*"([^"]+)"/m.exec(head);
    if (!name || !version) continue;
    const dev = /^category\s*=\s*"dev"/m.test(head) || /^groups\s*=\s*\[\s*"dev"\s*\]/m.test(head);
    packages.push({ ecosystem: "PyPI", name: pyName(name[1]), version: version[1], dev });
  }
  return { format, ecosystem: "PyPI", packages, unpinned: [] };
}

function parsePipfileLock(j) {
  const packages = [], unpinned = [];
  for (const [sec, dev] of [["default", false], ["develop", true]]) for (const [name, v] of Object.entries(j[sec] || {})) {
    const ver = typeof v?.version === "string" ? v.version.replace(/^==/, "") : null;
    if (ver && !/[<>*~,]/.test(ver)) packages.push({ ecosystem: "PyPI", name: pyName(name), version: ver, dev }); else unpinned.push(pyName(name));
  }
  return { format: "Pipfile.lock", ecosystem: "PyPI", packages, unpinned };
}

function parsePackageLock(j) {
  const packages = [];
  if (j.packages && typeof j.packages === "object") { // lockfileVersion 2/3
    for (const [key, v] of Object.entries(j.packages)) {
      if (!key || !v || typeof v.version !== "string" || v.link) continue;
      const i = key.lastIndexOf("node_modules/"); if (i < 0) continue;
      packages.push({ ecosystem: "npm", name: v.name || key.slice(i + 13), version: v.version, dev: !!v.dev });
    }
  } else if (j.dependencies && typeof j.dependencies === "object") { // lockfileVersion 1
    const walk = (deps) => { for (const [name, v] of Object.entries(deps || {})) { if (v && typeof v.version === "string" && /^\d/.test(v.version)) packages.push({ ecosystem: "npm", name, version: v.version, dev: !!v.dev }); if (v?.dependencies) walk(v.dependencies); } };
    walk(j.dependencies);
  }
  return { format: "package-lock.json", ecosystem: "npm", packages, unpinned: [] };
}

function parseYarnLock(text) {
  const packages = [];
  const re = /^("?)((?:@[^/@"\s]+\/)?[^@"\s,]+)@[^\n]*:\r?\n(?:[ \t]+[^\n]*\r?\n)*?[ \t]+version:?\s+"?([^"\s]+)"?/gm; // yarn 1 („version "x"”) i berry („version: x”)
  let m; while ((m = re.exec(text))) if (/^\d/.test(m[3])) packages.push({ ecosystem: "npm", name: m[2], version: m[3], dev: false });
  return { format: "yarn.lock", ecosystem: "npm", packages, unpinned: [] };
}

function parsePnpmLock(text) {
  const packages = [];
  const sec = /^packages:\s*$([\s\S]*?)(?=^\S|\Z)/m.exec(text + "\n\u0000");
  const body = sec ? sec[1] : "";
  const re = /^ {2}'?\/?((?:@[^/@'\s]+\/)?[^@'\s/]+)[@/](\d[^'\s:()]*)(?:\([^\n]*\))?'?:\s*$/gm; // „/name@1.2.3:”, „name@1.2.3:”, starsze „/name/1.2.3:”
  let m; while ((m = re.exec(body))) packages.push({ ecosystem: "npm", name: m[1], version: m[2].replace(/_.*$/, ""), dev: false });
  return { format: "pnpm-lock.yaml", ecosystem: "npm", packages, unpinned: [] };
}

export function parseManifest(filename, text) {
  const name = String(filename || "").split(/[\\/]/).pop().toLowerCase();
  const t = String(text || "").replace(/^﻿/, "");
  const trimmed = t.trimStart();
  let r = null;
  try {
    if (name === "pipfile.lock" || (trimmed.startsWith("{") && /"_meta"\s*:/.test(t.slice(0, 400)))) r = parsePipfileLock(JSON.parse(t));
    else if (/^(package-lock|npm-shrinkwrap)\.json$/.test(name) || (trimmed.startsWith("{") && /"lockfileVersion"\s*:/.test(t.slice(0, 2000)))) r = parsePackageLock(JSON.parse(t));
    else if (name === "package.json" || (trimmed.startsWith("{") && /"(dependencies|devDependencies)"\s*:/.test(t))) return { format: "package.json", packages: [], unpinned: [], error: "NEED_LOCK_NPM" };
    else if (name === "pyproject.toml" || /^\[(tool\.poetry|project|build-system)\]/m.test(t) && !/^\[\[package\]\]/m.test(t)) return { format: "pyproject.toml", packages: [], unpinned: [], error: "NEED_LOCK_PY" };
    else if (/^\[\[package\]\]\s*$/m.test(t)) r = parseTomlLock(t, name === "uv.lock" ? "uv.lock" : name === "pdm.lock" ? "pdm.lock" : "poetry.lock");
    else if (name === "pnpm-lock.yaml" || /^lockfileVersion:/m.test(t)) r = parsePnpmLock(t);
    else if (name === "yarn.lock" || /^# yarn lockfile v1|^__metadata:/m.test(t)) r = parseYarnLock(t);
    else r = parseRequirements(t);
  } catch (e) { return { format: name || "?", packages: [], unpinned: [], error: "PARSE" }; }
  // bez powtórek (to samo name@version bywa w drzewie wiele razy); dev tylko, gdy każde wystąpienie jest dev
  const seen = new Map();
  for (const p of r.packages) { const k = `${p.name}@${p.version}`; const old = seen.get(k); if (old) old.dev = old.dev && p.dev; else seen.set(k, { ...p }); }
  r.packages = [...seen.values()].slice(0, MAX_PACKAGES); r.truncatedPackages = seen.size > MAX_PACKAGES;
  r.unpinned = [...new Set(r.unpinned)];
  if (!r.packages.length && !r.unpinned.length) r.error = "EMPTY";
  return r;
}

// Porównanie wersji wystarczające do wyboru „najbliższej wersji z poprawką” (PEP 440 / semver: liczby po kropkach, wydania wstępne niżej)
export function cmpVer(a, b) {
  const norm = (v) => { const s = String(v).toLowerCase().replace(/^v/, "").split("+")[0]; const m = /^(\d+!)?([0-9]+(?:\.[0-9]+)*)(.*)$/.exec(s); if (!m) return { n: [0], pre: s }; return { n: m[2].split(".").map(Number), pre: m[3].replace(/^[-._]/, "") }; };
  const A = norm(a), B = norm(b);
  for (let i = 0; i < Math.max(A.n.length, B.n.length); i++) { const d = (A.n[i] || 0) - (B.n[i] || 0); if (d) return d < 0 ? -1 : 1; }
  const rank = (p) => (!p ? 0 : /^post/.test(p) ? 1 : -1); // wydanie wstępne (a, b, rc, dev, alpha…) < wydanie < post
  if (rank(A.pre) !== rank(B.pre)) return rank(A.pre) < rank(B.pre) ? -1 : 1;
  return A.pre === B.pre ? 0 : A.pre < B.pre ? -1 : 1;
}

// opis: jedno zdanie, najwyżej ok. 200 znaków, bez urwanego słowa
const shortText = (t) => { t = String(t).replace(/\s+/g, " ").trim(); if (t.length <= 200) return t; const first = /^(.{40,200}?[.!?])\s/.exec(t); return first ? first[1] : t.slice(0, 190).replace(/\s+\S*$/, "") + "…"; };
const SEV_RANK = { high: 0, medium: 1, low: 2 };
function summarize(rec, pkg) {
  const ids = [rec.id, ...(rec.aliases || [])];
  const cve = ids.find((x) => /^CVE-/.test(x)) || null, ghsa = ids.find((x) => /^GHSA-/.test(x)) || null;
  const malicious = /^MAL-/.test(rec.id);
  const label = String(rec.database_specific?.severity || "").toUpperCase();
  const vector = (rec.severity || []).find((s) => /^CVSS_V[34]/.test(s.type))?.score || "";
  const noLogin = /\/PR:N/.test(vector) ? true : /\/PR:[LH]/.test(vector) ? false : null;
  const network = /\/AV:N/.test(vector) ? true : vector ? false : null;
  let sev = malicious ? "high" : label === "CRITICAL" || label === "HIGH" ? "high" : label === "MODERATE" || label === "MEDIUM" ? "medium" : label === "LOW" ? "low" : "medium";
  // najbliższa wersja z poprawką dla tego pakietu
  let fixed = null;
  for (const a of rec.affected || []) {
    if (!a.package || a.package.ecosystem !== pkg.ecosystem) continue;
    const an = pkg.ecosystem === "PyPI" ? pyName(a.package.name) : a.package.name;
    if (an !== pkg.name) continue;
    for (const r of a.ranges || []) { if (r.type === "GIT") continue; for (const ev of r.events || []) if (ev.fixed && cmpVer(ev.fixed, pkg.version) > 0 && (!fixed || cmpVer(ev.fixed, fixed) < 0)) fixed = ev.fixed; }
  }
  return { id: cve || ghsa || rec.id, osv: rec.id, cve, ghsa, aliases: ids, summary: shortText(rec.summary || String(rec.details || "").split("\n")[0] || ""), severity: sev, label: label || null, noLogin, network, malicious, fixed, published: (rec.published || "").slice(0, 10), url: `https://osv.dev/vulnerability/${rec.id}` };
}

// cache: opcjonalnie { get(klucz) → lista rekordów|undefined, set(klucz, lista) }, klucz „ekosystem:nazwa@wersja” – laptop może trzymać odpowiedzi OSV na dysku (krótko: nowe luki muszą być widoczne)
export async function checkDeps(packages, { fetch: f = fetch, maxDetails = Infinity, cache = null, api = "https://api.osv.dev" } = {}) {
  const hits = []; // { pkg, ids }
  for (let i = 0; i < packages.length; i += 1000) {
    const chunk = packages.slice(i, i + 1000);
    const r = await f(`${api}/v1/querybatch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ queries: chunk.map((p) => ({ package: { name: p.name, ecosystem: p.ecosystem }, version: p.version })) }) });
    if (!r.ok) throw new Error(`OSV querybatch HTTP ${r.status}`);
    const j = await r.json();
    (j.results || []).forEach((res, k) => { const ids = (res.vulns || []).map((v) => v.id); if (ids.length) hits.push({ pkg: chunk[k], ids }); });
  }
  // szczegóły: jedno zapytanie /v1/query na pakiet z lukami (zwraca pełne rekordy) – mieści się w limicie podzapytań Workera;
  // pakiety ponad limit maxDetails zostają z samymi identyfikatorami (partial)
  const recs = new Map(); let fetched = 0, truncated = false;
  const getPkg = async (h) => {
    const key = `${h.pkg.ecosystem}:${h.pkg.name}@${h.pkg.version}`;
    let list = cache && await cache.get(key);
    if (!list) {
      if (fetched >= maxDetails) { truncated = true; return; }
      list = []; let token = null;
      do {
        if (fetched >= maxDetails) { truncated = true; break; }
        fetched++;
        const r = await f(`${api}/v1/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ package: { name: h.pkg.name, ecosystem: h.pkg.ecosystem }, version: h.pkg.version, ...(token ? { page_token: token } : {}) }) });
        if (!r.ok) break;
        const j = await r.json(); list.push(...(j.vulns || [])); token = j.next_page_token || null;
      } while (token);
      // do pamięci podręcznej tylko pola, których używamy
      list = list.map((v) => ({ id: v.id, aliases: v.aliases, summary: v.summary, details: v.summary ? undefined : String(v.details || "").slice(0, 300), severity: v.severity, database_specific: v.database_specific ? { severity: v.database_specific.severity } : undefined, affected: (v.affected || []).map((a) => ({ package: a.package, ranges: (a.ranges || []).filter((r) => r.type !== "GIT") })), published: v.published, withdrawn: v.withdrawn }));
      if (cache && list.length) await cache.set(key, list);
    }
    for (const v of list) recs.set(v.id, v);
  };
  for (let i = 0; i < hits.length; i += 6) await Promise.all(hits.slice(i, i + 6).map(getPkg));
  const vulnerable = [];
  for (const h of hits) {
    const vulns = [], seenAlias = new Set(), unknown = [];
    for (const id of h.ids) {
      const rec = recs.get(id); if (!rec) { unknown.push(id); continue; }
      if (rec.withdrawn) continue;
      const s = summarize(rec, h.pkg);
      if (s.aliases.some((a) => seenAlias.has(a))) { // ta sama luka z innej bazy – uzupełnij brakujące pola
        const old = vulns.find((v) => v.aliases.some((a) => s.aliases.includes(a)));
        if (old) { old.aliases = [...new Set([...old.aliases, ...s.aliases])]; if (!old.cve && s.cve) { old.cve = s.cve; old.id = s.cve; } if (!old.fixed && s.fixed) old.fixed = s.fixed; if (!old.label && s.label) { old.label = s.label; old.severity = s.severity; } if (old.noLogin == null) old.noLogin = s.noLogin; }
        continue;
      }
      s.aliases.forEach((a) => seenAlias.add(a)); vulns.push(s);
    }
    for (const id of unknown) if (!seenAlias.has(id)) vulns.push({ id, osv: id, cve: null, ghsa: null, aliases: [id], summary: "", severity: "medium", label: null, noLogin: null, network: null, malicious: /^MAL-/.test(id), fixed: null, published: "", url: `https://osv.dev/vulnerability/${id}`, partial: true });
    if (!vulns.length) continue;
    vulns.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || (b.published > a.published ? 1 : -1));
    // wersja, która usuwa wszystkie znane luki tej wersji pakietu (tylko gdy każda ma poprawkę)
    const fixAll = vulns.every((v) => v.fixed) ? vulns.map((v) => v.fixed).reduce((a, b) => (cmpVer(a, b) >= 0 ? a : b)) : null;
    vulnerable.push({ ...h.pkg, vulns, fixAll, top: vulns[0].severity });
  }
  vulnerable.sort((a, b) => SEV_RANK[a.top] - SEV_RANK[b.top] || (a.dev ? 1 : 0) - (b.dev ? 1 : 0) || b.vulns.length - a.vulns.length || a.name.localeCompare(b.name));
  return { checked: packages.length, vulnerable, truncated, source: "OSV.dev", at: new Date().toISOString() };
}
