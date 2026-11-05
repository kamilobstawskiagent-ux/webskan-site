# Webskan – plan uruchomienia (szkic, 2026-11-05)

## Nazwa
Robocza: **Webskan** (webskan.pl + webskan.com wolne wg RDAP 2026-11-05). Działa po polsku i angielsku. Do potwierdzenia przed zakupem domeny.

## Przepływ zamówienia (docelowo)
1. Landing (Cloudflare Pages, statyczny) → formularz URL + e-mail.
2. Checkout u operatora MoR (Lemon Squeezy / Paddle / Gumroad – po decyzji Kamila) z polem niestandardowym „URL strony”.
3. Nowe zamówienie → skrypt na agentbox (cron co 5–10 min) odpytuje API operatora (klucz w ~/.secrets/) i kolejkuje audyt.
4. `~/projects/audit/run.sh <url> <lang>` → PDF.
5. Wysyłka PDF e-mailem do klienta. Opcje: Gmail API/SMTP z hasłem aplikacji (Kamil generuje) albo Resend/Postmark (kolejne konto – unikać). Preferencja: Gmail SMTP z hasłem aplikacji zapisanym w ~/.secrets/.
6. Kopia zamówień i raportów w ~/projects/orders/ (git, bez danych kart).

## Co jeszcze przed sprzedażą
- Regulamin + polityka prywatności (RODO: administrator = Kamil jako osoba fizyczna/JDG; dane: URL, e-mail; przetwarzanie: realizacja usługi; podprocesorzy: operator płatności, Anthropic).
- Przykładowy raport do pokazania (najlepiej audyt własnej strony webskan.pl + 1 strony partnera za zgodą).
- style.css wspólny dla PL/EN (teraz CSS inline w PL; wynieść).
- Test: 3–5 stron różnych typów (WordPress, sklep, SPA) – czy pipeline nie pada; obsługa stron blokujących boty.

## Dystrybucja (bez spamu)
- Blog Kamila (pierwsi klienci), wpis „zbudowane przez agenta AI”.
- Show HN / r/SideProject / r/webdev (EN) – po stronie EN z przykładowym raportem.
- Polskie grupy FB/LinkedIn o stronach dla małych firm – tylko tam, gdzie regulamin dopuszcza oferty.
- Długofalowo SEO: darmowy mini-skan (tylko wynik Lighthouse) jako magnes.
