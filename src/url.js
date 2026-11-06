// Wspólna walidacja adresu strony (formularze, API monitora, MCP): publiczny host http(s) z literową TLD, bez danych logowania, bez adresów prywatnych.
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;

export function normalizeUrl(raw) {
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

// Host bez www – klucz cache'u skanów i audytów.
export const hostOf = (url) => new URL(url).hostname.toLowerCase().replace(/^www\./, "");
