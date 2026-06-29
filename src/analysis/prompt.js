// Bygger analys-prompten (system + user) från fångad scan-data, sidskrap och
// policytext. Ren strängbyggnad — inga externa beroenden.
//
// Designprincip (se CONTRACT.md): bevis, inte spekulation. Allt som bäddas in här
// ska gå att härleda ur fångade anrop, cookies eller policytext. Meta-pixelns
// dl-param (sidans URL) är konkret bevis och lyfts därför särskilt.

/** Hur många notabla beacons (konkret bevis) vi som mest tar med. */
const MAX_BEACONS = 25;
/** Hur många cookie-namn vi som mest listar per aktör. */
const MAX_COOKIE_NAMES = 12;
/** Maxlängd på sidans textutdrag. */
const MAX_EXCERPT = 2000;
/** Maxlängd på den sammanslagna policytexten (anroparen kapar redan per sida). */
const MAX_POLICY_TOTAL = 24000;

const SENSITIVITY_RANK = { high: 3, medium: 2, low: 1 };
const SENSITIVITY_SV = { high: "hög", medium: "medel", low: "låg" };

/**
 * Bygg meddelandelistan för OpenRouter-analysen.
 * @param {object} args
 * @param {import("../shared/schema.js").ScanResult} args.scan
 * @param {import("../shared/schema.js").PageScrape} [args.scrape]
 * @param {Array<string|{url?:string,title?:string,text:string}>} [args.policyTexts]
 *        Redan kapade policytexter (sträng eller {url,title,text} per länk).
 * @param {typeof import("../shared/schema.js").DEFAULT_SETTINGS} args.settings
 * @returns {Array<{role:"system"|"user", content:string}>}
 */
export function buildMessages({ scan, scrape, policyTexts, settings }) {
  const lang = (settings && settings.reportLanguage) || "sv";
  const redact = !!(settings && settings.redactBeforeSend);
  return [
    { role: "system", content: buildSystemPrompt(lang) },
    { role: "user", content: buildUserContent({ scan, scrape, policyTexts, redact }) },
  ];
}

/* ────────────────────────────────────────────────────────────────────────── */
/* System-prompt                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

function buildSystemPrompt(lang) {
  const languageLine =
    lang === "en"
      ? "Skriv HELA svaret (alla strängar i JSON-objektet) på engelska."
      : "Skriv HELA svaret (alla strängar i JSON-objektet) på svenska, med korrekta å, ä, ö.";

  return [
    "Du är en skarp men saklig integritetsgranskare. Din uppgift är att granska en",
    "webbsida och säga rakt ut var underdriften sitter: glappet mellan vad sajtens",
    "cookie-/integritetspolicy påstår och vad sidan faktiskt gör.",
    "",
    "ARBETSSÄTT:",
    "- Var konkret. Svepande formuleringar är värdelösa — peka på den faktiska aktören,",
    "  det faktiska anropet, den faktiska parametern.",
    "- Citera eller parafrasera policyn nära originalet när du påstår att den säger något.",
    "- Peka EXPLICIT ut underdriften: ställ policyns påstående mot den uppmätta verkligheten.",
    "- Basera ALLA påståenden ENBART på det medföljande beviset (fångade anrop, cookies,",
    "  CMP-signaler, sidtext, policytext). Hitta ALDRIG på siffror, aktörer eller citat.",
    "- Om policytext saknas eller inte kunde hämtas: säg det rakt ut, och bedöm då bara",
    "  utifrån det tekniska beviset utan att låtsas känna till policyns ordalydelse.",
    "",
    "NYCKELINSIKT OM SAMTYCKE (mät samtycke genom att inte ge det):",
    "- Sidan laddades om av granskningsverktyget UTAN att någon klickade i",
    "  cookie-banderollen vid denna omladdning. Spårare som ändå syns i datan",
    "  avfyrades alltså utan att samtycke gavs vid omladdningen.",
    "- VIKTIG BRASKLAPP: verktyget rensar INTE tidigare lagrat samtycke. Har besökaren",
    "  accepterat tidigare kan en CMP avfyra spårare på giltigt tidigare samtycke. Om",
    "  consent-cookies finns i datan (markeras nedan) — sänk säkerheten och formulera",
    "  det som 'avfyrades utan förnyat samtycke vid omladdningen', inte som ett brott.",
    "- Om en CMP är detekterad, spårare avfyrades OCH inga consent-cookies finns, är det",
    "  en starkare indikation på spårning utan samtycke.",
    "- Sätt consent.trackersFiredBeforeConsent till antalet spårar-anrop i datan och",
    "  beskriv osäkerheten tydligt i consent.assessment.",
    "",
    "KÄNSLIG DATA (GDPR art. 9) — prioritera detta, men ram in som MISSTANKE:",
    "- Lyft särskilt RISK för läckage av känslig data: politiska åsikter, hälsa, religion,",
    "  sexuell läggning, etnicitet, facklig tillhörighet.",
    "- Konkret exempel: när sidans URL (t.ex. i Meta Pixelns dl-parameter eller GA4:s",
    "  dl/dt) avslöjar ett känsligt ämne — en artikel om ett politiskt parti, en sjukdom",
    "  eller en religiös fråga — KAN art. 9-data läcka till mottagaren (t.ex. Meta) och bör granskas.",
    "- VIKTIGT om slutledning: att en sid-URL rör ett känsligt ämne BEVISAR INTE att",
    "  läsaren själv har egenskapen (en redaktör eller slumpläsare avslöjar inte sin hälsa).",
    "  Formulera fynden som risk/indikation att granska vidare — ALDRIG som juridiskt domslut.",
    "- Använd den faktiska URL:en som bevis i sensitiveData[].evidence och beskriv hur",
    "  den kan läcka i howLeaked. Bedöm ämnet utifrån sidans titel/utdrag och URL:en.",
    "  (Om URL:er har maskats av användaren saknas detta bevis — säg det rakt ut.)",
    "",
    "SEVERITY (kalibrera 1–5):",
    "- 1 = oskyldigt (enstaka funktionell tredjepart, ingen känslig data).",
    "- 3 = tydlig spårning utan att samtycke gavs, men ingen art. 9-data.",
    "- 5 = grov underdrift och/eller tydlig risk för läckage av känslig art. 9-data till annonsnätverk.",
    "",
    languageLine,
    "",
    "Svaret MÅSTE vara giltig JSON som exakt följer det begärda JSON-schemat",
    "(response_format). Lägg inga fält till eller dra ifrån. Ingen text utanför JSON-objektet.",
  ].join("\n");
}

/* ────────────────────────────────────────────────────────────────────────── */
/* User-content                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

function buildUserContent({ scan, scrape, policyTexts, redact }) {
  const sections = [];
  sections.push(sectionPage(scan, scrape, redact));
  sections.push(sectionStats(scan));
  sections.push(sectionThirdParties(scan));
  sections.push(sectionBeacons(scan, redact));
  sections.push(sectionCookies(scan));
  sections.push(sectionCmpEmbedded(scrape, scan));
  sections.push(sectionPolicy(policyTexts));
  return sections.join("\n\n");
}

function sectionPage(scan, scrape, redact) {
  const rawUrl = (scrape && scrape.url) || (scan && scan.pageUrl) || "(okänd)";
  const url = redact ? maskUrl(rawUrl) : rawUrl;
  const title = (scrape && scrape.title) || "(okänd)";
  const lang = (scrape && scrape.lang) || "(okänt)";
  const excerpt = clip((scrape && scrape.excerpt) || "", MAX_EXCERPT);
  const lines = [
    "=== SIDA ===",
    "URL: " + url,
    "Titel: " + title,
    "Språk: " + lang,
  ];
  if (redact) {
    lines.push("(URL:er har maskats enligt användarens inställning — endast domän/origin visas.)");
  }
  if (excerpt) {
    lines.push("Utdrag (brödtext, för art. 9-bedömning):");
    lines.push(excerpt);
  } else {
    lines.push("Utdrag: (ingen brödtext fångad)");
  }
  return lines.join("\n");
}

function sectionStats(scan) {
  const s = (scan && scan.stats) || {};
  return [
    "=== STATISTIK ===",
    "Tredjepartsanrop totalt: " + num(s.totalThirdPartyRequests),
    "Varav spårar-anrop: " + num(s.trackerRequests),
    "Distinkta aktörer: " + num(s.distinctEntities),
    "Tredjepartscookies: " + num(s.thirdPartyCookies),
    "(Sidan laddades om utan att röra cookie-banderollen vid denna omladdning. Tidigare lagrat samtycke rensas dock inte — se consent-cookies nedan.)",
  ].join("\n");
}

function sectionThirdParties(scan) {
  const requests = (scan && scan.requests) || [];
  if (!requests.length) {
    return "=== TREDJEPARTER (grupperade per aktör) ===\n(Inga tredjepartsanrop fångades.)";
  }
  // Gruppera per aktör; okända faller tillbaka på eTLD+1.
  const groups = new Map();
  for (const r of requests) {
    const key = r.entity || (r.etld1 ? "Okänd: " + r.etld1 : "Okänd");
    let g = groups.get(key);
    if (!g) {
      g = { name: key, category: r.category || "unknown", count: 0, sensRank: 0, tracker: false };
      groups.set(key, g);
    }
    g.count++;
    if (r.isTracker) g.tracker = true;
    const rank = SENSITIVITY_RANK[r.sensitivity] || 0;
    if (rank > g.sensRank) {
      g.sensRank = rank;
    }
    // Behåll en meningsfull kategori (helst spårar-kategori framför "unknown").
    if (g.category === "unknown" && r.category && r.category !== "unknown") {
      g.category = r.category;
    }
  }
  const sorted = [...groups.values()].sort((a, b) => {
    if (b.sensRank !== a.sensRank) return b.sensRank - a.sensRank;
    return b.count - a.count;
  });
  const lines = ["=== TREDJEPARTER (grupperade per aktör) ==="];
  for (const g of sorted) {
    const sens = g.sensRank ? sensLabel(g.sensRank) : "okänd";
    const flag = g.tracker ? " [spårare]" : "";
    lines.push(`- ${g.name} — ${g.category} — ${g.count} anrop — känslighet: ${sens}${flag}`);
  }
  return lines.join("\n");
}

function sectionBeacons(scan, redact) {
  const requests = (scan && scan.requests) || [];
  const notable = [];
  for (const r of requests) {
    const b = r.beacon;
    if (!b || !b.leaked) continue;
    if ((b.kind === "meta-pixel" || b.kind === "ga4") && b.leaked.dl) {
      notable.push(r);
    }
    if (notable.length >= MAX_BEACONS) break;
  }
  if (!notable.length) {
    return "=== NOTABLA BEACONS (konkret bevis på vad som skickades) ===\n(Inga Meta Pixel-/GA4-beacons med läckt sid-URL fångades.)";
  }
  const lines = ["=== NOTABLA BEACONS (konkret bevis på vad som skickades) ==="];
  if (redact) {
    lines.push("(URL:er maskade enligt användarens inställning — den exakta sid-URL:en som skickades döljs.)");
  }
  for (const r of notable) {
    const b = r.beacon;
    const who = r.entity || r.domain || "(okänd mottagare)";
    const parts = [`[${b.kind}] mottagare: ${who}`];
    const dl = redact ? maskUrl(b.leaked.dl) + " (maskad)" : b.leaked.dl;
    parts.push("    dl (sidans URL som skickades): " + dl);
    if (b.kind === "meta-pixel" && b.leaked.ev) parts.push("    ev (händelse): " + b.leaked.ev);
    if (b.kind === "ga4" && b.leaked.dt && !redact) parts.push("    dt (sidtitel): " + b.leaked.dt);
    lines.push(parts.join("\n"));
  }
  return lines.join("\n");
}

function sectionCookies(scan) {
  const cookies = ((scan && scan.cookies) || []).filter((c) => c && c.thirdParty);
  if (!cookies.length) {
    return "=== TREDJEPARTSCOOKIES (per aktör, endast namn) ===\n(Inga tredjepartscookies fångades.)";
  }
  const groups = new Map();
  for (const c of cookies) {
    const key = c.entity || (c.etld1 ? "Okänd: " + c.etld1 : "Okänd");
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    if (c.name) arr.push(c.name);
  }
  const lines = ["=== TREDJEPARTSCOOKIES (per aktör, endast namn) ==="];
  for (const [name, names] of groups) {
    const shown = names.slice(0, MAX_COOKIE_NAMES);
    const extra = names.length > shown.length ? ` (+${names.length - shown.length} till)` : "";
    lines.push(`- ${name}: ${shown.join(", ")}${extra}`);
  }
  return lines.join("\n");
}

function sectionCmpEmbedded(scrape, scan) {
  const lines = ["=== CMP / SAMTYCKE & INBÄDDADE SPÅRARE ==="];
  const cmp = (scrape && scrape.cmp) || null;
  if (cmp) {
    lines.push("CMP (cookie-banderoll) detekterad: " + (cmp.detected ? "ja" : "nej"));
    lines.push("CMP-leverantör: " + (cmp.vendor || "(okänd)"));
    const signals = Array.isArray(cmp.signals) ? cmp.signals : [];
    lines.push("CMP-signaler: " + (signals.length ? signals.join(", ") : "(inga)"));
  } else {
    lines.push("CMP: (ingen information)");
  }
  const embedded = (scrape && scrape.embeddedTrackers) || [];
  lines.push(
    "Inbäddade spårare i DOM/script: " + (embedded.length ? embedded.join(", ") : "(inga upptäckta)")
  );

  // Consent-cookies indikerar att besökaren kan ha gjort ett tidigare samtyckesval.
  const consentCookies = detectConsentCookies(scan);
  if (consentCookies.length) {
    lines.push(
      "Consent-cookies funna (indikerar TIDIGARE samtyckesval — sänk säkerheten i samtyckesbedömningen): " +
        consentCookies.join(", ")
    );
  } else {
    lines.push(
      "Consent-cookies funna: (inga kända) — stärker indikationen att spårare avfyrades utan att samtycke gavs."
    );
  }
  return lines.join("\n");
}

function sectionPolicy(policyTexts) {
  // Anroparen skickar antingen strängar eller {url,title,text}. Hantera båda.
  const docs = (Array.isArray(policyTexts) ? policyTexts : [])
    .map((t) => {
      if (typeof t === "string") return { text: t.trim() };
      if (t && typeof t.text === "string") {
        return { url: t.url, title: t.title, text: t.text.trim() };
      }
      return null;
    })
    .filter((d) => d && d.text);

  if (!docs.length) {
    return [
      "=== POLICYTEXT ===",
      "Ingen policytext kunde hämtas. Påpeka i analysen att policyn inte gick att läsa,",
      "och bedöm enbart utifrån det tekniska beviset ovan.",
    ].join("\n");
  }

  const blocks = docs.map((d) => {
    const label = d.title || d.url;
    const head = label
      ? `--- Källa: ${d.title || ""}${d.url ? " (" + d.url + ")" : ""} ---`
      : "--- policy-dokument ---";
    return head + "\n" + d.text;
  });
  let joined = blocks.join("\n\n");
  joined = clip(joined, MAX_POLICY_TOTAL);
  return "=== POLICYTEXT (citera/parafrasera härifrån) ===\n" + joined;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Hjälpare                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

function num(n) {
  return Number.isFinite(n) ? String(n) : "0";
}

/** Maska en URL till origin + "/…" (behåll domän, dölj path/query). */
function maskUrl(u) {
  try {
    return new URL(u).origin + "/…";
  } catch {
    return "(maskad URL)";
  }
}

/** Kända consent-cookie-namn (substrängar, gemener). */
const CONSENT_COOKIE_HINTS = [
  "optanon",        // OneTrust (OptanonConsent, OptanonAlertBoxClosed)
  "cookieconsent",  // Cookiebot
  "euconsent",      // IAB TCF (euconsent-v2)
  "eupubconsent",   // IAB TCF
  "didomi",         // Didomi
  "usprivacy",      // CCPA
  "cookieyes",      // CookieYes
  "cky-",           // CookieYes
  "complianz",      // Complianz
  "borlabs",        // Borlabs
  "consentmanager", // consentmanager.net
  "cmpconsent",     // div. CMP
  "cookie_consent",
  "cookies_accepted",
  "cookie-agreed",  // EU Cookie Compliance (Drupal)
];

/**
 * Hitta consent-cookies i scan-datan (indikerar tidigare samtyckesval).
 * @param {import("../shared/schema.js").ScanResult} scan
 * @returns {string[]}
 */
function detectConsentCookies(scan) {
  const cookies = (scan && scan.cookies) || [];
  const found = [];
  const seen = new Set();
  for (const c of cookies) {
    const name = (c && c.name ? String(c.name) : "").toLowerCase();
    if (!name) continue;
    if (CONSENT_COOKIE_HINTS.some((h) => name.includes(h))) {
      const label = c.name + (c.domain ? " (" + c.domain + ")" : "");
      if (!seen.has(label)) {
        seen.add(label);
        found.push(label);
      }
    }
  }
  return found.slice(0, 12);
}

function sensLabel(rank) {
  if (rank >= 3) return SENSITIVITY_SV.high;
  if (rank === 2) return SENSITIVITY_SV.medium;
  if (rank === 1) return SENSITIVITY_SV.low;
  return "okänd";
}

function clip(s, n) {
  if (typeof s !== "string") return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
