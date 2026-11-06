# Oficjalny rejestr MCP (registry.modelcontextprotocol.io) – notatka do publikacji

Źródło: modelcontextprotocol/registry, `docs/modelcontextprotocol-io/quickstart.mdx`, `authentication.mdx`,
`remote-servers.mdx`, `official-registry-requirements.md`, schemat `2025-12-11/server.schema.json` (stan 2026-11-07).

## Plik
`docs/server.json` – szkic dla serwera **tylko zdalnego** (bez `packages`, tylko `remotes`).
- Pola wymagane przez schemat: `name`, `description` (1–100 znaków; nasz ma 97), `version` (semver; przy każdej
  kolejnej publikacji podbij numer – zakresy typu `^1.2` są odrzucane).
- `websiteUrl`, `repository`, `title`, `remotes[].headers` są opcjonalne. `remotes[].type` ∈ {`streamable-http`, `sse`}.
- Rejestr NIE sprawdza, czy kontrolujemy adres z `remotes[].url` („It does not verify that you control the remote
  URL, regardless of authentication method”); wymaga tylko, by serwer był publicznie dostępny pod tym adresem.
  Dlatego publikować dopiero, gdy `https://webskan.com/mcp` odpowiada na `initialize`/`tools/list`.

## Komendy
```bash
# instalacja publishera (Linux x86_64)
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_linux_amd64.tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/
cd ~/projects/site/docs
mcp-publisher validate            # sprawdza server.json bez publikacji
mcp-publisher login github        # device flow: github.com/login/device + kod; zaloguj jako kamilobstawskiagent-ux
mcp-publisher publish             # oczekiwane: „✓ Server io.github.kamilobstawskiagent-ux/webskan version 0.1.0”
```
(`mcp-publisher init` generuje szablon z `packages` – nie jest potrzebny, plik już jest.)

## Weryfikacja własności nazwy
- **`io.github.kamilobstawskiagent-ux/…`**: wystarczy `login github` na koncie o tym loginie – logowanie GitHub
  „zawsze daje osobistą przestrzeń `io.github.<login>/*`”. **Żaden plik weryfikacyjny w repo nie jest potrzebny**
  dla serwera zdalnego (pole `mcpName` w `package.json` dotyczy tylko paczek npm). Repo
  `kamilobstawskiagent-ux/webskan-claude-plugin` podajemy tylko informacyjnie w `repository`.
  Uwaga: `login github` nie publikuje do przestrzeni organizacji (issue #1468) – nasze konto jest osobiste, więc OK.
- **`com.webskan/webskan`** (nazwa domenowa) wymaga `login dns` **albo** `login http`; obie opierają się na kluczu
  Ed25519 (OpenSSL ≥ 3.0):
  ```bash
  openssl genpkey -algorithm Ed25519 -out ~/.secrets/mcp-registry-key.pem && chmod 600 ~/.secrets/mcp-registry-key.pem
  PUBLIC_KEY="$(openssl pkey -in ~/.secrets/mcp-registry-key.pem -pubout -outform DER | tail -c 32 | base64)"
  PRIVATE_KEY="$(openssl pkey -in ~/.secrets/mcp-registry-key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n')"
  ```
  - DNS: rekord TXT **na apexie** (nie `_mcp-auth.`/`_mcp-registry.` – wtedy rejestr go nie zobaczy):
    `webskan.com. IN TXT "v=MCPv1; k=ed25519; p=<PUBLIC_KEY>"`
    (w Cloudflare DNS: typ TXT, nazwa `@`, treść `v=MCPv1; k=ed25519; p=<PUBLIC_KEY>`), potem
    `mcp-publisher login dns --domain webskan.com --private-key "$PRIVATE_KEY"`.
  - HTTP (prostsze, zero DNS): plik `https://webskan.com/.well-known/mcp-registry-auth` o treści jednej linii
    `v=MCPv1; k=ed25519; p=<PUBLIC_KEY>` (odpowiedź 200, bez przekierowań, ≤ 4096 B; u nas: `public/.well-known/mcp-registry-auth`
    w assets Workera), potem `mcp-publisher login http --domain webskan.com --private-key "$PRIVATE_KEY"`.
  Rekomendacja: zacząć od `io.github…` (zero zależności od DNS); nazwę `com.webskan/webskan` dodać później
  metodą HTTP – wtedy w `server.json` zmienić `name`.

## Po publikacji
- Serwer pojawia się w API rejestru (`GET https://registry.modelcontextprotocol.io/v0.1/servers?search=webskan`).
- Aktualizacja: podbij `version`, `mcp-publisher publish` ponownie. Wycofanie wersji: `mcp-publisher status`.
