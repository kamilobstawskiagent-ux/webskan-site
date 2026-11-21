// Otwarcia raportów studiów (/r/<token>) wg prawdziwych przeglądarek z CF GraphQL: ścieżka, przeglądarka, kraj, urządzenie, godzina. Użycie: node tools/cfopens.mjs <sinceISO>
import fs from 'node:fs';
const tok = fs.readFileSync(`${process.env.HOME}/.config/.wrangler/config/default.toml`, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const since = process.argv[2];
const zone = '897e32b17fef29795738893281875f73';
const q = `{ viewer { zones(filter: {zoneTag: "${zone}"}) {
  x: httpRequestsAdaptiveGroups(limit: 200, filter: {datetime_geq: "${since}", edgeResponseContentTypeName: "html", clientRequestHTTPMethodName: "GET", clientRequestPath_like: "/r/%"}, orderBy: [count_DESC]) { count dimensions { clientRequestPath userAgentBrowser clientCountryName clientDeviceType datetimeHour } }
} } }`;
const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) });
const j = await r.json(); if(!j.data){console.log(JSON.stringify(j.errors).slice(0,400));process.exit(1)} const z = j.data.viewer.zones[0];
for (const x of z.x) if (!['Unknown','Curl','ChromeHeadless'].includes(x.dimensions.userAgentBrowser)) console.log(x.dimensions.clientRequestPath, x.dimensions.userAgentBrowser, x.dimensions.clientCountryName, x.dimensions.clientDeviceType, x.dimensions.datetimeHour, x.count);
