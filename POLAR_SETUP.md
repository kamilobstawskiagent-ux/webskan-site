# Konfiguracja Polar (do zrobienia po założeniu konta przez Kamila)
1. Organizacja `webskan` (Kamil). Zalogowany Chrome → polar.sh/dashboard.
2. Products → New: „Audyt strony WWW” – one-time, 99 PLN, opis PL; „Website audit” – one-time, 29 USD, opis EN. Bez benefits (dostarczamy e-mailem). Zapisać ID produktów.
3. Settings → Developers → New access token (organization): scopes `checkouts:write`, `orders:read`, `products:read`. → `~/.secrets/polar_token.txt` (chmod 600).
4. `cd ~/projects/site && wrangler secret put POLAR_TOKEN && wrangler secret put POLAR_PRODUCT_PL && wrangler secret put POLAR_PRODUCT_EN` (wartości z pliku/ID). Dla sandboxu najpierw `POLAR_API=https://sandbox-api.polar.sh` w vars i token sandboxowy.
5. Test: formularz → checkout → karta 4242 4242 4242 4242 → /dziekujemy/ → poller (`node poll.mjs --dry`) widzi zamówienie z metadata.url/lang.
6. Produkcja: przełączyć POLAR_API, tokeny, produkty. Zweryfikować, że Polar wystawia paragon i że cena na checkout = 99 zł brutto.
7. Odpisać ręcznie na zgłoszenia `pre:*` z KV (link do checkoutu z prefill: `?customer_email=`).
