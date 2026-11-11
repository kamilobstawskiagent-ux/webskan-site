// Kliknięcia w linki outboundu (/skan/<id>) wg prawdziwych przeglądarek (bez Curl/Unknown/Headless) z CF GraphQL. Użycie: node tools/cfclicks.mjs <sinceISO>
import fs from 'node:fs';
const tok = fs.readFileSync(`${process.env.HOME}/.config/.wrangler/config/default.toml`, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const since = process.argv[2];
const zone = '897e32b17fef29795738893281875f73';
const q = `{ viewer { zones(filter: {zoneTag: "${zone}"}) {
  x: httpRequestsAdaptiveGroups(limit: 200, filter: {datetime_geq: "${since}", edgeResponseContentTypeName: "html", clientRequestHTTPMethodName: "GET", clientRequestPath_like: "/skan/%"}, orderBy: [count_DESC]) { count dimensions { clientRequestPath userAgentBrowser clientCountryName } }
} } }`;
const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) });
const j = await r.json(); const z = j.data.viewer.zones[0];
for (const x of z.x) if (!['Unknown','Curl','ChromeHeadless'].includes(x.dimensions.userAgentBrowser)) console.log(x.dimensions.clientRequestPath, x.dimensions.userAgentBrowser, x.dimensions.clientCountryName, x.count);
