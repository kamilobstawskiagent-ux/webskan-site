#!/usr/bin/env node
// Smoke test serwera MCP Webskan (klient z @modelcontextprotocol/sdk, Streamable HTTP) – domyślnie przeciwko produkcji.
// Użycie: node tools/mcp-smoke.mjs [--no-audit] [--url https://strona.pl] [--pages 5]
//   MCP_URL=https://webskan.com/mcp  MCP_KEY=<Bearer, np. klucz Polar albo SCAN_KEY do testów planu developer>
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const MCP_URL = process.env.MCP_URL || "https://webskan.com/mcp";
const KEY = process.env.MCP_KEY || "";
const AUDIT_URL = opt("--url", "https://kamilobstawski.com");
const PAGES = +opt("--pages", 5);
const NO_AUDIT = args.includes("--no-audit");
const POLL_MS = 15000, AUDIT_MAX_MS = 15 * 60 * 1000;

const t = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${t()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (cond, what) => { if (cond) log("  OK  ", what); else { failures++; log("  FAIL", what); } };
const timed = async (label, fn) => { const t0 = Date.now(); const r = await fn(); log(`${label}: ${((Date.now() - t0) / 1000).toFixed(1)} s`); return r; };

const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), KEY ? { requestInit: { headers: { authorization: `Bearer ${KEY}` } } } : undefined);
const client = new Client({ name: "webskan-smoke", version: "1.0.0" });
await timed("initialize", () => client.connect(transport));
const info = client.getServerVersion();
log("server:", JSON.stringify(info), "instructions:", (client.getInstructions() || "").length, "chars");
check(info?.name === "webskan", "serverInfo.name = webskan");

const { tools } = await timed("tools/list", () => client.listTools());
log("tools:", tools.map((x) => x.name).join(", "));
check(tools.length === 4 && ["scan_website", "audit_website", "get_audit", "recheck_website"].every((n) => tools.some((x) => x.name === n)), "4 tools with the expected names");

const call = (name, a) => client.callTool({ name, arguments: a });
const sc = (r) => r.structuredContent || {};

// Błędne wejście → isError
for (const bad of ["localhost", "foo", "http://127.0.0.1/", "mailto:x@y.pl"]) {
  const r = await call("scan_website", { url: bad });
  check(r.isError === true, `scan_website(${JSON.stringify(bad)}) → isError (${(r.content?.[0]?.text || "").slice(0, 60)}…)`);
}

// Szybkie skany
for (const url of ["https://example.com", AUDIT_URL]) {
  const r = await timed(`scan_website ${url}`, () => call("scan_website", { url }));
  const s = sc(r);
  log(`  status=${s.status} cached=${s.cached} plan=${s.plan} scores=${JSON.stringify(s.scores)} issues=${s.issues?.length} resultUrl=${s.resultUrl}`);
  if (s.issues?.length) log("  issues:", s.issues.map((i) => `[${i.severity}] ${i.title}`).join(" | "));
  check(!r.isError && (s.status === "done" || s.status === "pending"), `scan_website ${url} returns done/pending`);
  check(typeof r.content?.[0]?.text === "string" && r.content[0].text.includes("Quick scan") || s.status === "pending", "text content present");
  if (s.status === "done") check(s.scores && typeof s.scores.performance === "number" && s.resultUrl?.startsWith("https://webskan.com/en/scan/"), "scores + resultUrl");
}

if (NO_AUDIT) { log(failures ? `FAILURES: ${failures}` : "ALL OK"); await client.close(); process.exit(failures ? 1 : 0); }

// Pełny audyt → get_audit → recheck → get_audit (diff)
async function waitAudit(auditId) {
  const t0 = Date.now();
  for (;;) {
    const r = await call("get_audit", { auditId });
    const s = sc(r);
    if (r.isError) { log("  get_audit error:", r.content?.[0]?.text); return { r, s }; }
    if (s.status === "done" || s.status === "error") { log(`  get_audit ${auditId}: ${s.status} after ${((Date.now() - t0) / 1000).toFixed(0)} s`); return { r, s }; }
    log(`  get_audit ${auditId}: ${s.status}, eta ${s.etaSeconds}s${s.queuedAhead ? `, ahead ${s.queuedAhead}` : ""}`);
    if (Date.now() - t0 > AUDIT_MAX_MS) { log("  TIMEOUT waiting for audit"); return { r, s }; }
    await sleep(POLL_MS);
  }
}
const a1 = await timed(`audit_website ${AUDIT_URL} pages=${PAGES}`, () => call("audit_website", { url: AUDIT_URL, pages: PAGES }));
const s1 = sc(a1);
log("  →", a1.content?.[0]?.text?.split("\n")[0]);
check(!a1.isError && /^[0-9a-f]{16}$/.test(s1.auditId || ""), `audit_website returns auditId (${s1.auditId}, status ${s1.status}, plan ${s1.plan}, reused ${s1.reused || false})`);
if (!s1.auditId) { log("cannot continue"); process.exit(1); }
const { r: g1, s: d1 } = await timed("audit wait", () => waitAudit(s1.auditId));
check(d1.status === "done", `audit ${s1.auditId} done`);
if (d1.status === "done") {
  log(`  pagesCrawled=${d1.pagesCrawled} platform=${d1.platform} duration=${d1.durationSeconds}s summary=${JSON.stringify(d1.summary)} lh.mobile=${JSON.stringify(d1.lighthouse?.mobile?.scores)} lh.desktop=${JSON.stringify(d1.lighthouse?.desktop?.scores)}`);
  log("  top findings:", d1.findings.slice(0, 5).map((f) => `[${f.severity}] ${f.title}`).join(" | "));
  log("  text preview:\n" + g1.content[0].text.split("\n").slice(0, 8).map((l) => "    " + l).join("\n"));
  check(Array.isArray(d1.findings) && d1.summary.total === d1.findings.length, "findings + summary consistent");
  const sev = d1.findings.map((f) => ({ high: 0, medium: 1, low: 2, info: 3 })[f.severity] ?? 9);
  check(sev.every((v, i) => i === 0 || sev[i - 1] <= v), "findings sorted high→low");
} else log("  error:", d1.error || g1.content?.[0]?.text);

const a2 = await timed(`recheck_website ${s1.auditId}`, () => call("recheck_website", { auditId: s1.auditId }));
const s2 = sc(a2);
log("  →", a2.content?.[0]?.text?.split("\n")[0]);
check(!a2.isError && /^[0-9a-f]{16}$/.test(s2.auditId || "") && s2.parent === s1.auditId, `recheck_website returns new auditId (${s2.auditId}) with parent`);
if (s2.auditId) {
  const { r: g2, s: d2 } = await timed("recheck wait", () => waitAudit(s2.auditId));
  check(d2.status === "done", `recheck ${s2.auditId} done`);
  if (d2.status === "done") {
    const d = d2.diff || {};
    log(`  diff: fixed=${d.fixed?.length} open=${d.open?.length} new=${d.new?.length} unverified=${d.unverified?.length} lh ${JSON.stringify(d.lighthouseBefore)} → ${JSON.stringify(d.lighthouseAfter)}`);
    check(d2.diff && Array.isArray(d.fixed) && Array.isArray(d.open) && Array.isArray(d.new) && Array.isArray(d.unverified), "diff present with fixed/open/new/unverified");
    log("  text preview:\n" + g2.content[0].text.split("\n").slice(0, 10).map((l) => "    " + l).join("\n"));
  } else log("  error:", d2.error || g2.content?.[0]?.text);
}
await client.close();
log(failures ? `FAILURES: ${failures}` : "ALL OK");
process.exit(failures ? 1 : 0);
