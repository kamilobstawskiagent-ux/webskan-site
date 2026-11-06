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
    failed: 'Nie udało się przeskanować tej strony', failedBody: (e) => `Powód: ${e}. Najczęściej strona blokuje boty, jest niedostępna albo bardzo wolna. Spróbuj ponownie za chwilę albo zamów pełny audyt – jeśli i on się nie uda, zwracamy pieniądze.`,
    notFound: 'Nie ma takiego skanu', notFoundBody: 'Wyniki trzymamy 7 dni. Uruchom nowy skan ze strony głównej.',
    mobileNote: 'Ocena Lighthouse, symulowany telefon z łączem 4G. Wynik laboratoryjny – u realnych użytkowników może się różnić.',
    perf: 'Wydajność', a11y: 'Dostępność', bp: 'Dobre praktyki', seo: 'SEO',
    metrics: 'Kluczowe pomiary (telefon)', metric: 'Pomiar', value: 'Wartość', rating: 'Ocena', good: 'dobrze', needs: 'do poprawy', poor: 'słabo',
    lcp: 'Największy element treści (LCP)', cls: 'Przeskoki układu (CLS)', tbt: 'Czas blokowania (TBT)', weight: 'Waga strony', requests: 'Liczba żądań',
    issues: (n) => n ? `Znalezione problemy (${n})` : 'Podstawowe sprawdzenia: bez zastrzeżeń', noIssues: 'Szybki skan nie znalazł podstawowych problemów. Pełny audyt sprawdza znacznie więcej (poniżej).',
    okList: 'Co jest w porządku', sev: { high: 'ważne', medium: 'warto poprawić', low: 'drobiazg' },
    fullH: 'To tylko szybki skan. Pełny audyt mówi, co zrobić.', fullLead: 'Szybki skan patrzy na stronę główną na telefonie i sprawdza kilkanaście podstaw. Pełny audyt Webskan to:',
    fullList: ['Pomiar na telefonie i komputerze z pełną listą możliwości przyspieszenia', 'Test dostępności WCAG 2.1 AA (axe-core) na stronie głównej i podstronach', 'Sprawdzenie do 150 linków: zepsute i niedziałające', 'Bezpieczeństwo: certyfikat, przekierowania, wszystkie nagłówki, wycieki o serwerze', 'SEO techniczne: canonical, sitemap, robots.txt, dane strukturalne, Open Graph', 'Najważniejsze: priorytetowa lista poprawek napisana po ludzku – co, dlaczego, jak i ile to zajmie', 'Raport PDF e-mailem w 24 h (zwykle w ciągu godziny)'],
    price: '99 zł', orderH: 'Zamów pełny audyt tej strony', email: 'Twój e-mail (na niego wyślemy raport)', consent: 'Akceptuję <a href="/regulamin/">regulamin</a> i <a href="/prywatnosc/">politykę prywatności</a>. Rozumiem, że raport jest generowany automatycznie i dotyczy publicznie dostępnej wersji strony.',
    btnLive: 'Przejdź do płatności – 99 zł', btnPresale: 'Zarezerwuj audyt – 99 zł (płatność po uruchomieniu)', presaleNote: 'Płatności uruchamiamy w najbliższych dniach. Zostaw e-mail, a wyślemy link do płatności dla tej strony. Nic nie pobieramy teraz.',
    share: 'Link do tego wyniku (ważny 7 dni):', sample: 'Zobacz przykładowy pełny raport', again: 'Skanuj inną stronę',
    issue: {
      tls_bad: ['Problem z certyfikatem TLS', 'Przeglądarki mogą pokazywać ostrzeżenie o niebezpiecznej stronie.'],
      no_https_redirect: ['Brak przekierowania http → https', 'Wejście bez „s” zostaje na niezaszyfrowanej wersji. Google i przeglądarki to karzą.'],
      lcp_poor: ['Główna treść ładuje się {v} s na telefonie', 'Google uznaje wynik powyżej 4 s za słaby. Część odwiedzających wychodzi, zanim cokolwiek zobaczy.'],
      lcp_needs: ['Główna treść ładuje się {v} s na telefonie', 'Cel Google to poniżej 2,5 s.'],
      cls_poor: ['Elementy strony przeskakują podczas ładowania (CLS {v})', 'Użytkownicy klikają nie tam, gdzie chcieli. Google mierzy to jako Core Web Vital.'],
      cls_needs: ['Elementy strony lekko przeskakują podczas ładowania (CLS {v})', 'Cel Google to poniżej 0,1.'],
      tbt_high: ['Strona przez {v} ms nie reaguje na dotyk', 'Za dużo JavaScriptu na starcie: strona przez chwilę nie reaguje na klikanie.'],
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
    failed: 'We could not scan this site', failedBody: (e) => `Reason: ${e}. Usually the site blocks bots, is down, or is very slow. Try again in a moment, or order a full audit – if that fails too, we refund.`,
    notFound: 'No such scan', notFoundBody: 'Results are kept for 7 days. Start a new scan from the homepage.',
    mobileNote: 'Lighthouse scores, simulated phone on 4G. Lab data – real users may see different numbers.',
    perf: 'Performance', a11y: 'Accessibility', bp: 'Best practices', seo: 'SEO',
    metrics: 'Key measurements (mobile)', metric: 'Metric', value: 'Value', rating: 'Rating', good: 'good', needs: 'needs work', poor: 'poor',
    lcp: 'Largest Contentful Paint (LCP)', cls: 'Layout shift (CLS)', tbt: 'Total Blocking Time (TBT)', weight: 'Page weight', requests: 'Requests',
    issues: (n) => n ? `Issues found (${n})` : 'Basic checks: nothing to report', noIssues: 'The quick scan found no basic issues. The full audit checks far more (see below).',
    okList: 'What looks fine', sev: { high: 'important', medium: 'worth fixing', low: 'minor' },
    fullH: 'This was a quick scan. The full audit tells you what to do.', fullLead: 'The quick scan looks at the home page on a phone and checks a dozen basics. The full Webskan audit adds:',
    fullList: ['Mobile and desktop measurements with the full list of speed opportunities', 'WCAG 2.1 AA accessibility test (axe-core) on the home page and subpages', 'Up to 150 links checked for breakage', 'Security: certificate, redirects, all headers, server information leaks', 'Technical SEO: canonical, sitemap, robots.txt, structured data, Open Graph', 'Most importantly: a prioritised fix list written for humans – what, why, how and how long', 'PDF report by e-mail within 24 h (usually within the hour)'],
    price: '$29', orderH: 'Order the full audit of this site', email: 'Your e-mail (we send the report there)', consent: 'I accept the <a href="/en/terms/">terms</a> and <a href="/en/privacy/">privacy policy</a>. I understand the report is generated automatically and covers the publicly available version of the site.',
    btnLive: 'Continue to payment – $29', btnPresale: 'Reserve the audit – $29 (pay when checkout opens)', presaleNote: 'Payments go live within days. Leave your e-mail and we will send a payment link for this site. Nothing is charged now.',
    share: 'Link to this result (valid 7 days):', sample: 'See a sample full report', again: 'Scan another site',
    issue: {
      tls_bad: ['TLS certificate problem', 'Browsers may show a security warning.'],
      no_https_redirect: ['No http → https redirect', 'Visitors typing the address without “s” stay on the unencrypted version. Google and browsers penalise that.'],
      lcp_poor: ['Main content takes {v} s to appear on mobile', 'Google rates anything above 4 s as poor. Some visitors leave before seeing anything.'],
      lcp_needs: ['Main content takes {v} s to appear on mobile', 'Google’s target is under 2.5 s.'],
      cls_poor: ['Page elements jump around while loading (CLS {v})', 'Users tap the wrong thing. Google measures this as a Core Web Vital.'],
      cls_needs: ['Page elements shift slightly while loading (CLS {v})', 'Google’s target is under 0.1.'],
      tbt_high: ['Page is unresponsive for {v} ms', 'Too much JavaScript at start-up: the page briefly ignores taps and clicks.'],
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

// Stan skanów w Durable Object (SQLite) – spójne odczyty; KV ma do 60 s opóźnienia, co wydłużało oczekiwanie.
import { DurableObject } from 'cloudflare:workers';
export class ScanQueue extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS scans(id TEXT PRIMARY KEY, host TEXT, lang TEXT, url TEXT, status TEXT, at INTEGER, started INTEGER, finished INTEGER, data TEXT, error TEXT);
      CREATE INDEX IF NOT EXISTS scans_host ON scans(host, finished); CREATE INDEX IF NOT EXISTS scans_status ON scans(status, at);
      CREATE TABLE IF NOT EXISTS counters(key TEXT PRIMARY KEY, n INTEGER, exp INTEGER)`);
  }
  create(job) {
    this.sql.exec('INSERT INTO scans(id,host,lang,url,status,at) VALUES(?,?,?,?,?,?)', job.id, job.host, job.lang, job.url, 'queued', Date.now());
    if (Math.random() < 0.05) { this.sql.exec('DELETE FROM scans WHERE at < ?', Date.now() - SCAN_TTL * 1000); this.sql.exec('DELETE FROM counters WHERE exp < ?', Date.now()); }
  }
  get(id) { const r = this.sql.exec('SELECT * FROM scans WHERE id=?', id).toArray()[0]; return r ? rowToJob(r) : null; }
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
  bump(key, limit, ttlMs) {
    const now = Date.now();
    const r = this.sql.exec('SELECT n,exp FROM counters WHERE key=?', key).toArray()[0];
    const n = r && r.exp > now ? r.n + 1 : 1;
    this.sql.exec('INSERT OR REPLACE INTO counters(key,n,exp) VALUES(?,?,?)', key, n, r && r.exp > now ? r.exp : now + ttlMs);
    return n <= limit;
  }
}
const rowToJob = (r) => ({ id: r.id, host: r.host, lang: r.lang, url: r.url, status: r.status, at: new Date(r.at).toISOString(), startedAt: r.started ? new Date(r.started).toISOString() : null, finishedAt: r.finished ? new Date(r.finished).toISOString() : null, result: r.data ? JSON.parse(r.data) : null, error: r.error });
const store = (env) => env.SCAN_QUEUE.get(env.SCAN_QUEUE.idFromName('main'));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => esc(Array.isArray(v[k]) ? v[k].join(', ') : v[k] ?? ''));
const newId = () => { const a = new Uint8Array(8); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };

export function layout(lang, title, body, head = '') {
  const t = T[lang];
  return new Response(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} – Webskan</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css">${head}</head><body><div class="wrap"><header><a class="logo" href="${t.home}">web<span>skan</span></a><nav><a href="${t.home}">${lang === 'pl' ? 'Strona główna' : 'Home'}</a><a href="${lang === 'pl' ? '/en/' : '/'}">${lang === 'pl' ? 'EN' : 'PL'}</a></nav></header><main class="scan">${body}</main><footer>© 2026 Webskan · <a href="${lang === 'pl' ? '/regulamin/' : '/en/terms/'}">${lang === 'pl' ? 'Regulamin' : 'Terms'}</a> · <a href="${lang === 'pl' ? '/prywatnosc/' : '/en/privacy/'}">${lang === 'pl' ? 'Polityka prywatności' : 'Privacy'}</a></footer></div></body></html>`,
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
    return layout(lang, lang === 'pl' ? 'Za dużo skanów' : 'Too many scans', `<section class="hero"><h1>${lang === 'pl' ? 'Za dużo skanów na raz' : 'Too many scans right now'}</h1><p>${lang === 'pl' ? 'Spróbuj ponownie za godzinę. Pełny audyt możesz zamówić bez limitu.' : 'Please try again in an hour. Full audits are not limited.'} <a href="${t.home}">${lang === 'pl' ? 'Wróć' : 'Back'}</a>.</p></section>`);
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

function authed(request, env) {
  const k = request.headers.get('x-scan-key') || '';
  return Boolean(env.SCAN_KEY) && k.length === env.SCAN_KEY.length && k === env.SCAN_KEY;
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
  if (job.status === 'error') return layout(lang, t.failed, `<section class="hero"><h1>${t.failed}: ${esc(host)}</h1><p>${t.failedBody(esc(job.error))}</p>${scanForm(lang, '')}${orderBox(lang, env, job.url, t)}</section>`);
  return layout(lang, t.title(host), renderResult(job, lang, env, new URL(request.url)), ogHead(job, lang, new URL(request.url)));
}

function scanForm(lang, url) {
  return `<form class="scanform" action="/api/scan" method="post"><input type="hidden" name="lang" value="${lang}"><input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true"><input type="text" name="url" inputmode="url" value="${esc(url)}" placeholder="https://" required maxlength="500" aria-label="URL"><button class="btn" type="submit">${lang === 'pl' ? 'Skanuj' : 'Scan'}</button></form>`;
}

function ogHead(job, lang, u) {
  const s = job.result?.lighthouse?.scores || {};
  const t = T[lang];
  const title = lang === 'pl' ? `${job.host}: wydajność ${s.performance}/100 na telefonie – Szybki skan Webskan` : `${job.host}: mobile performance ${s.performance}/100 – Webskan quick scan`;
  const desc = `${t.perf} ${s.performance} · ${t.a11y} ${s.accessibility} · ${t.bp} ${s['best-practices']} · ${t.seo} ${s.seo}`;
  return `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:url" content="${esc(u.origin + t.path(job.id))}"><meta property="og:image" content="${u.origin}/og-${lang}.png"><meta name="twitter:card" content="summary_large_image">`;
}

function orderBox(lang, env, url, t) {
  const presale = env.SALES_MODE === 'presale';
  return `<section class="fullbox" id="${lang === 'pl' ? 'zamow' : 'order'}"><h2>${t.fullH}</h2><p>${t.fullLead}</p><ul class="check">${t.fullList.map((x) => `<li>${x}</li>`).join('')}</ul>
  <h3>${t.orderH}</h3>
  <form class="order" action="/api/order" method="post"><input type="hidden" name="lang" value="${lang}"><input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <label>URL<br><input type="text" name="url" inputmode="url" value="${esc(url)}" required maxlength="500"></label>
  <label>${t.email}<br><input type="email" name="email" required maxlength="254"></label>
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
  const fmtS = (v) => (v == null ? '–' : (v / 1000).toFixed(1) + ' s');
  const fa = (lh.failed?.accessibility || []).map((x) => A11Y[lang][x.id] || x.title).filter(Boolean);
  const issues = (r.issues || []).map((i) => { const d = t.issue[i.code]; return d ? { ...i, title: fill(d[0], i), why: fill(d[1], i), detail: i.code === 'a11y_low' && fa.length ? `${A11Y_FOUND[lang]}: ${esc(fa.join(', '))}.` : '' } : null; }).filter(Boolean);
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
  const date = new Date(job.finishedAt).toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-GB');
  const link = `${u.origin}${t.path(job.id)}`;
  return `<section class="hero"><h1>${esc(t.title(job.host))}</h1><p class="muted">${esc(r.http?.finalUrl || job.url)} · ${date}</p>
  <div class="scores big">${[['performance', t.perf], ['accessibility', t.a11y], ['best-practices', t.bp], ['seo', t.seo]].map(([k, l]) => `<div class="score ${cls(s[k])}"><b>${s[k] ?? '–'}</b><small>${l}</small></div>`).join('')}</div>
  <p class="muted small">${t.mobileNote}</p></section>
  <section><h2>${t.metrics}</h2><table><tr><th>${t.metric}</th><th>${t.value}</th><th>${t.rating}</th></tr>
  ${row(t.lcp, fmtS(m.LCP), cL)}${row(t.cls, m.CLS == null ? '–' : m.CLS.toFixed(3), cC)}${row(t.tbt, m.TBT == null ? '–' : Math.round(m.TBT) + ' ms', cT)}
  ${row(t.weight, m.totalBytes ? fmtBytes(m.totalBytes) : '–', '')}${row(t.requests, m.requests ?? '–', '')}</table></section>
  <section><h2>${t.issues(issues.length)}</h2>${issues.length ? `<ul class="issues">${issues.map((i) => `<li class="${i.sev}"><span class="badge ${i.sev === 'high' ? 'poor' : i.sev === 'medium' ? 'needs' : 'good'}">${t.sev[i.sev]}</span><b>${i.title}</b><p>${i.why}</p>${i.detail ? `<p class="muted small">${i.detail}</p>` : ''}</li>`).join('')}</ul>` : `<p>${t.noIssues}</p>`}
  ${oks.length ? `<h3>${t.okList}</h3><p class="oks">${oks.map((o) => `<span class="chip">✓ ${esc(o)}</span>`).join(' ')}</p>` : ''}</section>
  ${orderBox(lang, env, job.url, t)}
  <section><p class="muted small">${t.share} <code>${esc(link)}</code></p>${scanForm(lang, '')}<p class="muted small">${lang === 'pl' ? '↑ ' + t.again : '↑ ' + t.again}</p></section>`;
}
