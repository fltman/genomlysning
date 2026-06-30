// export.js — bygger delningsbara exporter av en granskning (Markdown + JSON) och
// hanterar nedladdning/kopiering. Ren textbyggnad; ingen extern kommunikation.

const M = {
  sv: {
    title: "Genomlysning – granskningsrapport",
    page: "Sida",
    reviewed: "Granskad",
    model: "Modell",
    verdict: "Verdikt",
    severity: "Allvarsgrad",
    consent: "Samtycke",
    firedBefore: "spårare avfyrades utan att samtycke gavs vid omladdningen",
    cmp: "Cookie-banner (CMP)",
    cmpNone: "ingen upptäckt",
    cmpUnknown: "upptäckt, okänd leverantör",
    sensitive: "Känslig data (GDPR art. 9)",
    sensitiveNone: "Ingen art. 9-risk hittad i denna mätning.",
    recipient: "Mottagare",
    how: "Hur",
    evidence: "Bevis",
    gaps: "Underdrift & policyglapp",
    gapsNone: "Inga tydliga glapp hittades.",
    policySays: "Policyn säger",
    reality: "Verkligheten",
    trackerMap: "Spårningskarta",
    stats: (s) =>
      `${s.totalThirdPartyRequests} tredjepartsanrop · ${s.trackerRequests} spårningsanrop · ${s.distinctEntities} aktörer · ${s.thirdPartyCookies} tredjepartscookies`,
    requests: "anrop",
    advice: "Råd",
    adviceNone: "Inga särskilda råd.",
    footer:
      "Skapad med Genomlysning – lokal medborgargranskning. Fynden är misstankar att granska vidare, inte juridiska domslut.",
    dateLocale: "sv-SE",
  },
  en: {
    title: "Genomlysning – audit report",
    page: "Page",
    reviewed: "Reviewed",
    model: "Model",
    verdict: "Verdict",
    severity: "Severity",
    consent: "Consent",
    firedBefore: "trackers fired without consent on reload",
    cmp: "Cookie banner (CMP)",
    cmpNone: "none detected",
    cmpUnknown: "detected, unknown vendor",
    sensitive: "Sensitive data (GDPR Art. 9)",
    sensitiveNone: "No Art. 9 risk found in this measurement.",
    recipient: "Recipient",
    how: "How",
    evidence: "Evidence",
    gaps: "Understatement & policy gaps",
    gapsNone: "No clear gaps found.",
    policySays: "The policy says",
    reality: "Reality",
    trackerMap: "Tracking map",
    stats: (s) =>
      `${s.totalThirdPartyRequests} third-party requests · ${s.trackerRequests} tracking requests · ${s.distinctEntities} entities · ${s.thirdPartyCookies} third-party cookies`,
    requests: "requests",
    advice: "Advice",
    adviceNone: "No specific advice.",
    footer:
      "Created with Genomlysning – local citizen audit. Findings are suspicions to investigate, not legal verdicts.",
    dateLocale: "en-GB",
  },
};

function txt(v) {
  return v == null ? "" : String(v).trim();
}

function clampSev(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, n));
}

function fmtDate(ms, locale) {
  try {
    return new Date(ms || Date.now()).toLocaleString(locale);
  } catch {
    return "";
  }
}

/**
 * Bygg en läsbar Markdown-rapport.
 * @param {{analysis:object, scan:object, scrape:object|null, model:string, lang?:string}} data
 * @returns {string}
 */
export function buildMarkdown({ analysis, scan, scrape, model, lang }) {
  const t = M[lang] || M.sv;
  const a = analysis || {};
  const s = scan || {};
  const out = [];

  out.push(`# ${t.title}`);
  const url = (scrape && scrape.url) || s.pageUrl || "";
  if (url) out.push(`**${t.page}:** ${url}`);
  out.push(`**${t.reviewed}:** ${fmtDate(s.capturedAt, t.dateLocale)}`);
  if (txt(model)) out.push(`**${t.model}:** ${model}`);
  out.push("");

  // Verdikt
  const v = a.verdict || {};
  out.push(`## ${t.verdict}`);
  if (txt(v.headline)) out.push(`### ${txt(v.headline)}`);
  out.push(`**${t.severity}:** ${clampSev(v.severity)}/5`);
  if (txt(v.bluntStatement)) out.push("", `> ${txt(v.bluntStatement)}`);
  if (txt(v.summary)) out.push("", txt(v.summary));
  out.push("");

  // Samtycke
  const c = a.consent || {};
  out.push(`## ${t.consent}`);
  const before = Number.isFinite(Number(c.trackersFiredBeforeConsent))
    ? Number(c.trackersFiredBeforeConsent)
    : 0;
  out.push(`- **${before}** ${t.firedBefore}`);
  let vendor = txt(c.cmpVendor) || (scrape && scrape.cmp && txt(scrape.cmp.vendor)) || "";
  const detected = c.cmpDetected || (scrape && scrape.cmp && scrape.cmp.detected);
  out.push(`- ${t.cmp}: ${vendor || (detected ? t.cmpUnknown : t.cmpNone)}`);
  if (txt(c.assessment)) out.push("", txt(c.assessment));
  out.push("");

  // Känslig data
  out.push(`## ${t.sensitive}`);
  const sens = Array.isArray(a.sensitiveData) ? a.sensitiveData : [];
  if (!sens.length) {
    out.push(t.sensitiveNone);
  } else {
    for (const it of sens) {
      const o = it || {};
      out.push(`### ⚠️ ${txt(o.category) || "—"} (${clampSev(o.severity)}/5)`);
      if (txt(o.recipient)) out.push(`- **${t.recipient}:** ${txt(o.recipient)}`);
      if (txt(o.howLeaked)) out.push(`- **${t.how}:** ${txt(o.howLeaked)}`);
      if (txt(o.gdprArticle)) out.push(`- **GDPR:** ${txt(o.gdprArticle)}`);
      if (txt(o.evidence)) out.push(`- **${t.evidence}:** \`${txt(o.evidence)}\``);
      out.push("");
    }
  }
  out.push("");

  // Policyglapp
  out.push(`## ${t.gaps}`);
  const gaps = Array.isArray(a.policyGaps) ? a.policyGaps : [];
  if (!gaps.length) {
    out.push(t.gapsNone);
  } else {
    for (const g of gaps) {
      const o = g || {};
      out.push(`- **${t.policySays}:** ${txt(o.policyClaim) || "—"}`);
      out.push(`  **${t.reality}:** ${txt(o.reality) || "—"}`);
      const tags = [txt(o.gapType), txt(o.gdprReference)].filter(Boolean);
      if (tags.length) out.push(`  _(${tags.join(" · ")})_`);
      out.push("");
    }
  }
  out.push("");

  // Spårningskarta
  out.push(`## ${t.trackerMap}`);
  if (s.stats) out.push(`_${t.stats(s.stats)}_`, "");
  const summary = Array.isArray(a.trackerSummary) ? a.trackerSummary : [];
  for (const e of summary) {
    const o = e || {};
    const cnt = Number.isFinite(Number(o.requestCount)) ? Number(o.requestCount) : 0;
    out.push(`- **${txt(o.entity) || "—"}** (${txt(o.category) || "—"}, ${cnt} ${t.requests})${txt(o.whatTheyGot) ? " – " + txt(o.whatTheyGot) : ""}`);
  }
  out.push("");

  // Råd
  out.push(`## ${t.advice}`);
  const recs = (Array.isArray(a.recommendations) ? a.recommendations : []).filter((r) => txt(r));
  if (!recs.length) out.push(t.adviceNone);
  else for (const r of recs) out.push(`- ${txt(r)}`);
  out.push("");

  out.push("---", `_${t.footer}_`);
  return out.join("\n");
}

/**
 * Bygg JSON-rådata (analys + scan + sidskrap) för vidare bearbetning.
 * @returns {string}
 */
export function buildJson({ analysis, scan, scrape, model, lang }) {
  return JSON.stringify(
    {
      tool: "Genomlysning",
      generatedAt: new Date().toISOString(),
      model: model || null,
      reportLanguage: lang || "sv",
      page: { url: (scrape && scrape.url) || (scan && scan.pageUrl) || null },
      analysis: analysis || null,
      scan: scan || null,
      scrape: scrape || null,
    },
    null,
    2
  );
}

/** Filnamn på formen genomlysning-<domän>-<YYYY-MM-DD>.<ext>. */
export function buildFilename(scan, ext) {
  const domain = (scan && (scan.pageDomain || scan.pageEtld1)) || "sajt";
  const safe = domain.replace(/[^a-z0-9.-]/gi, "_");
  let date;
  try {
    date = new Date((scan && scan.capturedAt) || Date.now()).toISOString().slice(0, 10);
  } catch {
    date = "rapport";
  }
  return `genomlysning-${safe}-${date}.${ext}`;
}

/** Ladda ner text som fil via en blob-länk. */
export function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Kopiera text till urklipp. Returnerar Promise<boolean>. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
