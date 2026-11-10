// Ruch na webskan.com z Cloudflare GraphQL: żądania HTML wg referera i ścieżki od podanej godziny (UTC). Użycie: node tools/cftraffic.mjs [sinceISO]
import fs from 'node:fs';
const tok = fs.readFileSync(`${process.env.HOME}/.config/.wrangler/config/default.toml`, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const since = process.argv[2] || new Date(Date.now() - 6 * 3600e3).toISOString();
const zone = '897e32b17fef29795738893281875f73';
const q = `{ viewer { zones(filter: {zoneTag: "${zone}"}) {
  byBrowser: httpRequestsAdaptiveGroups(limit: 12, filter: {datetime_geq: "${since}", edgeResponseContentTypeName: "html", clientRequestHTTPMethodName: "GET"}, orderBy: [count_DESC]) { count dimensions { userAgentBrowser } }
  byPath: httpRequestsAdaptiveGroups(limit: 25, filter: {datetime_geq: "${since}", edgeResponseContentTypeName: "html", clientRequestHTTPMethodName: "GET"}, orderBy: [count_DESC]) { count dimensions { clientRequestPath } }
  byCountry: httpRequestsAdaptiveGroups(limit: 10, filter: {datetime_geq: "${since}", edgeResponseContentTypeName: "html", clientRequestHTTPMethodName: "GET"}, orderBy: [count_DESC]) { count dimensions { clientCountryName } }
} } }`;
const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) });
const j = await r.json();
if (j.errors) { console.error(JSON.stringify(j.errors)); process.exit(1); }
const z = j.data.viewer.zones[0];
console.log(`od ${since} (UTC)`);
console.log("przeglądarki:", z.byBrowser.map((x) => `${x.dimensions.userAgentBrowser || "?"}=${x.count}`).join(" "));
console.log('ścieżki:', z.byPath.map((x) => `${x.dimensions.clientRequestPath}=${x.count}`).join(' '));
console.log('kraje:', z.byCountry.map((x) => `${x.dimensions.clientCountryName}=${x.count}`).join(' '));
