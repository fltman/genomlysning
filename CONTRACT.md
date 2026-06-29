# Genomlysning — internt kontrakt (single source of truth)

Detta dokument är den auktoritativa specen för hur modulerna pratar med varandra.
Alla filer ska implementera exakt dessa former. Ändra hellre detta dokument än att
låta en modul drifta från det.

> **Genomlysning** är en lättviktig Chrome-extension (Manifest V3) som låter vem som
> helst granska en valfri (nyhets)sajt: den kartlägger varje tredjepartsanrop, läser
> sajtens cookie-/integritetspolicy, och låter en LLM (via användarens egen
> OpenRouter-nyckel) säga rakt ut var **underdriften** sitter — särskilt när känslig
> data (GDPR art. 9, t.ex. politiska åsikter) riskerar läcka till t.ex. Meta.

## Designprinciper (icke förhandlingsbara)
1. **Lättvikt, medborgargranskning.** Ingen server vi driver. Allt lokalt utom ett
   enda anrop till OpenRouter med användarens egen nyckel, och bara när användaren
   klickar "Genomlys".
2. **Transparens om oss själva (#212-spärren).** UI:t måste visa exakt vad som skickas
   till OpenRouter innan/efter analys. Vi spårar inte användaren.
3. **Bevis, inte spekulation.** Allt vi påstår ska gå att härleda ur fångade anrop,
   cookies eller policytext. Meta-pixelns `dl`-param (sidans URL) är konkret bevis.
4. **Mät samtycke genom att inte ge det.** Vi laddar om sidan och rör INTE
   cookie-banderollen. Allt som ändå avfyras = laddat utan samtycke.
5. **Svenska i UI och rapport.** Korrekta å ä ö överallt. Aldrig hårdkodad
   språkkorrigering via regexp.

## Filöversikt
```
manifest.json                      (skriven)
src/shared/messages.js             (skriven) — meddelandekonstanter + helpers
src/shared/schema.js               (skriven) — JSDoc-typer + ANALYSIS_JSON_SCHEMA
src/background/tracker-db.js       (skriven) — entitetsdatabas, classify(), etldPlus1()
src/background/capture.js          (skriven) — request-buffer + parseBeacon()
src/background/service-worker.js   (workflow) — webRequest/cookies-fångst + orkestrering
src/content/content.js             (workflow) — sidskrap, policy-länkar, CMP-detektion
src/analysis/prompt.js             (workflow) — bygger analys-prompten från fångad data
src/analysis/openrouter.js         (workflow) — OpenRouter-klient (användarens nyckel)
src/sidepanel/sidepanel.html       (workflow)
src/sidepanel/sidepanel.css        (workflow)
src/sidepanel/sidepanel.js         (workflow) — orkestrerar scan + rendering
src/sidepanel/render.js            (workflow) — rapport-rendering (DOM)
src/options/options.html           (workflow)
src/options/options.css            (workflow)
src/options/options.js             (workflow) — nyckel/modell/språk-inställningar
README.md                          (workflow)
icons/                             (genereras)
```

## Modulsystem
- **service-worker.js** körs som ES-modul (`"type":"module"` i manifest). Får
  `import` från `tracker-db.js`, `capture.js`, `shared/messages.js`, `shared/schema.js`.
- **sidepanel.js** och **options.js** laddas som `<script type="module">`. Får importera
  från `shared/`, `analysis/`. Får INTE importera från background — prata via
  `chrome.runtime.sendMessage`.
- **content.js** är ett klassiskt content script (INGA `import`/ES-moduler). Helt
  fristående. Konstanter dupliceras vid behov.

## Inställningar (chrome.storage.local)
Nyckel `geno_settings`:
```js
{ apiKey: string, model: string, reportLanguage: "sv"|"en", redactBeforeSend: boolean }
```
Default: `{ apiKey:"", model:"anthropic/claude-sonnet-4.6", reportLanguage:"sv", redactBeforeSend:false }`.
Modellfältet är fritext (användaren är OpenRouter-van) med en `<datalist>` av förslag.

## Meddelandeprotokoll
Alla meddelanden är `{type, ...}`. Typkonstanter finns i `shared/messages.js` (MSG.*).

### Side panel → background  (chrome.runtime.sendMessage, async svar)
- `{type: MSG.START_SCAN, tabId}`
  Background: nollställer buffer för tabId, sätter capturing=true, anropar
  `chrome.tabs.reload(tabId)`, väntar på `onUpdated status==='complete'` + settle 2500ms,
  sätter capturing=false, svarar:
  `{ok:true, result: ScanResult}` eller `{ok:false, error}`.
  (Returnera `true` från listenern för att hålla kanalen öppen till sendResponse.)
- `{type: MSG.GET_BUFFER, tabId}` → `{ok:true, result: ScanResult}` (senaste utan ny scan).

### Side panel → content script  (chrome.tabs.sendMessage(tabId, ...))
- `{type: MSG.SCRAPE}` → svar: `PageScrape`.

## Dataformer

### CapturedRequest
```js
{
  url: string,
  domain: string,            // hostname
  etld1: string,             // eTLD+1 (grupperingsnyckel)
  type: string,              // webRequest resourceType: "script","image","xmlhttprequest","ping","sub_frame",...
  initiator: string|null,
  timeStamp: number,
  thirdParty: boolean,       // etld1(domain) !== etld1(sidans domän)
  entity: string|null,       // "Meta","Google",... eller null
  category: string|null,     // "advertising","analytics","social","session-recording","cdn","tag-manager","other"
  sensitivity: "high"|"medium"|"low"|null,
  isTracker: boolean,
  beacon: null | {           // från parseBeacon(url)
    kind: string,            // "meta-pixel","ga4","gtm","tiktok","generic"
    leaked: { [k:string]: string }  // t.ex. {dl:"https://expressen.se/...", rl:"...", ev:"PageView"}
  }
}
```

### CookieInfo
```js
{ name, domain, etld1, session:boolean, expiresInDays:number|null,
  httpOnly:boolean, secure:boolean, sameSite:string,
  thirdParty:boolean, entity:string|null, category:string|null }
```
Cookie-VÄRDEN skickas aldrig vidare (bara namn/metadata).

### ScanResult  (background → side panel)
```js
{
  pageUrl: string,
  pageDomain: string,
  pageEtld1: string,
  capturedAt: number,
  requests: CapturedRequest[],   // bara thirdParty===true behålls i bufferten
  cookies: CookieInfo[],
  stats: {
    totalThirdPartyRequests: number,
    trackerRequests: number,
    distinctEntities: number,
    thirdPartyCookies: number
  }
}
```

### PageScrape  (content script → side panel)
```js
{
  title: string,
  url: string,
  lang: string,
  excerpt: string,            // ~1500 tecken brödtext för art.9-klassning
  fullTextLength: number,
  policyLinks: { text:string, href:string }[],   // upp till ~8 kandidater
  cmp: { detected:boolean, vendor:string|null, signals:string[] },  // OneTrust/Cookiebot/Didomi/Sourcepoint/TCF...
  embeddedTrackers: string[]  // t.ex. ["Meta Pixel","Google Analytics","GTM"] hittade i DOM/script-src
}
```

## Analys-LLM (OpenRouter)
`openrouter.js` POST:ar till `https://openrouter.ai/api/v1/chat/completions` med
`Authorization: Bearer <apiKey>`, header `HTTP-Referer: https://genomlysning.local`,
`X-Title: Genomlysning`. Body: `{model, messages, response_format: {type:"json_schema",
json_schema: ANALYSIS_JSON_SCHEMA}, temperature:0.2}`.

`prompt.js` exporterar `buildMessages({scan, scrape, policyTexts, settings}) -> messages[]`
(system + user). Användarmeddelandet bäddar in: entitets-grupperade trackers med
notabla beacon-params (särskilt Meta `dl`), tredjepartscookies, sidtitel+excerpt för
art.9-klassning, CMP-info, samt policytext(er). System-prompten instruerar modellen att
vara konkret, citera policyn, peka ut underdrift, och fylla ANALYSIS_JSON_SCHEMA.
Rapportspråk styrs av `settings.reportLanguage`.

### ANALYSIS_JSON_SCHEMA (resultatform — definieras i shared/schema.js)
```js
{
  verdict: { headline:string, bluntStatement:string, summary:string, severity:1..5 },
  consent: { cmpDetected:boolean, cmpVendor:string|null,
             trackersFiredBeforeConsent:number, assessment:string },
  sensitiveData: [ { category:string, evidence:string, recipient:string,
                     howLeaked:string, gdprArticle:string, severity:1..5 } ],
  policyGaps: [ { policyClaim:string, reality:string, gapType:string, gdprReference:string } ],
  trackerSummary: [ { entity:string, category:string, requestCount:number, whatTheyGot:string } ],
  recommendations: [ string ]
}
```
Alla strängar på `reportLanguage` (default svenska, korrekta å ä ö).

## Scan-flöde (drivs av sidepanel.js)
1. Läs settings. Saknas apiKey → visa "öppna inställningar".
2. Hämta aktiv flik (`chrome.tabs.query({active:true,currentWindow:true})`).
3. `START_SCAN` → background (laddar om + fångar). Visa progress.
4. `chrome.tabs.sendMessage(tabId, {type:MSG.SCRAPE})` → PageScrape.
5. Hämta policytext: för upp till 2 bästa `policyLinks` → `fetch(href)`, strippa HTML
   till text (cap ~12000 tecken/sida). Best-effort; fel ignoreras per länk.
6. `buildMessages(...)` → `openrouter.callAnalysis(...)` → AnalysisResult.
7. `render.js` ritar rapporten. Visa även "Detta skickades till OpenRouter".

## Felhantering
- Saknad nyckel, OpenRouter-fel, ingen policy hittad, scrape-timeout: visa tydligt
  svenskt felmeddelande i panelen, krascha aldrig tyst.
