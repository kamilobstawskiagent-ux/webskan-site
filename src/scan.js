// Webskan – darmowy „Szybki skan”: kolejka w KV, poller na laptopie, strona wyniku bez JS (meta refresh).
const SCAN_TTL = 7 * 24 * 3600;       // wynik trzymamy 7 dni
const HOST_CACHE_TTL = 24 * 3600;     // ten sam host: 1 skan / 24 h
const RL_IP = 10, RL_GLOBAL = 120;    // limity na godzinę
const STALE_MS = 3 * 60 * 1000;
const fmtBytes = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';       // po 3 min bez wyniku uznajemy skan za nieudany

const T = {
  pl: {
    path: (id) => `/skan/${id}`, home: '/', formAnchor: '/#zamow',
    title: (h) => `Szybki skan: ${h}`, scanning: (h) => `Skanujemy ${h}…`,
    scanningBody: 'Uruchamiamy Lighthouse na symulowanym telefonie i sprawdzamy podstawy SEO oraz bezpieczeństwa. Zwykle trwa to 20–40 sekund. Strona odświeży się sama.',
    queuedLong: 'Trwa to dłużej niż zwykle. Jeśli za minutę nadal nic się nie pojawi, spróbuj ponownie ze strony głównej.',
    failed: 'Nie udało się przeskanować tej strony', failedBody: (e) => `Powód: ${e}. Najczęściej strona blokuje boty, jest niedostępna albo bardzo wolna. Spróbuj ponownie za chwilę albo zamów audyt pogłębiony – jeśli i on się nie uda, zwracamy pieniądze.`,
    notFound: 'Nie ma takiego skanu', notFoundBody: 'Wyniki trzymamy 7 dni. Uruchom nowy skan ze strony głównej.',
    mobileNote: 'Ocena Lighthouse, symulowany telefon z łączem 4G. Wynik laboratoryjny – u realnych użytkowników może się różnić.',
    lhFail: 'Lighthouse nie zdołał zmierzyć tej strony', lhFailWhy: { BLOCKED: 'Zapora serwera podała naszej przeglądarce pomiarowej stronę blokady („You have been blocked”) zamiast sklepu – skaner został potraktowany jak bot. Oceny Lighthouse byłyby pomiarem pustej strony, więc ich nie pokazujemy.', INTERSTITIAL: 'Serwer pokazał naszej przeglądarce stronę błędu lub „maintenance” zamiast sklepu – najczęściej to blokada botów albo zapory. Realni klienci mogą widzieć stronę normalnie; jak serwer traktuje roboty wyszukiwarek, trzeba sprawdzić osobno.', NO_FCP: 'W symulowanym telefonie z łączem 4G przez 90 s nie pojawiła się żadna treść. To zwykle znaczy, że strona ładuje się bardzo długo albo blokuje wyświetlanie do czasu pobrania ciężkich skryptów.', UNKNOWN: 'Przeglądarka pomiarowa przerwała ładowanie przed zebraniem danych.' }, lhFailTail: 'Pozostałe sprawdzenia (HTTPS, nagłówki bezpieczeństwa, SEO) poniżej pochodzą z bezpośredniego pobrania strony i są aktualne. Audyt pogłębiony mierzy stronę w prawdziwej przeglądarce i dłużej.',
    perf: 'Wydajność', a11y: 'Dostępność', bp: 'Dobre praktyki', seo: 'SEO',
    metrics: 'Kluczowe pomiary (telefon)', metric: 'Pomiar', value: 'Wartość', rating: 'Ocena', good: 'dobrze', needs: 'do poprawy', poor: 'słabo',
    lcp: 'Największy element treści (LCP)', cls: 'Przeskoki układu (CLS)', tbt: 'Czas blokowania (TBT)', weight: 'Waga strony', requests: 'Liczba żądań',
    issues: (n) => n ? `Znalezione problemy (${n})` : 'Podstawowe sprawdzenia: bez zastrzeżeń', noIssues: 'Szybki skan nie znalazł podstawowych problemów. Audyt pogłębiony sprawdza znacznie więcej (poniżej).',
    okList: 'Co jest w porządku', sev: { high: 'ważne', medium: 'warto poprawić', low: 'drobiazg' },
    fullH: 'To tylko szybki skan strony głównej. Audyt pogłębiony sprawdza całą witrynę jak klient.', fullLead: 'Szybki skan patrzy na stronę główną na telefonie i sprawdza kilkanaście podstaw. Audyt pogłębiony Webskan to:',
    fullList: ['Cała witryna: do 30 podstron (SEO każdej) i do 500 linków z informacją, gdzie są zepsute', 'Ścieżki klienta w prawdziwej przeglądarce mobilnej: menu, wyszukiwarka, formularz, w sklepie produkt → koszyk → kasa, strona 404', 'Strona oczami pierwszego klienta: oferta, przycisk „zamów”, kontakt, baner cookies – każda uwaga z dowodem', 'Szybkość na telefonie i komputerze, bezpieczeństwo, SEO techniczne, dostępność WCAG z selektorem i kodem każdego błędu', 'Plan działań z gotowymi poprawkami dla developera, dopasowanymi do Twojej platformy', 'Ponowne sprawdzenie po poprawkach w ciągu 30 dni: naprawione / nadal otwarte / nowe', 'Raport PDF e-mailem do 24 h; w cenie 30 dni Webskan Monitora (dostępność co minutę, codzienne kontrole, alerty)'],
    price: '249 zł', orderH: 'Zamów audyt pogłębiony tej strony', email: 'Twój e-mail (na niego wyślemy raport)', consent: 'Akceptuję <a href="/regulamin/">regulamin</a> i <a href="/prywatnosc/">politykę prywatności</a>. Rozumiem, że raport jest generowany automatycznie i dotyczy publicznie dostępnej wersji strony.',
    btnLive: 'Przejdź do płatności – 249 zł', btnPresale: 'Zarezerwuj audyt – 249 zł (płatność po uruchomieniu)', presaleNote: 'Płatności uruchamiamy w najbliższych dniach. Zostaw e-mail, a wyślemy link do płatności dla tej strony. Nic nie pobieramy teraz.',
    share: 'Link do tego wyniku (ważny 7 dni):', sample: 'Zobacz przykładowy audyt pogłębiony', again: 'Skanuj inną stronę',
    issue: {
      tls_bad: ['Problem z certyfikatem TLS', 'Przeglądarki mogą pokazywać ostrzeżenie o niebezpiecznej stronie.'],
      no_https_redirect: ['Brak przekierowania http → https', 'Wejście bez „s” zostaje na niezaszyfrowanej wersji. Google i przeglądarki to karzą.'],
      lcp_poor: ['Główna treść ładuje się {v} s na telefonie', 'Google uznaje wynik powyżej 4 s za słaby. Część odwiedzających wychodzi, zanim cokolwiek zobaczy.'],
      lcp_needs: ['Główna treść ładuje się {v} s na telefonie', 'Cel Google to poniżej 2,5 s.'],
      cls_poor: ['Elementy strony przeskakują podczas ładowania (CLS {v})', 'Użytkownicy klikają nie tam, gdzie chcieli. Google mierzy to jako Core Web Vital.'],
      cls_needs: ['Elementy strony lekko przeskakują podczas ładowania (CLS {v})', 'Cel Google to poniżej 0,1.'],
      tbt_high: ['Strona przez {v} ms nie reaguje na dotyk', 'Za dużo JavaScriptu na starcie: strona przez chwilę nie reaguje na klikanie.'],
      exposed_files: ['Publicznie dostępne pliki, których nie powinno być na stronie ({v})', '{list}. Kopie zapasowe, zrzuty bazy, pliki konfiguracyjne lub repozytorium w katalogu strony to wyciek danych – każdy może je pobrać. Usuń je z serwera i zablokuj dostęp w konfiguracji.'],
      no_hsts: ['Brak nagłówka HSTS', 'Przeglądarka nie wie, że ma zawsze używać https. To jedna linijka w konfiguracji serwera.'],
      security_headers: ['Brakuje {v} nagłówków bezpieczeństwa', '{list}. Chronią użytkowników przed podmianą treści i wstrzyknięciem skryptów.'],
      no_title: ['Brak tytułu strony', 'Tytuł to pierwsza rzecz, którą widać w wynikach Google.'],
      title_long: ['Tytuł strony ma {v} znaków', 'Google ucina tytuły powyżej ok. 60 znaków.'],
      no_meta_desc: ['Brak opisu strony (meta description)', 'Google sam wybiera fragment tekstu pod linkiem; zwykle gorszy niż Twój.'],
      no_h1: ['Brak nagłówka H1', 'Główny nagłówek mówi Google i czytnikom ekranu, o czym jest strona.'],
      multi_h1: ['{v} nagłówków H1 na stronie', 'Powinien być jeden główny nagłówek.'],
      img_alt: ['{v} z {total} obrazków bez opisu alternatywnego', 'Osoby niewidome i Google Grafika nie wiedzą, co przedstawiają.'],
      no_viewport: ['Brak meta viewport', 'Strona nie skaluje się na telefonach. Google indeksuje najpierw wersję mobilną.'],
      mixed_content: ['{v} elementów ładowanych po http na stronie https', 'Przeglądarki blokują je albo pokazują ostrzeżenie.'],
      no_canonical: ['Brak adresu kanonicznego', 'Ryzyko duplikatów w Google (www / bez www, parametry w adresie).'],
      no_og: ['Brak znaczników Open Graph', 'Link udostępniony na Facebooku lub LinkedIn nie ma podglądu z obrazkiem.'],
      no_lang: ['Brak atrybutu języka (lang)', 'Czytniki ekranu i Google nie wiedzą, w jakim języku jest strona.'],
      page_heavy: ['Strona waży {v} MB', 'Na telefonie z wolnym łączem ładuje się długo i zużywa transfer.'],
      a11y_low: ['Dostępność {v}/100', 'Automatyczne testy wykryły bariery dla osób z niepełnosprawnościami.'],
    },
    ok: { https: 'przekierowanie na https', tls: 'ważny certyfikat TLS', hsts: 'HSTS', title: 'tytuł strony', meta: 'opis meta', h1: 'jeden nagłówek H1', alt: 'opisy obrazków', viewport: 'wersja mobilna (viewport)', canonical: 'adres kanoniczny', og: 'Open Graph', lang: 'język dokumentu', lcp: 'szybkie ładowanie (LCP)', cls: 'stabilny układ (CLS)' },
  },
  en: {
    path: (id) => `/en/scan/${id}`, home: '/en/', formAnchor: '/en/#order',
    title: (h) => `Quick scan: ${h}`, scanning: (h) => `Scanning ${h}…`,
    scanningBody: 'Running Lighthouse on a simulated phone and checking SEO and security basics. This usually takes 20–40 seconds. The page refreshes itself.',
    queuedLong: 'This is taking longer than usual. If nothing shows up within a minute, please try again from the homepage.',
    failed: 'We could not scan this site', failedBody: (e) => `Reason: ${e}. Usually the site blocks bots, is down, or is very slow. Try again in a moment, or order an in-depth audit – if that fails too, we refund.`,
    notFound: 'No such scan', notFoundBody: 'Results are kept for 7 days. Start a new scan from the homepage.',
    mobileNote: 'Lighthouse scores, simulated phone on 4G. Lab data – real users may see different numbers.',
    lhFail: 'Lighthouse could not measure this page', lhFailWhy: { BLOCKED: 'The server’s firewall served our measuring browser a block page (“You have been blocked”) instead of the site – the scanner was treated as a bot. Lighthouse scores would measure an empty page, so we do not show them.', INTERSTITIAL: 'The server showed our browser an error or “maintenance” page instead of the site – usually a bot or firewall block. Real visitors may see the site fine; how the server treats search-engine crawlers needs a separate check.', NO_FCP: 'On a simulated 4G phone nothing was painted within 90 s. That usually means the page loads very slowly or blocks rendering until heavy scripts arrive.', UNKNOWN: 'The measuring browser aborted the load before collecting data.' }, lhFailTail: 'The remaining checks below (HTTPS, security headers, SEO) come from a direct fetch of the page and are current. The in-depth audit measures the site in a real browser and for longer.',
    perf: 'Performance', a11y: 'Accessibility', bp: 'Best practices', seo: 'SEO',
    metrics: 'Key measurements (mobile)', metric: 'Metric', value: 'Value', rating: 'Rating', good: 'good', needs: 'needs work', poor: 'poor',
    lcp: 'Largest Contentful Paint (LCP)', cls: 'Layout shift (CLS)', tbt: 'Total Blocking Time (TBT)', weight: 'Page weight', requests: 'Requests',
    issues: (n) => n ? `Issues found (${n})` : 'Basic checks: nothing to report', noIssues: 'The quick scan found no basic issues. The in-depth audit checks far more (see below).',
    okList: 'What looks fine', sev: { high: 'important', medium: 'worth fixing', low: 'minor' },
    fullH: 'This was a quick scan of the home page. The in-depth audit checks the whole site like a customer.', fullLead: 'The quick scan looks at the home page on a phone and checks a dozen basics. The in-depth Webskan audit is:',
    fullList: ['The whole site: up to 30 pages (SEO of each) and up to 500 links with the page where each broken one sits', 'Customer journeys in a real mobile browser: menu, search, contact form, in shops product → cart → checkout, 404 page', 'Your site through a first-time customer’s eyes: offer, call to action, contact, cookie banner – every remark with evidence', 'Speed on mobile and desktop, security, technical SEO, WCAG accessibility with selector and code for every issue', 'Action plan with ready-made fixes for your developer, tailored to your platform', 'Re-check after fixes within 30 days: fixed / still open / new', 'PDF report by e-mail within 24 h; 30 days of Webskan Monitor included (uptime every minute, daily checks, alerts)'],
    price: '$69', orderH: 'Order the in-depth audit of this site', email: 'Your e-mail (we send the report there)', consent: 'I accept the <a href="/en/terms/">terms</a> and <a href="/en/privacy/">privacy policy</a>. I understand the report is generated automatically and covers the publicly available version of the site.',
    btnLive: 'Continue to payment – $69', btnPresale: 'Reserve the audit – $69 (pay when checkout opens)', presaleNote: 'Payments go live within days. Leave your e-mail and we will send a payment link for this site. Nothing is charged now.',
    share: 'Link to this result (valid 7 days):', sample: 'See a sample in-depth audit', again: 'Scan another site',
    issue: {
      tls_bad: ['TLS certificate problem', 'Browsers may show a security warning.'],
      no_https_redirect: ['No http → https redirect', 'Visitors typing the address without “s” stay on the unencrypted version. Google and browsers penalise that.'],
      lcp_poor: ['Main content takes {v} s to appear on mobile', 'Google rates anything above 4 s as poor. Some visitors leave before seeing anything.'],
      lcp_needs: ['Main content takes {v} s to appear on mobile', 'Google’s target is under 2.5 s.'],
      cls_poor: ['Page elements jump around while loading (CLS {v})', 'Users tap the wrong thing. Google measures this as a Core Web Vital.'],
      cls_needs: ['Page elements shift slightly while loading (CLS {v})', 'Google’s target is under 0.1.'],
      tbt_high: ['Page is unresponsive for {v} ms', 'Too much JavaScript at start-up: the page briefly ignores taps and clicks.'],
      exposed_files: ['Publicly accessible files that should not be on the site ({v})', '{list}. Backups, database dumps, config files or a repository inside the web root are a data leak – anyone can download them. Remove them from the server and block access in the server config.'],
      no_hsts: ['Missing HSTS header', 'The browser is not told to always use https. One line of server config.'],
      security_headers: ['{v} security headers missing', '{list}. They protect visitors from content tampering and script injection.'],
      no_title: ['Missing page title', 'The title is the first thing shown in Google results.'],
      title_long: ['Page title is {v} characters', 'Google truncates titles beyond ~60 characters.'],
      no_meta_desc: ['Missing meta description', 'Google picks its own snippet; usually worse than yours.'],
      no_h1: ['No H1 heading', 'The main heading tells Google and screen readers what the page is about.'],
      multi_h1: ['{v} H1 headings on the page', 'There should be one main heading.'],
      img_alt: ['{v} of {total} images without alt text', 'Blind visitors and Google Images cannot tell what they show.'],
      no_viewport: ['Missing viewport meta tag', 'The page does not scale on phones. Google indexes the mobile version first.'],
      mixed_content: ['{v} elements loaded over http on an https page', 'Browsers block them or show a warning.'],
      no_canonical: ['Missing canonical URL', 'Risk of duplicates in Google (www / non-www, URL parameters).'],
      no_og: ['Missing Open Graph tags', 'Links shared on Facebook or LinkedIn get no image preview.'],
      no_lang: ['Missing language attribute (lang)', 'Screen readers and Google cannot tell the page language.'],
      page_heavy: ['Page weighs {v} MB', 'Slow to load on mobile data and wasteful.'],
      a11y_low: ['Accessibility {v}/100', 'Automated tests found barriers for people with disabilities.'],
    },
    ok: { https: 'https redirect', tls: 'valid TLS certificate', hsts: 'HSTS', title: 'page title', meta: 'meta description', h1: 'single H1', alt: 'image alt texts', viewport: 'mobile viewport', canonical: 'canonical URL', og: 'Open Graph', lang: 'document language', lcp: 'fast loading (LCP)', cls: 'stable layout (CLS)' },
  },
};

// Etykiety najczęstszych audytów dostępności Lighthouse (id → PL/EN); nieznane id dostają angielski tytuł z Lighthouse.
const A11Y = {
  pl: { 'color-contrast': 'za niski kontrast tekstu', 'image-alt': 'obrazy bez tekstu alternatywnego', 'link-name': 'linki bez czytelnej nazwy', 'button-name': 'przyciski bez nazwy', label: 'pola formularzy bez etykiet', 'html-has-lang': 'brak atrybutu języka', 'html-lang-valid': 'nieprawidłowy kod języka', 'heading-order': 'przeskoki w hierarchii nagłówków', 'document-title': 'brak tytułu strony', 'meta-viewport': 'zablokowane powiększanie na telefonie', list: 'niepoprawna struktura list', listitem: 'elementy listy poza listą', tabindex: 'wymuszona kolejność tabulacji', 'target-size': 'za małe elementy dotykowe', 'link-in-text-block': 'linki nieodróżnialne od tekstu', 'frame-title': 'ramki bez tytułu', 'select-name': 'listy wyboru bez nazwy', 'input-image-alt': 'przyciski-obrazki bez opisu', 'duplicate-id-aria': 'zduplikowane identyfikatory ARIA', 'aria-allowed-attr': 'niedozwolone atrybuty ARIA', 'aria-required-attr': 'brakujące atrybuty ARIA', 'aria-valid-attr-value': 'błędne wartości atrybutów ARIA', 'aria-valid-attr': 'nieistniejące atrybuty ARIA', 'aria-hidden-focus': 'ukryte elementy nadal dostępne z klawiatury', 'aria-hidden-body': 'ukryta cała treść strony (aria-hidden)', 'aria-required-children': 'niekompletne role ARIA (dzieci)', 'aria-required-parent': 'niekompletne role ARIA (rodzic)', 'aria-roles': 'nieprawidłowe role ARIA', 'aria-command-name': 'elementy ARIA bez nazwy', 'aria-input-field-name': 'pola ARIA bez nazwy', 'aria-toggle-field-name': 'przełączniki bez nazwy', 'aria-progressbar-name': 'paski postępu bez nazwy', 'aria-dialog-name': 'okna dialogowe bez nazwy', 'aria-allowed-role': 'niedozwolone role ARIA', 'valid-lang': 'błędne kody języka fragmentów', accesskeys: 'powtórzone skróty accesskey', bypass: 'brak sposobu na pominięcie nawigacji', 'definition-list': 'niepoprawne listy definicji', dlitem: 'elementy listy definicji poza listą', 'form-field-multiple-labels': 'pola z wieloma etykietami', 'object-alt': 'elementy object bez opisu', 'video-caption': 'wideo bez napisów', 'empty-heading': 'puste nagłówki', 'identical-links-same-purpose': 'identyczne linki prowadzące w różne miejsca', 'landmark-one-main': 'brak głównego obszaru treści (main)', 'skip-link': 'niedziałający link pomijający', 'td-headers-attr': 'błędne nagłówki komórek tabeli', 'th-has-data-cells': 'nagłówki tabeli bez danych', 'table-duplicate-name': 'tabele z powtórzonym opisem', 'table-fake-caption': 'podpisy tabel w komórkach' },
  en: { 'color-contrast': 'insufficient text contrast', 'image-alt': 'images without alt text', 'link-name': 'links without a discernible name', 'button-name': 'buttons without a name', label: 'form fields without labels', 'html-has-lang': 'missing language attribute', 'html-lang-valid': 'invalid language code', 'heading-order': 'skipped heading levels', 'document-title': 'missing page title', 'meta-viewport': 'zooming disabled on phones', list: 'invalid list structure', listitem: 'list items outside a list', tabindex: 'forced tab order', 'target-size': 'touch targets too small', 'link-in-text-block': 'links indistinguishable from text', 'frame-title': 'frames without a title', 'select-name': 'select elements without a name', 'input-image-alt': 'image buttons without alt text', 'duplicate-id-aria': 'duplicate ARIA ids', 'aria-allowed-attr': 'disallowed ARIA attributes', 'aria-required-attr': 'missing required ARIA attributes', 'aria-valid-attr-value': 'invalid ARIA attribute values', 'aria-valid-attr': 'non-existent ARIA attributes', 'aria-hidden-focus': 'hidden elements still focusable', 'aria-hidden-body': 'whole page hidden (aria-hidden)', 'aria-required-children': 'incomplete ARIA roles (children)', 'aria-required-parent': 'incomplete ARIA roles (parent)', 'aria-roles': 'invalid ARIA roles', 'aria-command-name': 'ARIA controls without a name', 'aria-input-field-name': 'ARIA inputs without a name', 'aria-toggle-field-name': 'toggles without a name', 'aria-progressbar-name': 'progress bars without a name', 'aria-dialog-name': 'dialogs without a name', 'aria-allowed-role': 'disallowed ARIA roles', 'valid-lang': 'invalid language codes on fragments', accesskeys: 'duplicate accesskeys', bypass: 'no way to skip navigation', 'definition-list': 'invalid definition lists', dlitem: 'definition items outside a list', 'form-field-multiple-labels': 'fields with multiple labels', 'object-alt': 'object elements without alt text', 'video-caption': 'video without captions', 'empty-heading': 'empty headings', 'identical-links-same-purpose': 'identical links with different targets', 'landmark-one-main': 'no main landmark', 'skip-link': 'broken skip link', 'td-headers-attr': 'invalid table cell headers', 'th-has-data-cells': 'table headers without data cells', 'table-duplicate-name': 'tables with duplicated description', 'table-fake-caption': 'table captions inside cells' },
};
const A11Y_FOUND = { pl: 'Co wykrył Lighthouse', en: 'What Lighthouse found' };
export const ISSUE_TEXT_EN = T.en.issue; // kody problemów szybkiego skanu → angielskie tytuły (używa też serwer MCP)
export const SCAN_STALE_MS = STALE_MS;

// Stan skanów w Durable Object (SQLite) – spójne odczyty; KV ma do 60 s opóźnienia, co wydłużało oczekiwanie.
import { DurableObject } from 'cloudflare:workers';
export class ScanQueue extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS scans(id TEXT PRIMARY KEY, host TEXT, lang TEXT, url TEXT, status TEXT, at INTEGER, started INTEGER, finished INTEGER, data TEXT, error TEXT);
      CREATE INDEX IF NOT EXISTS scans_host ON scans(host, finished); CREATE INDEX IF NOT EXISTS scans_status ON scans(status, at);
      CREATE TABLE IF NOT EXISTS counters(key TEXT PRIMARY KEY, n INTEGER, exp INTEGER);
      CREATE TABLE IF NOT EXISTS audits(id TEXT PRIMARY KEY, host TEXT, url TEXT, pages INTEGER, parent TEXT, status TEXT, at INTEGER, started INTEGER, finished INTEGER, data TEXT, error TEXT, key_hash TEXT, ip_hash TEXT);
      CREATE INDEX IF NOT EXISTS audits_host ON audits(host, at); CREATE INDEX IF NOT EXISTS audits_status ON audits(status, at);
      CREATE TABLE IF NOT EXISTS mcp_clients(day TEXT, hash TEXT, tools INTEGER DEFAULT 0, PRIMARY KEY(day, hash));
      CREATE TABLE IF NOT EXISTS mcp_daily(day TEXT PRIMARY KEY, uniques INTEGER, calls TEXT, uniques_tools INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY, scan_id TEXT, host TEXT, email TEXT, lang TEXT, at INTEGER, status TEXT, next_at INTEGER, ip_hash TEXT)`);
    // migracja z pierwszej wersji licznika (07.11 rano): kolumny z liczbą wywołań narzędzi
    try { this.sql.exec('ALTER TABLE mcp_clients ADD COLUMN tools INTEGER DEFAULT 0'); } catch {}
    try { this.sql.exec('ALTER TABLE mcp_daily ADD COLUMN uniques_tools INTEGER DEFAULT 0'); } catch {}
  }
  // --- Licznik użycia MCP (kryterium zakładu nr 2: unikalni klienci / dzień) ---
  // hash = skrót IP+dzień+sól (bez surowego IP); wiersze per klient żyją ≤ 48 h, agregaty dzienne 90 dni.
  // uniques = klienci, którzy zrobili cokolwiek (także same `initialize` – crawlery i walidatory rejestrów);
  // uniques_tools = klienci z ≥ 1 wywołaniem narzędzia – to jest miara kanału (07.11 05:35: 20 uniques, 0 wywołań narzędzi).
  mcpHit({ day, hash, tool }) {
    this.sql.exec('INSERT OR IGNORE INTO mcp_clients(day,hash,tools) VALUES(?,?,0)', day, hash);
    if (tool !== 'initialize') this.sql.exec('UPDATE mcp_clients SET tools=tools+1 WHERE day=? AND hash=?', day, hash);
    const uniques = this.sql.exec('SELECT COUNT(*) n FROM mcp_clients WHERE day=?', day).toArray()[0].n;
    const uniquesTools = this.sql.exec('SELECT COUNT(*) n FROM mcp_clients WHERE day=? AND tools>0', day).toArray()[0].n;
    const row = this.sql.exec('SELECT calls FROM mcp_daily WHERE day=?', day).toArray()[0];
    let calls = {}; try { calls = row ? JSON.parse(row.calls) : {}; } catch {}
    calls[tool] = (calls[tool] || 0) + 1;
    this.sql.exec('INSERT OR REPLACE INTO mcp_daily(day,uniques,calls,uniques_tools) VALUES(?,?,?,?)', day, uniques, JSON.stringify(calls), uniquesTools);
    const dayAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    this.sql.exec('DELETE FROM mcp_clients WHERE day < ?', dayAgo(2));
    this.sql.exec('DELETE FROM mcp_daily WHERE day < ?', dayAgo(90));
  }
  mcpStats(days) {
    return this.sql.exec('SELECT day,uniques,calls,uniques_tools FROM mcp_daily ORDER BY day DESC LIMIT ?', days).toArray().map((r) => { let calls = {}; try { calls = JSON.parse(r.calls); } catch {} return { day: r.day, uniques: r.uniques, uniquesTools: r.uniques_tools || 0, calls }; });
  }
  // --- Pełne audyty (MCP: audit_website / recheck_website) ---
  auditCreate(a) {
    this.sql.exec('INSERT INTO audits(id,host,url,pages,parent,status,at,key_hash,ip_hash) VALUES(?,?,?,?,?,?,?,?,?)', a.id, a.host, a.url, a.pages, a.parent || null, 'queued', Date.now(), a.keyHash || null, a.ipHash || null);
    if (Math.random() < 0.05) this.sql.exec('DELETE FROM audits WHERE at < ?', Date.now() - AUDIT_TTL_MS);
    return this.auditGet(a.id);
  }
  auditGet(id, withData = false) {
    this.auditTimeout();
    const r = this.sql.exec(`SELECT ${withData ? '*' : AUDIT_COLS} FROM audits WHERE id=?`, id).toArray()[0];
    return r ? rowToAudit(r) : null;
  }
  // Ostatni audyt hosta: trwający (queued/running) albo ukończony w ciągu `withinMs` – żeby nie dublować pracy.
  auditLatestForHost(host, withinMs, parent) {
    const active = this.sql.exec(`SELECT ${AUDIT_COLS} FROM audits WHERE host=? AND status IN ('queued','running') AND (? IS NULL OR parent=?) ORDER BY at DESC LIMIT 1`, host, parent || null, parent || null).toArray()[0];
    if (active) return rowToAudit(active);
    if (!withinMs) return null;
    const done = this.sql.exec(`SELECT ${AUDIT_COLS} FROM audits WHERE host=? AND status='done' AND finished > ? ORDER BY finished DESC LIMIT 1`, host, Date.now() - withinMs).toArray()[0];
    return done ? rowToAudit(done) : null;
  }
  auditQueuedAhead(at) { return this.sql.exec("SELECT COUNT(*) n FROM audits WHERE status IN ('queued','running') AND at < ?", at).toArray()[0].n; }
  auditNext(limit) {
    this.auditTimeout();
    const rows = this.sql.exec("SELECT id,url,pages,parent FROM audits WHERE status='queued' ORDER BY at LIMIT ?", limit).toArray();
    for (const r of rows) this.sql.exec("UPDATE audits SET status='running', started=? WHERE id=?", Date.now(), r.id);
    return rows;
  }
  auditFinish(id, status, data, error) {
    this.sql.exec('UPDATE audits SET status=?, finished=?, data=?, error=? WHERE id=?', status, Date.now(), data ? JSON.stringify(data) : null, error || null, id);
    return this.auditGet(id);
  }
  // running > 15 min → error (poller padł w trakcie); queued > 2 h → error (poller offline), żeby get_audit nie czekał w nieskończoność.
  auditTimeout() {
    const now = Date.now();
    this.sql.exec("UPDATE audits SET status='error', finished=?, error='timeout: the audit worker did not finish within 15 minutes' WHERE status='running' AND started < ?", now, now - AUDIT_RUN_TIMEOUT_MS);
    this.sql.exec("UPDATE audits SET status='error', finished=?, error='timeout: no audit worker picked up the job within 2 hours' WHERE status='queued' AND at < ?", now, now - AUDIT_QUEUE_TIMEOUT_MS);
  }
  // Trwający skan hosta (queued/running, nie starszy niż STALE_MS) – MCP czeka na niego zamiast tworzyć duplikat.
  activeScan(host) { const r = this.sql.exec("SELECT * FROM scans WHERE host=? AND status IN ('queued','running') AND at > ? ORDER BY at DESC LIMIT 1", host, Date.now() - STALE_MS).toArray()[0]; return r ? rowToJob(r) : null; }
  create(job) {
    this.sql.exec('INSERT INTO scans(id,host,lang,url,status,at) VALUES(?,?,?,?,?,?)', job.id, job.host, job.lang, job.url, 'queued', Date.now());
    if (Math.random() < 0.05) { this.sql.exec('DELETE FROM scans WHERE at < ?', Date.now() - SCAN_TTL * 1000); this.sql.exec('DELETE FROM counters WHERE exp < ?', Date.now()); }
  }
  get(id) { const r = this.sql.exec('SELECT * FROM scans WHERE id=?', id).toArray()[0]; return r ? rowToJob(r) : null; }
  // Ostatni zakończony skan hosta z 24 h (done albo error) – formularz zamówienia ostrzega, gdy ostatni skan skończył się blokadą zapory.
  latestFinished(host) { const r = this.sql.exec('SELECT status, error, finished FROM scans WHERE host=? AND status IN (?,?) AND finished > ? ORDER BY finished DESC LIMIT 1', host, 'done', 'error', Date.now() - HOST_CACHE_TTL * 1000).toArray()[0]; return r ? { status: r.status, error: r.error || null, finished: r.finished } : null; }
  latestDone(host) { const r = this.sql.exec('SELECT * FROM scans WHERE host=? AND status=? AND finished > ? ORDER BY finished DESC LIMIT 1', host, 'done', Date.now() - HOST_CACHE_TTL * 1000).toArray()[0]; return r ? rowToJob(r) : null; }
  next(limit) {
    const rows = this.sql.exec('SELECT id,url,lang FROM scans WHERE status=? ORDER BY at LIMIT ?', 'queued', limit).toArray();
    for (const r of rows) this.sql.exec('UPDATE scans SET status=?, started=? WHERE id=?', 'running', Date.now(), r.id);
    return rows;
  }
  finish(id, status, data, error) {
    this.sql.exec('UPDATE scans SET status=?, finished=?, data=?, error=? WHERE id=?', status, Date.now(), data ? JSON.stringify(data) : null, error || null, id);
    return this.get(id);
  }
  // Ponowny skan pod tym samym id/linkiem (np. link już wysłany, a Lighthouse nie zdążył) – status z powrotem 'queued'.
  requeue(id) {
    this.sql.exec("UPDATE scans SET status='queued', at=?, started=NULL, finished=NULL, data=NULL, error=NULL WHERE id=?", Date.now(), id);
    return this.get(id);
  }
  // Leady z darmowego skanu (09.11): e-mail za zgodą → poller wysyła wynik od razu i jedną wiadomość z ofertą po 48 h.
  leadAdd(l) {
    const dup = this.sql.exec('SELECT id FROM leads WHERE email=? AND host=? AND at > ?', l.email, l.host, Date.now() - 30 * 86400000).toArray()[0];
    if (dup) return { id: dup.id, existed: true };
    this.sql.exec('INSERT INTO leads(id,scan_id,host,email,lang,at,status,next_at,ip_hash) VALUES(?,?,?,?,?,?,?,?,?)', l.id, l.scanId, l.host, l.email, l.lang, Date.now(), 'new', null, l.ipHash || null);
    this.sql.exec('DELETE FROM leads WHERE at < ?', Date.now() - 180 * 86400000);
    return { id: l.id, existed: false };
  }
  leadsNext(limit = 10) {
    const now = Date.now();
    return this.sql.exec("SELECT l.*, s.url AS scan_url, s.data AS scan_data, s.finished AS scan_finished FROM leads l LEFT JOIN scans s ON s.id=l.scan_id WHERE l.status='new' OR (l.status='result_sent' AND l.next_at IS NOT NULL AND l.next_at <= ?) ORDER BY l.at LIMIT ?", now, limit).toArray();
  }
  leadSet(id, status, nextAt) { this.sql.exec('UPDATE leads SET status=?, next_at=? WHERE id=?', status, nextAt ?? null, id); return this.sql.exec('SELECT id,status FROM leads WHERE id=?', id).toArray()[0]; }
  leadGet(id) { return this.sql.exec('SELECT id,email,lang,host,status FROM leads WHERE id=?', id).toArray()[0] || null; }
  leadStats() { return this.sql.exec("SELECT status, COUNT(*) n FROM leads GROUP BY status").toArray(); }
  bump(key, limit, ttlMs) {
    const now = Date.now();
    const r = this.sql.exec('SELECT n,exp FROM counters WHERE key=?', key).toArray()[0];
    const n = r && r.exp > now ? r.n + 1 : 1;
    this.sql.exec('INSERT OR REPLACE INTO counters(key,n,exp) VALUES(?,?,?)', key, n, r && r.exp > now ? r.exp : now + ttlMs);
    return n <= limit;
  }
}
const rowToJob = (r) => ({ id: r.id, host: r.host, lang: r.lang, url: r.url, status: r.status, at: new Date(r.at).toISOString(), startedAt: r.started ? new Date(r.started).toISOString() : null, finishedAt: r.finished ? new Date(r.finished).toISOString() : null, result: r.data ? JSON.parse(r.data) : null, error: r.error });
const AUDIT_TTL_MS = 30 * 86400000, AUDIT_RUN_TIMEOUT_MS = 15 * 60000, AUDIT_QUEUE_TIMEOUT_MS = 2 * 3600000;
const AUDIT_COLS = 'id,host,url,pages,parent,status,at,started,finished,error,key_hash,ip_hash';
const rowToAudit = (r) => ({ id: r.id, host: r.host, url: r.url, pages: r.pages, parent: r.parent, status: r.status, at: new Date(r.at).toISOString(), startedAt: r.started ? new Date(r.started).toISOString() : null, finishedAt: r.finished ? new Date(r.finished).toISOString() : null, result: r.data ? JSON.parse(r.data) : null, error: r.error, keyHash: r.key_hash, ipHash: r.ip_hash });
const store = (env) => env.SCAN_QUEUE.get(env.SCAN_QUEUE.idFromName('main'));
export const scanStore = store;

// Czy strona blokuje nasz skaner? Dwa sygnały: (1) ostatni darmowy skan hosta (z naszego IP) skończył się 403/429/stroną blokady,
// (2) szybkie pobranie strony głównej z Workera z tokenem Webskan w User-Agencie daje 403/429 albo stronę blokady.
// Zwraca krótki powód albo null; każdy błąd własny = null (nie blokujemy sprzedaży przez własną awarię).
export const SCANNER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Webskan/1.0 (+https://webskan.com/bot)';
export async function blockedPreflight(env, url) {
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; } })();
  if (!host) return null;
  const [last, live] = await Promise.all([
    store(env).latestFinished(host).catch(() => null),
    fetch(url, { headers: { 'user-agent': SCANNER_UA, accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(8000) }).then(async (r) => { const body = r.status === 200 ? (await r.text()).slice(0, 4000) : ''; return { status: r.status, body }; }).catch(() => null),
  ]);
  if (live && (live.status === 403 || live.status === 429)) return `HTTP ${live.status}`;
  if (live && live.status === 200 && live.body.length < 2500 && /blocked|zablokowan|access denied|captcha|bot detection|just a moment|attention required|cf-chl/i.test(live.body)) return 'BLOCKED';
  if (last && last.status === 'error' && /BLOCKED|HTTP (403|429)/.test(last.error || '')) return `ostatni skan: ${/BLOCKED/.test(last.error) ? 'strona blokady' : last.error.match(/HTTP (403|429)/)[0]}`;
  return null;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => esc(Array.isArray(v[k]) ? v[k].join(', ') : v[k] ?? ''));
const newId = () => { const a = new Uint8Array(8); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };

export function layout(lang, title, body, head = '') {
  const t = T[lang];
  return new Response(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} – Webskan</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css">${head}</head><body><div class="wrap"><header><a class="logo" href="${t.home}">web<span>skan</span></a><nav>${lang === 'pl' ? '<a href="/blog/">Blog</a><a href="/#cena">Cennik</a><a href="/#faq">FAQ</a><a href="/en/" hreflang="en">EN</a>' : '<a href="/en/blog/">Blog</a><a href="/en/#pricing">Pricing</a><a href="/en/#faq">FAQ</a><a href="/" hreflang="pl">PL</a>'}</nav></header><main class="scan">${body}</main><footer>${lang === 'pl' ? '© 2026 Webskan · <a href="/blog/">Blog</a> · <a href="/regulamin/">Regulamin</a> · <a href="/prywatnosc/">Polityka prywatności</a> · <a href="/developers/" hreflang="en">Dla programistów (EN)</a> · kontakt: ' : '© 2026 Webskan · <a href="/en/blog/">Blog</a> · <a href="/en/terms/">Terms</a> · <a href="/en/privacy/">Privacy policy</a> · <a href="/developers/">For developers</a> · contact: '}<a href="mailto:kontakt@webskan.com">kontakt@webskan.com</a></footer></div></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// POST /api/scan  (form: url, lang)
export async function startScan(request, env, normalizeUrl) {
  let form;
  try { form = await request.formData(); } catch { return new Response('Bad request: expected form data', { status: 400 }); }
  const lang = form.get('lang') === 'en' ? 'en' : 'pl';
  const t = T[lang];
  if (form.get('website')) return Response.redirect(new URL(t.home, request.url).toString(), 303); // honeypot
  const url = normalizeUrl(form.get('url'));
  if (!url) return layout(lang, lang === 'pl' ? 'Nieprawidłowy adres strony' : 'Invalid website address', `<section class="hero"><h1>${lang === 'pl' ? 'Nieprawidłowy adres strony' : 'Invalid website address'}</h1><p>${lang === 'pl' ? 'Podaj publiczny adres w formie <code>https://twojafirma.pl</code>.' : 'Enter a public address such as <code>https://yourcompany.com</code>.'} <a href="${t.home}">${lang === 'pl' ? 'Wróć' : 'Back'}</a>.</p></section>`);
  const host = new URL(url).hostname.replace(/^www\./, '');
  const origin = new URL(request.url).origin;

  // Ten sam host w ciągu 24 h → istniejący wynik.
  const db = store(env);
  const cached = await db.latestDone(host);
  if (cached) return Response.redirect(`${origin}${T[lang].path(cached.id)}`, 303);

  const ip = request.headers.get('cf-connecting-ip') || 'x';
  const hour = Math.floor(Date.now() / 3600000);
  const ipHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip)))].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (!(await db.bump(`ip:${ipHash}:${hour}`, RL_IP, 3600000)) || !(await db.bump(`global:${hour}`, RL_GLOBAL, 3600000))) {
    return layout(lang, lang === 'pl' ? 'Za dużo skanów' : 'Too many scans', `<section class="hero"><h1>${lang === 'pl' ? 'Za dużo skanów na raz' : 'Too many scans right now'}</h1><p>${lang === 'pl' ? 'Spróbuj ponownie za godzinę. Audyt pogłębiony możesz zamówić bez limitu.' : 'Please try again in an hour. In-depth audits are not limited.'} <a href="${t.home}">${lang === 'pl' ? 'Wróć' : 'Back'}</a>.</p></section>`);
  }

  const id = newId();
  await db.create({ id, url, host, lang });
  return Response.redirect(`${origin}${t.path(id)}`, 303);
}

// GET /api/scan/next  (poller; nagłówek x-scan-key)
export async function nextScans(request, env) {
  if (!authed(request, env)) return new Response('unauthorized', { status: 401 });
  const jobs = await store(env).next(3);
  return Response.json({ jobs });
}

// POST /api/scan/result  {id, result?, error?}
export async function scanResult(request, env) {
  if (!authed(request, env)) return new Response('unauthorized', { status: 401 });
  const { id, result, error } = await request.json();
  if (!/^[0-9a-f]{16}$/.test(id || '')) return new Response('bad id', { status: 400 });
  const db = store(env);
  if (!(await db.get(id))) return new Response('not found', { status: 404 });
  const ok = result && result.lighthouse && !result.fatal;
  const job = await db.finish(id, ok ? 'done' : 'error', ok ? result : null, ok ? null : String(error || result?.fatal || result?.errors?.[0]?.error || 'unknown').slice(0, 300));
  return Response.json({ ok: true, status: job.status });
}

// POST /api/scan/requeue {id}  (x-scan-key) – ponowny skan pod tym samym linkiem
export async function scanRequeue(request, env) {
  if (!authed(request, env)) return new Response('unauthorized', { status: 401 });
  let body; try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  if (!/^[0-9a-f]{16}$/.test(body.id || '')) return new Response('bad id', { status: 400 });
  const db = store(env);
  if (!(await db.get(body.id))) return new Response('not found', { status: 404 });
  const job = await db.requeue(body.id);
  return Response.json({ ok: true, status: job.status });
}

export function authed(request, env) {
  const k = request.headers.get('x-scan-key') || '';
  return Boolean(env.SCAN_KEY) && k.length === env.SCAN_KEY.length && k === env.SCAN_KEY;
}

// GET /api/audit/next  (poller pełnych audytów; max 1 zadanie naraz, status → running)
export async function nextAudits(request, env) {
  if (!authed(request, env)) return new Response('unauthorized', { status: 401 });
  const jobs = await store(env).auditNext(1);
  return Response.json({ jobs });
}

// POST /api/audit/result  {id, result?, error?}
export async function auditResult(request, env) {
  if (!authed(request, env)) return new Response('unauthorized', { status: 401 });
  let body;
  try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  const { id, result, error } = body;
  if (!/^[0-9a-f]{16}$/.test(id || '')) return new Response('bad id', { status: 400 });
  const db = store(env);
  const a = await db.auditGet(id);
  if (!a) return new Response('not found', { status: 404 });
  const ok = result && result.lighthouse?.mobile?.scores && Array.isArray(result.findings) && !result.fatal;
  const job = await db.auditFinish(id, ok ? 'done' : 'error', ok ? result : null, ok ? null : String(error || result?.fatal || result?.errors?.[0]?.error || 'unknown').slice(0, 300));
  return Response.json({ ok: true, status: job.status });
}

const LEAD = {
  pl: {
    h: 'Wyślij mi ten wynik na e-mail', p: 'Dostaniesz link do wyniku i trzy najważniejsze rzeczy do poprawy. Dwa dni później – jedną wiadomość z propozycją audytu pogłębionego tej strony. Nic więcej, bez newslettera.',
    consent: 'Zgadzam się na otrzymanie wyniku skanu i jednej wiadomości z ofertą Webskan na podany adres (<a href="/prywatnosc/">polityka prywatności</a>). Zgodę można cofnąć linkiem w każdym e-mailu.',
    btn: 'Wyślij wynik', ok: 'Wysłane – wynik pojawi się w skrzynce w ciągu kilku minut (sprawdź też spam).', dup: 'Ten adres dostał już wynik dla tej strony w ciągu ostatnich 30 dni.', bad: 'Nieprawidłowy adres e-mail albo brak zgody.', limit: 'Za dużo zgłoszeń z tego adresu IP – spróbuj za godzinę.',
    unsubT: 'Wypisano', unsubB: 'Nie wyślemy już żadnej wiadomości na ten adres w związku z tym skanem.', unsubBad: 'Ten link jest nieprawidłowy albo już użyty.',
  },
  en: {
    h: 'E-mail me this result', p: 'You get a link to the result and the three most important things to fix. Two days later – one message with an offer of an in-depth audit of this site. Nothing else, no newsletter.',
    consent: 'I agree to receive the scan result and one message with a Webskan offer at this address (<a href="/en/privacy/">privacy policy</a>). You can withdraw consent with the link in every e-mail.',
    btn: 'Send the result', ok: 'Sent – the result will arrive within a few minutes (check spam too).', dup: 'This address already received the result for this site in the last 30 days.', bad: 'Invalid e-mail address or consent not given.', limit: 'Too many requests from this IP address – try again in an hour.',
    unsubT: 'Unsubscribed', unsubB: 'We will not send any further e-mails to this address about this scan.', unsubBad: 'This link is invalid or already used.',
  },
};
async function sha16(s) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join(''); }
const leadSig = (id, env) => sha16(`lead:${id}:${env.SCAN_KEY || ''}`);
// Lista problemów skanu w języku strony (używana przez stronę wyniku i e-mail z wynikiem).
function issueList(r, lang) {
  const t = T[lang];
  const dec = (x) => (lang === 'pl' ? x.replace(/(\d)\.(\d)/g, '$1,$2') : x);
  const order = { high: 0, medium: 1, low: 2 };
  return (r.issues || []).map((i) => { const d = t.issue[i.code]; return d ? { code: i.code, sev: i.sev, title: dec(fill(d[0], i)), why: dec(fill(d[1], i)) } : null; }).filter(Boolean).sort((a, b) => (order[a.sev] ?? 3) - (order[b.sev] ?? 3));
}

// POST /api/scan/lead (form: scan_id, email, lang, consent, website=honeypot)
export async function scanLead(request, env) {
  let form;
  try { form = await request.formData(); } catch { return new Response('Bad request', { status: 400 }); }
  const lang = form.get('lang') === 'en' ? 'en' : 'pl';
  const t = T[lang];
  const scanId = String(form.get('scan_id') || '');
  if (!/^[0-9a-f]{16}$/.test(scanId)) return new Response('bad id', { status: 400 });
  const back = (q) => Response.redirect(new URL(`${t.path(scanId)}?lead=${q}#lead`, request.url).toString(), 303);
  if (form.get('website')) return back('ok'); // honeypot – udajemy sukces
  const email = String(form.get('email') || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) || email.length > 254 || !form.get('consent')) return back('bad');
  const db = store(env);
  const job = await db.get(scanId);
  if (!job || job.status !== 'done') return back('bad');
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ipHash = await sha16(`lead-ip:${ip}`);
  if (!(await db.bump(`lead:${ipHash}`, 5, 3600000))) return back('limit');
  const a = new Uint8Array(8); crypto.getRandomValues(a);
  const id = [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
  const r = await db.leadAdd({ id, scanId, host: job.host, email, lang, ipHash });
  return back(r.existed ? 'dup' : 'ok');
}
// GET /api/scan/leads/next (x-scan-key) → leady do wysyłki: status new (wynik) albo result_sent po terminie (oferta)
export async function leadsNext(request, env) {
  if (!authed(request, env)) return new Response('unauthorized', { status: 401 });
  const rows = await store(env).leadsNext(10);
  const origin = new URL(request.url).origin;
  const leads = [];
  for (const l of rows) {
    const result = l.scan_data ? JSON.parse(l.scan_data) : null;
    leads.push({
      id: l.id, scanId: l.scan_id, host: l.host, url: l.scan_url || `https://${l.host}/`, email: l.email, lang: l.lang, status: l.status, at: new Date(l.at).toISOString(),
      link: `${origin}${T[l.lang].path(l.scan_id)}`, unsub: `${origin}/api/scan/lead/unsub?id=${l.id}&k=${await leadSig(l.id, env)}`,
      scores: result?.lighthouse?.scores || null, metrics: result?.lighthouse?.metrics || null, issues: result ? issueList(result, l.lang) : [], scanFinished: l.scan_finished ? new Date(l.scan_finished).toISOString() : null,
    });
  }
  return Response.json({ leads });
}
// POST /api/scan/leads/done {id, status}  – result_sent planuje ofertę za 48 h
export async function leadsDone(request, env) {
  if (!authed(request, env)) return new Response('unauthorized', { status: 401 });
  let b; try { b = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  if (!/^[0-9a-f]{16}$/.test(b.id || '') || !['result_sent', 'followup_sent', 'failed'].includes(b.status)) return new Response('bad request', { status: 400 });
  const nextAt = b.status === 'result_sent' ? Date.now() + (Number(b.followupMs) || 48 * 3600000) : null;
  return Response.json({ ok: true, lead: await store(env).leadSet(b.id, b.status, nextAt) });
}
export async function leadStats(request, env) {
  if (!authed(request, env)) return new Response('unauthorized', { status: 401 });
  return Response.json({ leads: await store(env).leadStats() });
}
// GET /api/scan/lead/unsub?id=&k=
export async function leadUnsub(request, env) {
  const u = new URL(request.url);
  const id = u.searchParams.get('id') || '', k = u.searchParams.get('k') || '';
  const db = store(env);
  const l = /^[0-9a-f]{16}$/.test(id) ? await db.leadGet(id) : null;
  const lang = l?.lang === 'en' ? 'en' : (u.searchParams.get('lang') === 'en' ? 'en' : 'pl');
  const L = LEAD[lang];
  if (!l || k !== await leadSig(id, env)) return layout(lang, L.unsubT, `<section class="hero"><h1>${L.unsubT}</h1><p>${L.unsubBad}</p></section>`);
  if (l.status !== 'unsubscribed') await db.leadSet(id, 'unsubscribed', null);
  return layout(lang, L.unsubT, `<section class="hero"><h1>${L.unsubT}</h1><p>${L.unsubB}</p></section>`);
}
function leadBox(lang, job, u) {
  const L = LEAD[lang];
  const q = u.searchParams.get('lead');
  const msg = q === 'ok' ? `<p class="note" role="status">${L.ok}</p>` : q === 'dup' ? `<p class="note">${L.dup}</p>` : q === 'bad' ? `<p class="note">${L.bad}</p>` : q === 'limit' ? `<p class="note">${L.limit}</p>` : '';
  if (q === 'ok' || q === 'dup') return `<section class="leadbox" id="lead"><h2>${L.h}</h2>${msg}</section>`;
  return `<section class="leadbox" id="lead"><h2>${L.h}</h2><p>${L.p}</p>${msg}
  <form class="scanform lead" id="lead-form-${job.id}" action="/api/scan/lead" method="post"><input type="hidden" name="lang" value="${lang}"><input type="hidden" name="scan_id" value="${job.id}"><input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true"><input type="email" name="email" placeholder="${lang === 'en' ? 'you@yourcompany.com' : 'ty@twojafirma.pl'}" required maxlength="254" aria-label="E-mail"><button class="btn" type="submit">${L.btn}</button></form>
  <label class="consent"><input type="checkbox" name="consent" value="1" form="lead-form-${job.id}" required> <span>${L.consent}</span></label></section>`;
}

// GET /skan/<id> | /en/scan/<id>
export async function scanPage(request, env, lang, id) {
  const t = T[lang];
  if (!/^[0-9a-f]{16}$/.test(id)) return layout(lang, t.notFound, `<section class="hero"><h1>${t.notFound}</h1><p>${t.notFoundBody}</p></section>`);
  const job = await store(env).get(id);
  if (!job) return layout(lang, t.notFound, `<section class="hero"><h1>${t.notFound}</h1><p>${t.notFoundBody}</p></section>`);
  const host = job.host;
  if (job.status === 'queued' || job.status === 'running') {
    const age = Date.now() - new Date(job.at).getTime();
    if (age > STALE_MS) return layout(lang, t.failed, `<section class="hero"><h1>${t.failed}</h1><p>${t.failedBody(lang === 'pl' ? 'przekroczony czas' : 'timeout')}</p>${scanForm(lang, job.url)}</section>`);
    return layout(lang, t.scanning(host), `<section class="hero"><h1>${esc(t.scanning(host))}</h1><p class="lead">${t.scanningBody}</p><div class="progress"><div></div></div>${age > 60000 ? `<p class="note">${t.queuedLong}</p>` : ''}</section>`, '<meta http-equiv="refresh" content="4">');
  }
  if (job.status === 'error') return layout(lang, t.failed, `<section class="hero"><h1>${t.failed}: ${esc(host)}</h1><p>${t.failedBody(esc(errorText(job.error, lang)))}</p>${scanForm(lang, '')}${orderBox(lang, env, job.url, t)}</section>`);
  return layout(lang, t.title(host), renderResult(job, lang, env, new URL(request.url)), ogHead(job, lang, new URL(request.url)));
}

// Powód niepowodzenia po ludzku (surowy błąd pollera: 'HTTP 429', 'fetch failed', 'quick exit 1: …').
function errorText(e, lang) {
  const raw = String(e || ''), m = raw.match(/^HTTP (\d{3})/);
  const pl = lang === 'pl';
  if (m) {
    const c = Number(m[1]);
    if (c === 429) return pl ? 'serwer odpowiedział kodem 429 (za dużo zapytań)' : 'the server answered 429 (too many requests)';
    if (c === 403 || c === 401) return pl ? `serwer odpowiedział kodem ${c} (dostęp zabroniony)` : `the server answered ${c} (forbidden)`;
    if (c === 404 || c === 410) return pl ? `serwer odpowiedział kodem ${c} (strona nie istnieje)` : `the server answered ${c} (page does not exist)`;
    if (c >= 500) return pl ? `serwer odpowiedział kodem ${c} (błąd po stronie serwera)` : `the server answered ${c} (server-side error)`;
    return pl ? `serwer odpowiedział kodem ${c}` : `the server answered ${c}`;
  }
  if (raw === 'BLOCKED') return pl ? 'zapora serwera zablokowała nasz skaner (strona „You have been blocked” zamiast sklepu)' : 'the server’s firewall blocked our scanner (a “You have been blocked” page instead of the site)';
  if (/quick exit null|exit null/i.test(raw)) return pl ? 'pomiar przekroczył limit czasu (strona ładowała się zbyt długo)' : 'the measurement timed out (the page took too long to load)';
  if (/fetch failed|ETIMEDOUT|ECONNREFUSED|ECONNRESET|timeout/i.test(raw)) return pl ? 'serwer nie przyjął połączenia (brak odpowiedzi albo odrzucone połączenie)' : 'the server did not accept the connection (no response or connection refused)';
  if (/ENOTFOUND|getaddrinfo|DNS/i.test(raw)) return pl ? 'nie udało się ustalić adresu serwera (DNS)' : 'the server address could not be resolved (DNS)';
  return raw;
}

function scanForm(lang, url) {
  return `<form class="scanform" action="/api/scan" method="post"><input type="hidden" name="lang" value="${lang}"><input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true"><input type="text" name="url" inputmode="url" value="${esc(url)}" placeholder="https://" required maxlength="500" aria-label="URL"><button class="btn" type="submit">${lang === 'pl' ? 'Skanuj' : 'Scan'}</button></form>`;
}

function ogHead(job, lang, u) {
  const s = job.result?.lighthouse?.scores || {};
  const t = T[lang];
  const noLh = s.performance == null;
  const title = noLh ? (lang === 'pl' ? `${job.host} – Szybki skan Webskan` : `${job.host} – Webskan quick scan`) : lang === 'pl' ? `${job.host}: wydajność ${s.performance}/100 na telefonie – Szybki skan Webskan` : `${job.host}: mobile performance ${s.performance}/100 – Webskan quick scan`;
  const desc = noLh ? t.lhFail : `${t.perf} ${s.performance} · ${t.a11y} ${s.accessibility} · ${t.bp} ${s['best-practices']} · ${t.seo} ${s.seo}`;
  return `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:url" content="${esc(u.origin + t.path(job.id))}"><meta property="og:image" content="${u.origin}/og-${lang}.png"><meta name="twitter:card" content="summary_large_image">`;
}

function orderBox(lang, env, url, t) {
  const presale = env.SALES_MODE === 'presale';
  return `<section class="fullbox" id="${lang === 'pl' ? 'zamow' : 'order'}"><h2>${t.fullH}</h2><p>${t.fullLead}</p><ul class="check">${t.fullList.map((x) => `<li>${x}</li>`).join('')}</ul>
  <h3>${t.orderH}</h3>
  <form class="order" action="/api/order" method="post"><input type="hidden" name="lang" value="${lang}"><input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <label>URL<br><input type="text" name="url" inputmode="url" value="${esc(url)}" required maxlength="500"></label>
  <label>${t.email}<br><input type="email" name="email" placeholder="${lang === "en" ? "you@yourcompany.com" : "ty@twojafirma.pl"}" required maxlength="254"></label>
  <label class="consent"><input type="checkbox" name="consent" required> ${t.consent}</label>
  <button class="btn" type="submit">${presale ? t.btnPresale : t.btnLive}</button></form>
  ${presale ? `<p class="note">${t.presaleNote}</p>` : ''}
  <p><a href="${lang === 'pl' ? '/przyklad/' : '/en/sample/'}">${t.sample}&nbsp;→</a></p></section>`;
}

function renderResult(job, lang, env, u) {
  const t = T[lang], r = job.result, lh = r.lighthouse, s = lh.scores, m = lh.metrics || {};
  const cls = (v) => (v == null ? '' : v >= 90 ? 'good' : v >= 50 ? 'needs' : 'poor');
  const rate = (v, th) => (v == null ? ['', '–'] : [v <= th[0] ? 'good' : v <= th[1] ? 'needs' : 'poor']);
  const row = (label, val, c) => `<tr><td>${label}</td><td>${val}</td><td class="${c}">${c ? t[c] : ''}</td></tr>`;
  const [cL] = rate(m.LCP, [2500, 4000]), [cC] = rate(m.CLS, [0.1, 0.25]), [cT] = rate(m.TBT, [200, 600]);
  const dp = (x) => (lang === 'pl' ? String(x).replace('.', ',') : String(x));
  const fmtS = (v) => (v == null ? '–' : dp((v / 1000).toFixed(1)) + ' s');
  const fa = (lh.failed?.accessibility || []).map((x) => A11Y[lang][x.id] || x.title).filter(Boolean);
  const issues = (r.issues || []).map((i) => { const d = t.issue[i.code]; const dec = (x) => (lang === 'pl' ? x.replace(/(\d)\.(\d)/g, '$1,$2') : x); return d ? { ...i, title: dec(fill(d[0], i)), why: dec(fill(d[1], i)), detail: i.code === 'a11y_low' && fa.length ? `${A11Y_FOUND[lang]}: ${esc(fa.join(', '))}.` : '' } : null; }).filter(Boolean);
  const codes = new Set(issues.map((i) => i.code));
  const seo = r.seo || {}, hc = r.http?.headers?.checks || {};
  const oks = [];
  if (r.httpRedirect?.redirectsToHttps) oks.push(t.ok.https);
  if (r.tls?.ok) oks.push(t.ok.tls);
  if (hc['strict-transport-security']) oks.push(t.ok.hsts);
  if (m.LCP != null && m.LCP <= 2500) oks.push(t.ok.lcp);
  if (m.CLS != null && m.CLS <= 0.1) oks.push(t.ok.cls);
  if (seo.title?.length && !codes.has('title_long')) oks.push(t.ok.title);
  if (seo.metaDescription?.length) oks.push(t.ok.meta);
  if (seo.h1?.count === 1) oks.push(t.ok.h1);
  if (seo.images?.total && !seo.images.missingAlt) oks.push(t.ok.alt);
  if (seo.viewport) oks.push(t.ok.viewport);
  if (seo.canonical) oks.push(t.ok.canonical);
  if (seo.openGraph?.count >= 2) oks.push(t.ok.og);
  if (seo.lang) oks.push(t.ok.lang);
  const date = new Date(job.finishedAt).toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' });
  const link = `${u.origin}${t.path(job.id)}`;
  const noLh = s.performance == null; // Lighthouse bez ocen (interstitial / NO_FCP) – zamiast kresek wyjaśnienie (10.11)
  const lhBlock = noLh
    ? `<div class="lhfail"><h2>${t.lhFail}</h2><p>${t.lhFailWhy[lh.reason] || t.lhFailWhy.UNKNOWN}</p>${lh.runtimeCode ? `<p class="muted small">Lighthouse: ${esc(lh.runtimeCode)}</p>` : ''}<p class="muted small">${t.lhFailTail}</p></div>`
    : `<div class="scores big">${[['performance', t.perf], ['accessibility', t.a11y], ['best-practices', t.bp], ['seo', t.seo]].map(([k, l]) => `<div class="score ${cls(s[k])}"><b>${s[k] ?? '–'}</b><small>${l}</small></div>`).join('')}</div>
  <p class="muted small">${t.mobileNote}</p>`;
  const metricsBlock = noLh ? '' : `<section><h2>${t.metrics}</h2><table><tr><th>${t.metric}</th><th>${t.value}</th><th>${t.rating}</th></tr>
  ${row(t.lcp, fmtS(m.LCP), cL)}${row(t.cls, m.CLS == null ? '–' : dp(m.CLS.toFixed(3)), cC)}${row(t.tbt, m.TBT == null ? '–' : Math.round(m.TBT) + ' ms', cT)}
  ${row(t.weight, m.totalBytes ? dp(fmtBytes(m.totalBytes)) : '–', '')}${row(t.requests, m.requests ?? '–', '')}</table></section>`;
  return `<section class="hero"><h1>${esc(t.title(job.host))}</h1><p class="muted">${esc(r.http?.finalUrl || job.url)} · ${date}</p>
  ${lhBlock}</section>
  ${metricsBlock}
  <section><h2>${t.issues(issues.length)}</h2>${issues.length ? `<ul class="issues">${issues.map((i) => `<li class="${i.sev}"><span class="badge ${i.sev === 'high' ? 'poor' : i.sev === 'medium' ? 'needs' : 'good'}">${t.sev[i.sev]}</span><b>${i.title}</b><p>${i.why}</p>${i.detail ? `<p class="muted small">${i.detail}</p>` : ''}</li>`).join('')}</ul>` : `<p>${t.noIssues}</p>`}
  ${oks.length ? `<h3>${t.okList}</h3><p class="oks">${oks.map((o) => `<span class="chip">✓ ${esc(o)}</span>`).join(' ')}</p>` : ''}</section>
  ${leadBox(lang, job, u)}
  ${orderBox(lang, env, job.url, t)}
  <section><p class="muted small">${t.share} <a class="share" href="${esc(link)}">${esc(link)}</a></p>${scanForm(lang, '')}<p class="muted small">${lang === 'pl' ? '↑ ' + t.again : '↑ ' + t.again}</p></section>`;
}
