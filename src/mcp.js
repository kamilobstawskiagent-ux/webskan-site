// Webskan MCP – zdalny serwer MCP (Streamable HTTP, bezstanowy) pod /mcp dla agentów kodujących.
// Narzędzia: scan_website (szybki skan, czeka do 90 s), audit_website / get_audit / recheck_website (pełny audyt przez kolejkę w DO + poller).
// Na każde żądanie nowy McpServer + transport (stateless, bez sesji). Teksty dla agenta po angielsku.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import { z } from 'zod';
import { ISSUE_TEXT_EN, SCAN_STALE_MS, scanStore } from './scan.js';
import { normalizeUrl, hostOf } from './url.js';

const SITE = 'https://webskan.com';
const SCAN_WAIT_MS = 90000, SCAN_POLL_MS = 2000;
const SCAN_RL_IP = 10, SCAN_RL_GLOBAL = 120;                 // jak formularz: 10/h/IP, 120/h globalnie
const AUDIT_FREE_PER_IP = 2, AUDIT_PAID_PER_KEY = 30;        // audyty / 24 h
const AUDIT_HOST_WINDOW_MS = 24 * 3600000;                   // plan free: 1 audyt / host / 24 h (drugi zwraca istniejący)
const DAY_MS = 24 * 3600000, LK_CACHE_S = 3600;
const MAX_PAGES = 30, DEFAULT_PAGES = 15;
const SEV_ORDER = { high: 0, medium: 1, low: 2, info: 3 };
const VOLATILE = /^perf\.(score|lcp|cls|tbt|weight)\.mobile$/; // metryki Lighthouse wahają się – nie są „fixed/new”

const INSTRUCTIONS = `Webskan checks a live, publicly reachable website the way a technical auditor would – use it right after deploying to verify the result.

Tools:
- scan_website: quick scan of one page (~30-60 s): Lighthouse mobile scores and metrics (LCP, CLS, TBT, weight, requests) plus HTTPS/TLS, security headers, title/meta/H1/alt/viewport/canonical/Open Graph checks. Results for the same host are cached for 24 h.
- audit_website: full technical audit of the whole site, asynchronous (1-5 min): crawl of up to 30 pages, broken links, per-page SEO, Lighthouse mobile+desktop, WCAG/axe accessibility, security, platform detection, customer journeys. Returns an auditId; poll get_audit every 20-30 s.
- get_audit: status or result of an audit (findings sorted high→low with page URLs). For a re-check it also returns a diff: fixed / still open / new / unverified.
- recheck_website: runs the same audit again (same URL and page count) and diffs it against the original – call it after you have deployed fixes.

Free limits (no key): scan_website 10/h per IP; audit_website/recheck_website 2 per IP per 24 h and 1 audit per host per 24 h (a second call for the same host returns the existing audit). With a Webskan Developer license key (Authorization: Bearer <key>): 30 audits per 24 h.
Lighthouse performance scores vary by a few points between runs – treat ±5 as noise and look at the direction, not single points. All audits are read-only and look at the public version of the site. Only public hosts are accepted (no localhost, private IPs or .local). Docs: ${SITE}/developers/`;

const text = (s) => ({ type: 'text', text: s });
const errResult = (msg, extra = {}) => ({ content: [text(msg)], structuredContent: { error: msg, ...extra }, isError: true });
const okResult = (md, structured) => ({ content: [text(md)], structuredContent: structured });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (Array.isArray(v[k]) ? v[k].join(', ') : v[k] ?? ''));
const newId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(s, bytes = 32) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].slice(0, bytes).map((b) => b.toString(16).padStart(2, '0')).join(''); }
const fmtKB = (b) => (b == null ? '–' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');
const fmtS = (ms) => (ms == null ? '–' : (ms / 1000).toFixed(1) + ' s');
const sortFindings = (fs) => [...fs].sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
const summarize = (fs) => fs.reduce((acc, f) => { acc.total++; acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, { total: 0, high: 0, medium: 0, low: 0, info: 0 });
const etaFor = (pages, ahead) => 30 + pages * 6 + ahead * 120;
const BAD_URL = 'Invalid URL: give a public website address such as https://example.com (no localhost, private IPs, .local/.internal hosts or credentials in the URL).';

// --- Plan (Polar license key) ---------------------------------------------------------------------------------
// Authorization: Bearer <klucz>. Klucz = Polar license key produktu „Webskan Developer” (walidacja przez publiczny endpoint customer-portal,
// wynik w KV ORDERS pod lk:<sha256> na 1 h). Brak/nieprawidłowy klucz = plan free (nie błąd). SCAN_KEY (nasz sekret pollera) też daje plan developer – do testów.
async function resolvePlan(request, env) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
  if (!m) return { plan: 'free', keyHash: null };
  const key = m[1];
  if (env.SCAN_KEY && key.length === env.SCAN_KEY.length && key === env.SCAN_KEY) return { plan: 'developer', keyHash: 'internal', internal: true };
  const keyHash = await sha256(key);
  const cacheKey = `lk:${keyHash}`;
  try {
    const cached = await env.ORDERS.get(cacheKey, 'json');
    if (cached && cached.until > Date.now()) return { plan: cached.plan, keyHash, keyInvalid: cached.plan === 'free' ? cached.reason : undefined };
  } catch {}
  let plan = 'free', reason = 'license key not recognised', ttl = LK_CACHE_S;
  if (env.POLAR_ORG_ID) {
    try {
      const r = await fetch(`${env.POLAR_API || 'https://api.polar.sh'}/v1/customer-portal/license-keys/validate`, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ key, organization_id: env.POLAR_ORG_ID }),
      });
      if (r.ok) {
        const lk = await r.json();
        if (lk.status === 'granted' && (!lk.expires_at || new Date(lk.expires_at) > Date.now())) plan = 'developer';
        else reason = `license key status: ${lk.status || 'unknown'}${lk.expires_at ? ` (expires ${lk.expires_at})` : ''}`;
      } else if (r.status === 404) reason = 'license key not found, revoked or expired';
      else { reason = `license check unavailable (HTTP ${r.status})`; ttl = 300; }
    } catch (e) { reason = `license check failed: ${String(e.message || e).slice(0, 100)}`; ttl = 300; }
  } else reason = 'license keys are not enabled yet';
  try { await env.ORDERS.put(cacheKey, JSON.stringify({ plan, reason, until: Date.now() + ttl * 1000 }), { expirationTtl: ttl }); } catch {}
  return { plan, keyHash, keyInvalid: plan === 'free' ? reason : undefined };
}

// --- scan_website ---------------------------------------------------------------------------------------------
function scanIssues(result) {
  return (result.issues || []).map((i) => {
    const d = ISSUE_TEXT_EN[i.code];
    return d ? { code: i.code, severity: i.sev, title: fill(d[0], i), detail: fill(d[1], i) } : { code: i.code, severity: i.sev, title: i.code, detail: '' };
  });
}
function scanStructured(job, cached) {
  const r = job.result || {}, lh = r.lighthouse || {}, m = lh.metrics || {};
  const a11y = (lh.failed?.accessibility || []).map((x) => x.title).filter(Boolean);
  return {
    status: 'done', cached, scanId: job.id, url: job.url, finalUrl: r.http?.finalUrl || job.url, scannedAt: job.finishedAt,
    scores: lh.scores || {},
    metrics: { lcpMs: m.LCP ?? null, cls: m.CLS ?? null, tbtMs: m.TBT ?? null, weightBytes: m.totalBytes ?? null, requests: m.requests ?? null },
    issues: scanIssues(r),
    accessibilityFailures: a11y,
    resultUrl: `${SITE}/en/scan/${job.id}`,
  };
}
function scanMarkdown(s) {
  const sc = s.scores, m = s.metrics;
  const lines = [`# Quick scan: ${hostOf(s.url)}${s.cached ? ` (cached result from ${s.scannedAt})` : ''}`,
    `Lighthouse (mobile): Performance ${sc.performance ?? '–'} · Accessibility ${sc.accessibility ?? '–'} · Best practices ${sc['best-practices'] ?? '–'} · SEO ${sc.seo ?? '–'}`,
    `LCP ${fmtS(m.lcpMs)} · CLS ${m.cls == null ? '–' : m.cls.toFixed(3)} · TBT ${m.tbtMs == null ? '–' : Math.round(m.tbtMs) + ' ms'} · weight ${fmtKB(m.weightBytes)} · ${m.requests ?? '–'} requests`, ''];
  if (s.issues.length) { lines.push(`Issues (${s.issues.length}):`); for (const i of s.issues) lines.push(`- [${i.severity}] ${i.title}${i.detail ? ` — ${i.detail}` : ''}`); }
  else lines.push('Basic checks: no issues found.');
  if (s.accessibilityFailures.length) lines.push('', `Lighthouse accessibility audits failing: ${s.accessibilityFailures.join('; ')}.`);
  lines.push('', `Full result page: ${s.resultUrl}`, 'Scores vary by a few points between runs. For the whole site (broken links, per-page SEO, WCAG, journeys) call audit_website.');
  return lines.join('\n');
}
async function scanWebsite({ url: raw }, ctx) {
  const url = normalizeUrl(raw);
  if (!url) return errResult(BAD_URL);
  const host = hostOf(url), db = scanStore(ctx.env);
  const cached = await db.latestDone(host);
  if (cached) { const s = scanStructured(cached, true); return okResult(scanMarkdown(s), { ...s, plan: ctx.plan.plan }); }
  let job = await db.activeScan(host);
  if (!job) {
    const hour = Math.floor(Date.now() / 3600000);
    if (!(await db.bump(`ip:${ctx.ipHash}:${hour}`, SCAN_RL_IP, 3600000)) || !(await db.bump(`global:${hour}`, SCAN_RL_GLOBAL, 3600000)))
      return errResult(`Rate limit: quick scans are limited to ${SCAN_RL_IP} per hour per IP (${SCAN_RL_GLOBAL}/h in total). Try again later or use audit_website.`, { code: 'rate_limit' });
    const id = newId();
    await db.create({ id, url, host, lang: 'en' });
    job = await db.get(id);
  }
  const t0 = Date.now();
  while (Date.now() - t0 < SCAN_WAIT_MS) {
    await sleep(SCAN_POLL_MS);
    job = await db.get(job.id);
    if (!job) return errResult('Scan disappeared from the queue – please call scan_website again.');
    if (job.status === 'done') { const s = scanStructured(job, false); return okResult(scanMarkdown(s), { ...s, plan: ctx.plan.plan }); }
    if (job.status === 'error') return errResult(`Scan failed: ${job.error}. Usually the site blocks bots, is down or very slow. Result page: ${SITE}/en/scan/${job.id}`, { code: 'scan_failed', scanId: job.id });
    if (Date.now() - new Date(job.at).getTime() > SCAN_STALE_MS) return errResult('Scan timed out: the scanner did not pick up the job within 3 minutes. Please try again in a few minutes.', { code: 'scanner_offline', scanId: job.id });
  }
  const resultUrl = `${SITE}/en/scan/${job.id}`;
  return okResult(`Scan of ${host} is still ${job.status} after 90 s (scanId ${job.id}). Call scan_website again with the same URL in 30 s – you will get the finished result (no duplicate scan is started). Result page: ${resultUrl}`,
    { status: 'pending', scanId: job.id, url, resultUrl, retryInSeconds: 30, plan: ctx.plan.plan });
}

// --- audit_website / recheck_website -------------------------------------------------------------------------
function queuedStructured(a, ahead, extra = {}) {
  return { auditId: a.id, status: a.status, url: a.url, pages: a.pages, parent: a.parent || undefined, etaSeconds: a.status === 'done' ? 0 : a.status === 'running' ? etaFor(a.pages, 0) : etaFor(a.pages, ahead), pollWith: 'get_audit', ...extra };
}
function queuedMarkdown(s, verb) {
  const next = s.status === 'done' ? `Already finished (${s.finishedAt || 'within the last 24 h'}) – call get_audit({auditId: "${s.auditId}"}) for the result.` : `ETA ~${s.etaSeconds} s. Poll get_audit({auditId: "${s.auditId}"}) every 20-30 s until status is "done".`;
  return `${verb} ${s.url} (${s.pages} pages) – auditId \`${s.auditId}\`, status ${s.status}. ${next}${s.note ? `\n${s.note}` : ''}${s.plan ? `\nPlan: ${s.plan}${s.keyNote ? ` (${s.keyNote})` : ''}.` : ''}`;
}
async function enqueueAudit(ctx, { url, pages, parent }) {
  const host = hostOf(url), db = scanStore(ctx.env), { plan, keyHash, keyInvalid } = ctx.plan;
  const planNotes = { plan, keyNote: keyInvalid ? `${keyInvalid} – free limits apply` : undefined };
  // 1. Ten sam host już w toku (dla rechecku: ten sam parent) → zwróć istniejący, bez nowego zadania.
  const existing = await db.auditLatestForHost(host, parent ? 0 : plan === 'free' ? AUDIT_HOST_WINDOW_MS : 0, parent || null);
  if (existing) {
    const ahead = await db.auditQueuedAhead(new Date(existing.at).getTime());
    const note = existing.status === 'done' ? `An audit of ${host} from the last 24 h already exists (free plan: 1 audit per host per 24 h) – returning it. Use recheck_website to run it again after fixes.` : `An audit of ${host} is already ${existing.status} – returning it instead of starting a duplicate.`;
    const s = queuedStructured(existing, ahead, { reused: true, note, finishedAt: existing.finishedAt || undefined, ...planNotes });
    return okResult(queuedMarkdown(s, existing.status === 'done' ? 'Existing audit of' : 'Audit of'), s);
  }
  // 2. Limity: free 2 / IP / 24 h, developer 30 / klucz / 24 h.
  const ok = plan === 'developer' ? await db.bump(`audit:key:${keyHash}`, AUDIT_PAID_PER_KEY, DAY_MS) : await db.bump(`audit:ip:${ctx.ipHash}`, AUDIT_FREE_PER_IP, DAY_MS);
  if (!ok) return errResult(plan === 'developer' ? `Rate limit: ${AUDIT_PAID_PER_KEY} audits per 24 h for this license key.` : `Rate limit: the free plan allows ${AUDIT_FREE_PER_IP} full audits (audit_website + recheck_website) per IP per 24 h. A Webskan Developer key raises this to ${AUDIT_PAID_PER_KEY}/day – see ${SITE}/developers/ . scan_website is still available.`, { code: 'rate_limit', plan });
  const id = newId();
  const a = await db.auditCreate({ id, host, url, pages, parent, keyHash: plan === 'developer' ? keyHash : null, ipHash: ctx.ipHash });
  const ahead = await db.auditQueuedAhead(new Date(a.at).getTime());
  const s = queuedStructured(a, ahead, planNotes);
  return okResult(queuedMarkdown(s, parent ? 'Re-check of' : 'Queued full audit of'), s);
}
async function auditWebsite({ url: raw, pages }, ctx) {
  const url = normalizeUrl(raw);
  if (!url) return errResult(BAD_URL);
  const n = Math.min(MAX_PAGES, Math.max(1, Math.round(Number(pages) || DEFAULT_PAGES)));
  return enqueueAudit(ctx, { url, pages: n, parent: null });
}
async function recheckWebsite({ auditId }, ctx) {
  if (!/^[0-9a-f]{16}$/.test(auditId || '')) return errResult('Invalid auditId (expected 16 hex characters, as returned by audit_website).');
  const parent = await scanStore(ctx.env).auditGet(auditId);
  if (!parent) return errResult(`Audit ${auditId} not found (audits are kept for 30 days).`);
  if (parent.status !== 'done') return errResult(`Audit ${auditId} is ${parent.status}${parent.error ? ` (${parent.error})` : ''} – a re-check needs a finished audit to compare against.`);
  return enqueueAudit(ctx, { url: parent.url, pages: parent.pages, parent: parent.id });
}

// --- get_audit --------------------------------------------------------------------------------------------------
// Diff jak w orders/poll.mjs: metryki Lighthouse nie są fixed/new; ustalenie z podstrony/linku, które tym razem nie odpowiedziały → unverified.
function diffFindings(before, after, afterResult) {
  before = before.filter((f) => !VOLATILE.test(f.id)); after = after.filter((f) => !VOLATILE.test(f.id));
  const bid = new Set(before.map((f) => f.id)), aid = new Set(after.map((f) => f.id));
  const blocked = new Set(afterResult.blocked || []), badPages = new Set(afterResult.badPages || []);
  const unverifiable = (f) => { const at = f.id.indexOf('@'); if (at < 0) return false; const target = f.id.slice(at + 1); return blocked.has(target) || badPages.has(target); };
  const gone = before.filter((f) => !aid.has(f.id));
  const brief = (f) => ({ id: f.id, severity: f.severity, title: f.title });
  return { fixed: gone.filter((f) => !unverifiable(f)).map(brief), open: after.filter((f) => bid.has(f.id)).map(brief), new: after.filter((f) => !bid.has(f.id)), unverified: gone.filter(unverifiable).map(brief) };
}
function auditDoneStructured(a, parent) {
  const r = a.result, findings = sortFindings(r.findings || []);
  const out = {
    auditId: a.id, status: 'done', url: a.url, finalUrl: r.finalUrl || a.url, pages: a.pages, pagesCrawled: r.pagesCrawled ?? null, platform: r.platform || null,
    auditedAt: a.finishedAt, durationSeconds: a.startedAt ? Math.round((new Date(a.finishedAt) - new Date(a.startedAt)) / 1000) : null,
    summary: summarize(findings), lighthouse: r.lighthouse || null, findings, errors: r.errors || [], parent: a.parent || undefined,
  };
  if (a.parent) {
    if (parent?.result) out.diff = { ...diffFindings(parent.result.findings || [], r.findings || [], r), lighthouseBefore: parent.result.lighthouse?.mobile?.scores || null, lighthouseAfter: r.lighthouse?.mobile?.scores || null, parentAuditedAt: parent.finishedAt };
    else out.diff = null, out.diffNote = `Parent audit ${a.parent} is no longer available – no diff.`;
  }
  return out;
}
function auditDoneMarkdown(s) {
  const L = [], lh = s.lighthouse || {}, ms = lh.mobile?.scores || {}, ds = lh.desktop?.scores || {};
  const scoreLine = (sc) => `perf ${sc.performance ?? '–'} · a11y ${sc.accessibility ?? '–'} · best practices ${sc['best-practices'] ?? '–'} · SEO ${sc.seo ?? '–'}`;
  L.push(`# ${s.parent ? 'Re-check' : 'Full audit'}: ${hostOf(s.url)} (${s.pagesCrawled ?? '?'} pages crawled${s.platform ? `, platform: ${s.platform}` : ''}, ${s.durationSeconds ?? '?'} s)`);
  L.push(`Findings: ${s.summary.total} (high ${s.summary.high}, medium ${s.summary.medium}, low ${s.summary.low}, info ${s.summary.info})`);
  L.push(`Lighthouse mobile: ${scoreLine(ms)}${lh.mobile?.metrics ? ` · LCP ${fmtS(lh.mobile.metrics.LCP)} · CLS ${lh.mobile.metrics.CLS == null ? '–' : lh.mobile.metrics.CLS.toFixed(3)} · TBT ${lh.mobile.metrics.TBT == null ? '–' : Math.round(lh.mobile.metrics.TBT) + ' ms'}` : ''}`);
  if (lh.desktop?.scores) L.push(`Lighthouse desktop: ${scoreLine(ds)}`);
  if (s.diff) {
    const d = s.diff;
    L.push('', `## Diff vs. previous audit (${d.parentAuditedAt}): ${d.fixed.length} fixed · ${d.open.length} still open · ${d.new.length} new · ${d.unverified.length} unverified`);
    if (d.lighthouseBefore && d.lighthouseAfter) L.push(`Lighthouse mobile before → after: perf ${d.lighthouseBefore.performance} → ${d.lighthouseAfter.performance}, a11y ${d.lighthouseBefore.accessibility} → ${d.lighthouseAfter.accessibility}, SEO ${d.lighthouseBefore.seo} → ${d.lighthouseAfter.seo} (±5 points is normal variance)`);
    const list = (name, arr, max = 25) => { if (!arr.length) return; L.push(`${name} (${arr.length}):`); arr.slice(0, max).forEach((f) => L.push(`- [${f.severity}] ${f.title}`)); if (arr.length > max) L.push(`- … and ${arr.length - max} more (see structuredContent.diff)`); };
    list('Fixed', d.fixed); list('New', d.new); list('Still open', d.open); list('Could not verify (page/link did not respond this time)', d.unverified);
  } else if (s.diffNote) L.push('', s.diffNote);
  L.push('', `## Findings${s.diff ? ' (current state)' : ''}`);
  const MAX = 60; let n = 0;
  for (const f of s.findings) {
    if (n++ >= MAX) { L.push(`- … and ${s.findings.length - MAX} more (see structuredContent.findings)`); break; }
    const pages = f.pages?.length ? ` (on: ${f.pages.slice(0, 3).join(', ')}${f.pages.length > 3 ? ` +${f.pages.length - 3} more` : ''})` : '';
    L.push(`- [${f.severity}] ${f.area}: ${f.title}${f.detail ? ` — ${String(f.detail).slice(0, 240)}` : ''}${pages}`);
  }
  if (!s.findings.length) L.push('- none – nothing to report in the automated checks.');
  if (s.errors?.length) L.push('', `Checks that failed to run: ${s.errors.map((e) => `${e.step} (${e.error})`).join('; ')}.`);
  if (!s.parent) L.push('', `After deploying fixes call recheck_website({auditId: "${s.auditId}"}) to get a fixed / still open / new diff.`);
  return L.join('\n');
}
async function getAudit({ auditId }, ctx) {
  if (!/^[0-9a-f]{16}$/.test(auditId || '')) return errResult('Invalid auditId (expected 16 hex characters, as returned by audit_website).');
  const db = scanStore(ctx.env);
  const a = await db.auditGet(auditId, true);
  if (!a) return errResult(`Audit ${auditId} not found (audits are kept for 30 days).`);
  if (a.status === 'queued' || a.status === 'running') {
    const ahead = a.status === 'queued' ? await db.auditQueuedAhead(new Date(a.at).getTime()) : 0;
    const s = queuedStructured(a, ahead, { startedAt: a.startedAt || undefined, queuedAhead: ahead });
    return okResult(`Audit ${a.id} of ${a.url} is ${a.status}${a.status === 'queued' && ahead ? ` (${ahead} job${ahead > 1 ? 's' : ''} ahead)` : ''}; ETA ~${s.etaSeconds} s. Call get_audit again in 20-30 s.`, s);
  }
  if (a.status === 'error') return okResult(`Audit ${a.id} of ${a.url} failed: ${a.error}. You can start a new one with audit_website.`, { auditId: a.id, status: 'error', url: a.url, pages: a.pages, error: a.error, parent: a.parent || undefined });
  const parent = a.parent ? await db.auditGet(a.parent, true) : null;
  const s = auditDoneStructured(a, parent);
  return okResult(auditDoneMarkdown(s), s);
}

// --- Serwer + transport ------------------------------------------------------------------------------------------
function buildServer(ctx) {
  const server = new McpServer({ name: 'webskan', title: 'Webskan – website audit', version: '1.0.0' }, { instructions: INSTRUCTIONS, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() });
  const urlArg = z.string().min(1).max(500).describe('Public website URL, e.g. https://example.com (scheme optional). Localhost and private hosts are rejected.');
  const guard = (fn) => async (args, extra) => { try { return await fn(args, ctx, extra); } catch (e) { return errResult(`Webskan internal error: ${String(e?.message || e).slice(0, 300)}`); } };
  server.registerTool('scan_website', {
    title: 'Quick website scan',
    description: 'Quick scan of one page (the URL you pass, usually the home page): Lighthouse mobile scores (performance, accessibility, best practices, SEO) with LCP/CLS/TBT/page weight/requests, plus HTTPS redirect, TLS, HSTS and security headers, title, meta description, H1, image alt texts, viewport, canonical, Open Graph, mixed content. Takes 30-60 s; waits up to 90 s and otherwise returns status "pending" with a scanId – call again with the same URL in 30 s. Results per host are cached for 24 h (field cached: true). Free, 10 calls per hour per IP. Use it right after a deploy as a smoke check; use audit_website for the whole site.',
    inputSchema: { url: urlArg },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, guard(scanWebsite));
  server.registerTool('audit_website', {
    title: 'Full website audit (async)',
    description: 'Starts a full technical audit of a whole website and returns immediately with an auditId (poll get_audit every 20-30 s; typically done in 1-5 min). The audit crawls up to `pages` pages (1-30, default 15) following internal links and the sitemap, and checks: broken internal/external links with the pages they sit on, per-page SEO (title, description, H1, canonical, alt texts, Open Graph), Lighthouse mobile and desktop, WCAG accessibility (axe) with selectors, HTTPS/TLS/security headers, robots/sitemap, platform detection and customer journeys (menu, search, forms, 404). No LLM, deterministic, read-only. Free plan: 2 audits per IP per 24 h and 1 per host per 24 h (a repeat call for the same host returns the existing audit). With Authorization: Bearer <Webskan Developer license key>: 30 per 24 h.',
    inputSchema: { url: urlArg, pages: z.number().int().min(1).max(MAX_PAGES).optional().describe(`How many pages to crawl (1-${MAX_PAGES}, default ${DEFAULT_PAGES}). Fewer pages = faster.`) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, guard(auditWebsite));
  server.registerTool('get_audit', {
    title: 'Get audit status / result',
    description: 'Returns the status (queued / running with ETA) or the finished result of an audit started with audit_website or recheck_website: summary counts by severity, Lighthouse mobile+desktop scores, findings sorted high → medium → low → info (each with id, area, severity, title, detail and the pages it was found on), pagesCrawled, finalUrl, platform. For a re-check it also returns diff: fixed / open / new / unverified findings and Lighthouse before/after. Poll every 20-30 s while status is queued or running.',
    inputSchema: { auditId: z.string().regex(/^[0-9a-f]{16}$/).describe('auditId returned by audit_website or recheck_website (16 hex characters).') },
    annotations: { readOnlyHint: true },
  }, guard(getAudit));
  server.registerTool('recheck_website', {
    title: 'Re-check after fixes (diff)',
    description: 'Runs the same audit again (same URL, same number of pages) linked to the original auditId, so get_audit returns a diff: fixed / still open / new / unverified findings and Lighthouse before → after. Call it after you have deployed fixes. Asynchronous like audit_website (returns a new auditId to poll with get_audit) and counted against the same limits (free: 2 audits per IP per 24 h).',
    inputSchema: { auditId: z.string().regex(/^[0-9a-f]{16}$/).describe('auditId of the finished audit to compare against.') },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, guard(recheckWebsite));
  return server;
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS', 'access-control-allow-headers': 'content-type, authorization, accept, mcp-protocol-version, mcp-session-id, last-event-id', 'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version', 'access-control-max-age': '86400' };
const withCors = (res) => { const h = new Headers(res.headers); for (const [k, v] of Object.entries(CORS)) h.set(k, v); return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h }); };

// POST/GET/DELETE/OPTIONS /mcp
export async function handleMcp(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method === 'GET') { // bezstanowo nie ma osobnego strumienia SSE; człowiekowi w przeglądarce pokazujemy, co to jest
    return withCors(new Response(`Webskan MCP server (Streamable HTTP, stateless). Connect with an MCP client: POST ${SITE}/mcp\nTools: scan_website, audit_website, get_audit, recheck_website. Docs: ${SITE}/developers/\n`, { status: 405, headers: { 'content-type': 'text/plain; charset=utf-8', allow: 'POST, OPTIONS' } }));
  }
  if (request.method !== 'POST' && request.method !== 'DELETE') return withCors(new Response('Method not allowed', { status: 405, headers: { allow: 'POST, OPTIONS' } }));
  const ip = request.headers.get('cf-connecting-ip') || 'x';
  const ctx = { env, request, ipHash: await sha256(ip, 8), plan: await resolvePlan(request, env) };
  const server = buildServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: false });
  await server.connect(transport);
  const res = await transport.handleRequest(request);
  return withCors(res);
}
