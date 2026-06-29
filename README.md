# Genomlysning

**Lättviktig medborgargranskning av tredjepartsspårning — direkt i webbläsaren.**

Genomlysning är en Chrome-extension (Manifest V3) som låter vem som helst granska en
valfri sajt: den kartlägger varje tredjepartsanrop, läser sajtens cookie- och
integritetspolicy mot vad som faktiskt händer, och låter en LLM (via din egen
OpenRouter-nyckel) säga rakt ut var **underdriften** sitter.

Det man förr fick sitta och göra för hand med Ghostery och nätverksfliken anno 2018 —
nu på några sekunder, för en hel sajt, med en konkret bedömning på köpet.

---

## Visionen

Två ledstjärnor styr allt i projektet:

1. **Fånga inte bara *att* en Facebook-pixel finns — utan *vilken känslig data* som
   riskerar läcka.** Att en Meta-pixel laddas är trivialt att se. Det intressanta är att
   pixelns `dl`-parameter ofta innehåller *hela sidans URL*. På en nyhetssajt kan den
   URL:en avslöja att du läser om ett visst parti, en viss sjukdom eller en viss
   trosuppfattning — alltså särskilda kategorier av personuppgifter enligt **GDPR
   artikel 9** (t.ex. politiska åsikter, hälsa, religion). Genomlysning pekar ut just den
   sortens läckage med konkret bevis, inte bara en lista över "trackers".

2. **Håll det lättviktigt.** Det här ska vara en granskning som vem som helst kan köra
   på en kvart — inte en compliance-koloss som bara de stora drakarna har råd med.
   Ingen server vi driver, inget konto, inget abonnemang. En extension, din egen nyckel,
   en knapp.

---

## Hur det funkar tekniskt

1. **Mät samtycke genom att inte ge det.** När du klickar "Genomlys den här sidan"
   laddas sidan om — och vi rör **aldrig** cookie-banderollen. Allt som ändå avfyras
   räknas därför som laddat *utan samtycke*. Det är själva poängen: trackers som ligger
   före samtyckesvalet är de mest problematiska.
2. **Fånga nätverksanropen.** Via `webRequest` fångas alla tredjepartsanrop sidan gör.
   Varje anrop klassas mot en kurerad tracker-databas (entitet, kategori, känslighet).
3. **Plocka ut den faktiska payloaden.** För kända beacons (Meta-pixel, GA4, GTM, TikTok
   m.fl.) parsas själva URL:en så vi ser vad som faktiskt skickas — t.ex. Meta-pixelns
   `dl` (sidans URL), `rl` (referrer) och `ev` (händelsenamn).
4. **Läs policyn.** Content-scriptet skrapar sidan: titel, brödtext (för art.9-klassning),
   länkar till cookie-/integritetspolicy, vilken samtyckesplattform (CMP) som används
   (OneTrust, Cookiebot, Didomi, Sourcepoint, TCF …) och vilka trackers som syns redan i
   DOM:en. Policytexten hämtas och strippas till ren text.
5. **Låt en LLM döma.** Bevis (trackers, beacon-parametrar, cookies) plus policytext
   skickas till OpenRouter med din egen nyckel. Svaret tvingas in i ett strikt JSON-schema
   och renderas som en strukturerad rapport: omdöme, samtyckesanalys, känsligt
   dataläckage, policygap (vad policyn *påstår* mot verkligheten), tracker-sammanfattning
   och rekommendationer.

---

## Installation

1. Öppna `chrome://extensions` i Chrome.
2. Slå på **Utvecklarläge** (växeln uppe till höger).
3. Klicka **"Läs in okomprimerat"**.
4. Välj mappen `/Users/andersbj/Projekt/genomlysning`.

Extensionen dyker nu upp i verktygsfältet.

---

## Kom igång

1. **Skaffa en OpenRouter-nyckel:** https://openrouter.ai/keys
2. Öppna extensionens **Inställningar** och klistra in nyckeln. Här väljer du även modell
   (fritext med förslag — standard är `anthropic/claude-sonnet-4.6`) och rapportspråk
   (svenska eller engelska).
3. Klicka på **verktygsikonen** för att öppna sidopanelen.
4. Gå till en nyhetssajt (eller vilken sajt du vill) och klicka **"Genomlys den här
   sidan"**.
5. Sidan laddas om, anropen fångas, policyn läses, och du får en rapport på några
   sekunder.

---

## Integritet (#212-spärren)

Genomlysning är byggt för att granska andras spårning — då vore det pinsamt att spåra
dig.

- **Allt körs lokalt.** Det enda externa anropet går till OpenRouter, med **din egen
  nyckel**, och bara när du själv klickar "Genomlys".
- **Ingen användarspårning.** Vi har ingen server, ingen analytics, ingen telemetri.
- **Cookie-värden lämnar aldrig datorn.** Vi skickar bara cookie-*namn* och metadata
  (domän, livslängd, flaggor) till analysen — aldrig själva värdena.
- **Full transparens om oss själva.** Panelen visar exakt vad som skickades till
  OpenRouter, så du kan granska granskaren.

---

## Begränsningar

Det här är en **prototyp**, och en ärlig sådan:

- **eTLD+1 är en heuristik.** Grupperingen av domäner använder en förenklad regel, inte
  hela Public Suffix List (PSL). Ovanliga toppdomäner kan grupperas fel.
- **Tracker-databasen är kurerad, inte heltäckande.** Den känner igen de stora aktörerna
  och vanliga beacons. Okända trackers visas men kan sakna entitet/kategori.
- **LLM:en kan ha fel.** Verktyget pekar ut **misstankar att granska vidare** — inte
  juridiska domslut. Behandla rapporten som en kvalificerad utgångspunkt, inte ett facit.
- **En sida i taget.** Genomlysningen gäller den sida du står på, inte hela sajten.

---

## Projektstruktur

```
genomlysning/
├── manifest.json                  Manifest V3-konfiguration
├── README.md                      Den här filen
├── CONTRACT.md                    Auktoritativ spec (meddelandeprotokoll + dataformer)
├── icons/                         Verktygsikoner (16/48/128)
└── src/
    ├── shared/
    │   ├── messages.js            Meddelandekonstanter + sendToBackground/sendToTab
    │   └── schema.js              DEFAULT_SETTINGS, load/saveSettings, ANALYSIS_JSON_SCHEMA
    ├── background/
    │   ├── service-worker.js      webRequest/cookies-fångst + orkestrering
    │   ├── tracker-db.js          Entitetsdatabas, classify(), etldPlus1()
    │   └── capture.js             Request-buffer, parseBeacon(), buildScanResult()
    ├── content/
    │   └── content.js             Sidskrap: policy-länkar, CMP-detektion, brödtext
    ├── analysis/
    │   ├── prompt.js              Bygger analys-prompten från fångad data
    │   └── openrouter.js          OpenRouter-klient (din egen nyckel)
    ├── sidepanel/
    │   ├── sidepanel.html
    │   ├── sidepanel.css
    │   ├── sidepanel.js           Orkestrerar scan + rendering
    │   └── render.js              Rapport-rendering (DOM)
    └── options/
        ├── options.html
        ├── options.css
        └── options.js            Nyckel-/modell-/språkinställningar
```

---

## Licens

MIT. Se `LICENSE` om sådan medföljer, annars gäller MIT-villkoren i sin helhet.
