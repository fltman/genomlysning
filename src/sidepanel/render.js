// render.js — bygger rapport-DOM från analysresultatet.
//
// SÄKERHET: All sajt- och LLM-data ritas med document.createElement +
// textContent. ALDRIG innerHTML för otillförlitlig data (URL:er, policytext och
// modellsvar är osäkra och kan innehålla HTML/script). Endast statiska, av oss
// kontrollerade strängar förekommer som literaler.
//
// SPRÅK: alla fasta etiketter slås upp i LABELS[lang] (sv/en) så att rapporten
// blir konsekvent på det språk användaren valt i inställningarna.

const LABELS = {
  sv: {
    result: "Resultat",
    noAnalysis: "Ingen analys kunde tolkas från svaret.",
    headlineFallback: "Granskning klar",
    severityWord: "Allvarsgrad",
    severity: {
      1: "Oskyldigt",
      2: "Mindre anmärkning",
      3: "Tveksamt",
      4: "Allvarligt",
      5: "Grov underdrift / känslig dataläcka",
    },
    category: {
      advertising: "Annonsering",
      analytics: "Analys & mätning",
      social: "Sociala plattformar",
      "session-recording": "Sessionsinspelning",
      "data-broker": "Datamäklare",
      "tag-manager": "Tagghanterare",
      "ab-testing": "A/B-test & optimering",
      marketing: "Marknadsföring & e-post",
      affiliate: "Affiliate & konvertering",
      "customer-support": "Kundsupport / chatt",
      cdn: "CDN & innehåll",
      consent: "Samtycke (CMP)",
      other: "Övrigt / funktionellt",
      unknown: "Okänt",
    },
    cardVerdict: "Verdikt",
    cardConsent: "Samtycke",
    cardSensitive: "Känslig data (GDPR art. 9)",
    cardGaps: "Underdrift & policyglapp",
    cardTrackerMap: "Spårningskarta",
    cardAdvice: "Råd",
    consentNone: "Ingen bedömning av samtycke kunde göras.",
    firedOne: "spårare avfyrades utan att samtycke gavs vid omladdningen",
    firedMany: "spårare avfyrades utan att samtycke gavs vid omladdningen",
    cmpWithVendor: (v) => `Cookie-banner (CMP): ${v}`,
    cmpDetectedUnknown: "Cookie-banner (CMP): upptäckt, okänd leverantör",
    cmpNone: "Cookie-banner (CMP): ingen upptäckt",
    sensitiveNone: "Ingen art. 9-risk hittad i denna mätning.",
    sensitiveCategoryFallback: "Känslig kategori",
    labelRecipient: "Mottagare:",
    labelHow: "Hur:",
    labelGdpr: "GDPR:",
    labelEvidence: "Bevis:",
    gapsNone: "Inga tydliga glapp mellan policytext och uppmätt verklighet hittades.",
    labelPolicySays: "Policyn säger:",
    labelReality: "Verkligheten:",
    statThirdParty: "tredjepartsanrop",
    statTracking: "spårningsanrop",
    statEntities: "aktörer",
    statCookies: "tredjepartscookies",
    trackerMapNone: "Inga spårningsaktörer sammanställdes.",
    requestsWord: "anrop",
    entityFallback: "Okänd aktör",
    rawSummary: (n, m) => `Rådata: ${n} distinkta aktörer, ${m} anrop`,
    rawNone: "Inga tredjepartsanrop fångades.",
    adviceNone: "Inga särskilda råd.",
    reviewedAt: (d) => `Granskad ${d}`,
    modelWord: (m) => `modell: ${m}`,
    dateLocale: "sv-SE",
  },
  en: {
    result: "Result",
    noAnalysis: "No analysis could be parsed from the response.",
    headlineFallback: "Review complete",
    severityWord: "Severity",
    severity: {
      1: "Harmless",
      2: "Minor remark",
      3: "Questionable",
      4: "Serious",
      5: "Severe understatement / sensitive data leak",
    },
    category: {
      advertising: "Advertising",
      analytics: "Analytics & measurement",
      social: "Social platforms",
      "session-recording": "Session recording",
      "data-broker": "Data brokers",
      "tag-manager": "Tag managers",
      "ab-testing": "A/B testing & optimization",
      marketing: "Marketing & email",
      affiliate: "Affiliate & conversion",
      "customer-support": "Customer support / chat",
      cdn: "CDN & content",
      consent: "Consent (CMP)",
      other: "Other / functional",
      unknown: "Unknown",
    },
    cardVerdict: "Verdict",
    cardConsent: "Consent",
    cardSensitive: "Sensitive data (GDPR Art. 9)",
    cardGaps: "Understatement & policy gaps",
    cardTrackerMap: "Tracking map",
    cardAdvice: "Advice",
    consentNone: "No consent assessment could be made.",
    firedOne: "tracker fired without consent on reload",
    firedMany: "trackers fired without consent on reload",
    cmpWithVendor: (v) => `Cookie banner (CMP): ${v}`,
    cmpDetectedUnknown: "Cookie banner (CMP): detected, unknown vendor",
    cmpNone: "Cookie banner (CMP): none detected",
    sensitiveNone: "No Art. 9 risk found in this measurement.",
    sensitiveCategoryFallback: "Sensitive category",
    labelRecipient: "Recipient:",
    labelHow: "How:",
    labelGdpr: "GDPR:",
    labelEvidence: "Evidence:",
    gapsNone: "No clear gaps between policy text and measured reality were found.",
    labelPolicySays: "The policy says:",
    labelReality: "Reality:",
    statThirdParty: "third-party requests",
    statTracking: "tracking requests",
    statEntities: "entities",
    statCookies: "third-party cookies",
    trackerMapNone: "No tracking entities were compiled.",
    requestsWord: "requests",
    entityFallback: "Unknown entity",
    rawSummary: (n, m) => `Raw data: ${n} distinct entities, ${m} requests`,
    rawNone: "No third-party requests captured.",
    adviceNone: "No specific advice.",
    reviewedAt: (d) => `Reviewed ${d}`,
    modelWord: (m) => `model: ${m}`,
    dateLocale: "en-GB",
  },
};

function labelsFor(lang) {
  return LABELS[lang] || LABELS.sv;
}

/**
 * Skapa ett element med klass och textinnehåll.
 * Exporterad hjälpfunktion (textContent => XSS-säker).
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null && text !== "") node.textContent = String(text);
  return node;
}

/** Klampa ett godtyckligt severity-värde till heltal 1–5. */
function clampSeverity(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, n));
}

/** Bygg en färgad severity-badge. */
function severityBadge(value, L, small) {
  const n = clampSeverity(value);
  const badge = el("span", `sev-badge sev-${n}${small ? " sev-sm" : ""}`);
  badge.textContent = `${L.severityWord} ${n}/5`;
  badge.title = L.severity[n];
  return badge;
}

/** En sektion (card) med en eyebrow-rubrik. */
function card(eyebrow, extraClass) {
  const sec = el("section", `card${extraClass ? " " + extraClass : ""}`);
  sec.appendChild(el("div", "card-eyebrow", eyebrow));
  return sec;
}

/** Rad med etikett + värde inuti ett <p>. */
function labeledLine(pClass, labelClass, labelText, valueText) {
  const p = el("p", pClass);
  p.appendChild(el("span", labelClass, labelText));
  p.appendChild(document.createTextNode(" " + (valueText ?? "")));
  return p;
}

function nonEmpty(v) {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Rita hela rapporten i container.
 * @param {HTMLElement} container
 * @param {{analysis:object, scan:object, scrape:object|null, model:string, lang?:string}} data
 */
export function renderReport(container, { analysis, scan, scrape, model, lang }) {
  container.replaceChildren();
  const L = labelsFor(lang || "sv");

  if (!analysis || typeof analysis !== "object") {
    container.appendChild(card(L.result)).appendChild(
      el("p", "note-neutral", L.noAnalysis)
    );
    return;
  }

  const safeScan = scan || {};
  container.appendChild(renderVerdict(analysis.verdict, L));
  container.appendChild(renderConsent(analysis.consent, scrape, L));
  container.appendChild(renderSensitive(analysis.sensitiveData, L));
  container.appendChild(renderPolicyGaps(analysis.policyGaps, L));
  container.appendChild(renderTrackerMap(analysis.trackerSummary, safeScan, L));
  container.appendChild(renderRawData(safeScan, L));
  container.appendChild(renderRecommendations(analysis.recommendations, L));
  container.appendChild(renderMeta(safeScan, model, L));
}

/* ── VERDIKT ──────────────────────────────────────────────────────────── */
function renderVerdict(verdict, L) {
  const v = verdict || {};
  const n = clampSeverity(v.severity);
  const sec = card(L.cardVerdict, `verdict sev-${n}`);

  sec.appendChild(el("h3", "verdict-headline", nonEmpty(v.headline) ? v.headline : L.headlineFallback));

  if (nonEmpty(v.bluntStatement)) {
    sec.appendChild(el("p", "verdict-blunt", v.bluntStatement));
  }

  const meta = el("div", "verdict-meta");
  meta.appendChild(severityBadge(v.severity, L));
  sec.appendChild(meta);

  if (nonEmpty(v.summary)) {
    sec.appendChild(el("p", "verdict-summary", v.summary));
  }
  return sec;
}

/* ── SAMTYCKE ─────────────────────────────────────────────────────────── */
function renderConsent(consent, scrape, L) {
  const c = consent || {};
  const sec = card(L.cardConsent);

  sec.appendChild(
    el("p", "assessment", nonEmpty(c.assessment) ? c.assessment : L.consentNone)
  );

  const facts = el("ul", "facts");

  const before = Number.isFinite(Number(c.trackersFiredBeforeConsent))
    ? Number(c.trackersFiredBeforeConsent)
    : 0;
  const beforeLi = el("li");
  beforeLi.appendChild(el("span", "big", String(before)));
  beforeLi.appendChild(
    document.createTextNode(" " + (before === 1 ? L.firedOne : L.firedMany))
  );
  facts.appendChild(beforeLi);

  // CMP-leverantör: föredra modellens, fall tillbaka till skrapad signal.
  let vendor = nonEmpty(c.cmpVendor) ? c.cmpVendor : null;
  if (!vendor && scrape && scrape.cmp && nonEmpty(scrape.cmp.vendor)) {
    vendor = scrape.cmp.vendor;
  }
  const detected = c.cmpDetected || (scrape && scrape.cmp && scrape.cmp.detected);
  let cmpText;
  if (vendor) cmpText = L.cmpWithVendor(vendor);
  else if (detected) cmpText = L.cmpDetectedUnknown;
  else cmpText = L.cmpNone;
  facts.appendChild(el("li", null, cmpText));

  sec.appendChild(facts);
  return sec;
}

/* ── KÄNSLIG DATA (GDPR art. 9) ───────────────────────────────────────── */
function renderSensitive(sensitiveData, L) {
  const sec = card(L.cardSensitive);
  const items = Array.isArray(sensitiveData) ? sensitiveData : [];

  if (items.length === 0) {
    sec.appendChild(el("p", "note-ok", L.sensitiveNone));
    return sec;
  }

  for (const item of items) {
    const it = item || {};
    const leak = el("div", `leak-card sev-${clampSeverity(it.severity)}`);

    const head = el("div", "leak-head");
    head.appendChild(
      el("span", "leak-category", nonEmpty(it.category) ? it.category : L.sensitiveCategoryFallback)
    );
    head.appendChild(severityBadge(it.severity, L, true));
    leak.appendChild(head);

    if (nonEmpty(it.recipient)) {
      leak.appendChild(labeledLine("leak-line", "leak-label", L.labelRecipient, it.recipient));
    }
    if (nonEmpty(it.howLeaked)) {
      leak.appendChild(labeledLine("leak-line", "leak-label", L.labelHow, it.howLeaked));
    }
    if (nonEmpty(it.gdprArticle)) {
      leak.appendChild(labeledLine("leak-line", "leak-label", L.labelGdpr, it.gdprArticle));
    }
    if (nonEmpty(it.evidence)) {
      const ev = el("div", "leak-evidence");
      ev.appendChild(el("span", "leak-label", L.labelEvidence));
      ev.appendChild(el("code", null, it.evidence));
      leak.appendChild(ev);
    }
    sec.appendChild(leak);
  }
  return sec;
}

/* ── POLICYGLAPP / UNDERDRIFT ─────────────────────────────────────────── */
function renderPolicyGaps(policyGaps, L) {
  const sec = card(L.cardGaps);
  const gaps = Array.isArray(policyGaps) ? policyGaps : [];

  if (gaps.length === 0) {
    sec.appendChild(el("p", "note-neutral", L.gapsNone));
    return sec;
  }

  for (const gap of gaps) {
    const g = gap || {};
    const cardEl = el("div", "gap-card");

    cardEl.appendChild(
      labeledLine("gap-line gap-claim", "gap-label", L.labelPolicySays, nonEmpty(g.policyClaim) ? g.policyClaim : "—")
    );
    cardEl.appendChild(
      labeledLine("gap-line gap-reality", "gap-label", L.labelReality, nonEmpty(g.reality) ? g.reality : "—")
    );

    const tags = [];
    if (nonEmpty(g.gapType)) tags.push(g.gapType);
    if (nonEmpty(g.gdprReference)) tags.push(g.gdprReference);
    if (tags.length) cardEl.appendChild(el("p", "gap-type", tags.join(" · ")));

    sec.appendChild(cardEl);
  }
  return sec;
}

/* ── SPÅRNINGSKARTA ───────────────────────────────────────────────────── */
function renderTrackerMap(trackerSummary, scan, L) {
  const sec = card(L.cardTrackerMap);

  // Statistik överst som siffror.
  const stats = scan.stats || {};
  const grid = el("div", "stats-grid");
  grid.appendChild(statTile(stats.totalThirdPartyRequests, L.statThirdParty, false));
  grid.appendChild(statTile(stats.trackerRequests, L.statTracking, true));
  grid.appendChild(statTile(stats.distinctEntities, L.statEntities, false));
  grid.appendChild(statTile(stats.thirdPartyCookies, L.statCookies, false));
  sec.appendChild(grid);

  const summary = Array.isArray(trackerSummary) ? trackerSummary : [];
  if (summary.length === 0) {
    sec.appendChild(el("p", "note-neutral", L.trackerMapNone));
    return sec;
  }

  // Gruppera per kategori.
  const groups = new Map();
  for (const t of summary) {
    const key = (t && nonEmpty(t.category)) ? t.category : "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t || {});
  }

  for (const [catKey, entries] of groups) {
    const group = el("div", "tracker-group");
    group.appendChild(el("p", "tracker-group-title", L.category[catKey] || catKey));
    for (const t of entries) {
      const row = el("div", "tracker-row");
      const head = el("div", "tracker-row-head");
      head.appendChild(el("span", "tracker-entity", nonEmpty(t.entity) ? t.entity : L.entityFallback));
      const cnt = Number.isFinite(Number(t.requestCount)) ? Number(t.requestCount) : 0;
      head.appendChild(el("span", "count-badge", `${cnt} ${L.requestsWord}`));
      row.appendChild(head);
      if (nonEmpty(t.whatTheyGot)) {
        row.appendChild(el("p", "tracker-what", t.whatTheyGot));
      }
      group.appendChild(row);
    }
    sec.appendChild(group);
  }
  return sec;
}

function statTile(value, label, hot) {
  const tile = el("div", "stat");
  const num = Number.isFinite(Number(value)) ? Number(value) : 0;
  const numEl = el("div", `stat-num${hot && num > 0 ? " hot" : ""}`, String(num));
  tile.appendChild(numEl);
  tile.appendChild(el("div", "stat-label", label));
  return tile;
}

/* ── RÅDATA (hopfällbar) ──────────────────────────────────────────────── */
function renderRawData(scan, L) {
  const requests = Array.isArray(scan.requests) ? scan.requests : [];

  // Gruppera per aktör (entity), fall tillbaka till etld1/domän.
  const byEntity = new Map();
  for (const r of requests) {
    if (!r) continue;
    const key = nonEmpty(r.entity) ? r.entity : (r.etld1 || r.domain || "(okänd)");
    if (!byEntity.has(key)) byEntity.set(key, { count: 0, domains: new Map() });
    const g = byEntity.get(key);
    g.count += 1;
    const dom = r.domain || r.etld1 || "(okänd)";
    g.domains.set(dom, (g.domains.get(dom) || 0) + 1);
  }

  const sorted = [...byEntity.entries()].sort((a, b) => b[1].count - a[1].count);

  const sec = el("section", "card rawdata");
  const details = el("details", "disclosure");
  details.appendChild(el("summary", null, L.rawSummary(sorted.length, requests.length)));

  if (sorted.length === 0) {
    const empty = el("div", "raw-entity");
    empty.appendChild(el("p", "note-neutral", L.rawNone));
    details.appendChild(empty);
  } else {
    for (const [name, g] of sorted) {
      const block = el("div", "raw-entity");
      const head = el("div", "raw-entity-head");
      head.appendChild(el("span", "raw-entity-name", name));
      head.appendChild(el("span", "count-badge", `${g.count} ${L.requestsWord}`));
      block.appendChild(head);

      const domSorted = [...g.domains.entries()].sort((a, b) => b[1] - a[1]);
      for (const [dom, c] of domSorted) {
        block.appendChild(el("p", "raw-domain", `${dom} (${c})`));
      }
      details.appendChild(block);
    }
  }

  sec.appendChild(details);
  return sec;
}

/* ── RÅD ──────────────────────────────────────────────────────────────── */
function renderRecommendations(recommendations, L) {
  const sec = card(L.cardAdvice);
  const recs = Array.isArray(recommendations) ? recommendations.filter(nonEmpty) : [];

  if (recs.length === 0) {
    sec.appendChild(el("p", "note-neutral", L.adviceNone));
    return sec;
  }

  const ul = el("ul", "recs");
  for (const r of recs) ul.appendChild(el("li", null, r));
  sec.appendChild(ul);
  return sec;
}

/* ── META ─────────────────────────────────────────────────────────────── */
function renderMeta(scan, model, L) {
  const parts = [];
  if (scan.capturedAt) {
    try {
      parts.push(L.reviewedAt(new Date(scan.capturedAt).toLocaleString(L.dateLocale)));
    } catch {
      /* ignorera datumformat-fel */
    }
  }
  if (nonEmpty(scan.pageDomain)) parts.push(scan.pageDomain);
  if (nonEmpty(model)) parts.push(L.modelWord(model));
  return el("p", "report-meta", parts.join(" · "));
}
