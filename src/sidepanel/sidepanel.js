// sidepanel.js — orkestrerar scan-flödet (CONTRACT.md, steg 1–7).
//
// Får INTE importera från background. Pratar med background och content script
// via meddelanden. Laddas som <script type="module">.

import { MSG, sendToBackground, sendToTab } from "../shared/messages.js";
import { loadSettings } from "../shared/schema.js";
import { buildMessages } from "../analysis/prompt.js";
import { callAnalysis } from "../analysis/openrouter.js";
import { renderReport } from "./render.js";
import { buildMarkdown, buildJson, buildFilename, downloadText, copyText } from "./export.js";

const STEP_COUNT = 5;

/** Maxlängd på extraherad policytext per sida. */
const POLICY_TEXT_CAP = 12000;

/** Hur många policy-länkar som hämtas. */
const MAX_POLICY_PAGES = 2;

const els = {
  scanBtn: document.getElementById("scan-btn"),
  settingsLink: document.getElementById("settings-link"),
  banner: document.getElementById("banner"),
  status: document.getElementById("status"),
  transparency: document.getElementById("transparency"),
  exportBar: document.getElementById("export-bar"),
  report: document.getElementById("report"),
};

let scanning = false;

init();

async function init() {
  els.scanBtn.addEventListener("click", onScanClick);
  els.settingsLink.addEventListener("click", () => chrome.runtime.openOptionsPage());

  try {
    const settings = await loadSettings();
    if (!settings.apiKey) showApiKeyBanner();
  } catch (e) {
    // Ska inte hända, men krascha aldrig tyst.
    showError("Kunde inte läsa inställningar: " + cleanMsg(e));
  }
}

/* ── Banner: saknad nyckel ────────────────────────────────────────────── */
function showApiKeyBanner() {
  els.banner.replaceChildren();
  els.banner.hidden = false;

  els.banner.appendChild(
    makeEl(
      "p",
      "banner-text",
      "Ingen OpenRouter-nyckel angiven. Lägg till din egen nyckel för att kunna genomlysa sidor."
    )
  );

  const btn = makeEl("button", "btn btn-small", "Öppna inställningar");
  btn.type = "button";
  btn.addEventListener("click", () => chrome.runtime.openOptionsPage());
  els.banner.appendChild(btn);
}

function hideBanner() {
  els.banner.hidden = true;
  els.banner.replaceChildren();
}

/* ── Huvudflöde ───────────────────────────────────────────────────────── */
async function onScanClick() {
  if (scanning) return;

  // Steg 1 (förkrav): läs settings på nytt — användaren kan precis ha sparat nyckel.
  let settings;
  try {
    settings = await loadSettings();
  } catch (e) {
    showError("Kunde inte läsa inställningar: " + cleanMsg(e));
    return;
  }
  if (!settings.apiKey) {
    showApiKeyBanner();
    return;
  }
  hideBanner();

  // Steg 2 (förkrav): aktiv flik.
  let tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs && tabs[0];
  } catch (e) {
    showError("Kunde inte läsa den aktiva fliken: " + cleanMsg(e));
    return;
  }
  if (!tab || typeof tab.id !== "number") {
    showError("Ingen aktiv flik hittades att granska.");
    return;
  }
  if (isUnscannable(tab.url || "")) {
    showError("Den här sidan kan inte granskas.");
    return;
  }

  startScanUI();

  try {
    // ── Steg 1: ladda om + fånga anrop ──────────────────────────────────
    setStatus(1, "Laddar om sidan och fångar anrop…");
    let scan;
    try {
      const resp = await sendToBackground({ type: MSG.START_SCAN, tabId: tab.id });
      if (!resp) throw new Error("Inget svar från bakgrundstjänsten.");
      if (!resp.ok) throw new Error(resp.error || "Okänt fel.");
      scan = resp.result;
      if (!scan) throw new Error("Tomt resultat.");
    } catch (e) {
      throw new Error("Kunde inte fånga sidans anrop. " + cleanMsg(e));
    }

    // ── Steg 2: skrapa sidans innehåll ──────────────────────────────────
    setStatus(2, "Läser sidans innehåll…");
    let scrape;
    try {
      scrape = await sendToTab(tab.id, { type: MSG.SCRAPE });
      if (!scrape || typeof scrape !== "object") throw new Error("Tomt skrapsvar.");
    } catch (e) {
      // Best-effort: content-scriptet kan saknas (t.ex. precis omladdad sida).
      // Degradera till ett välformat PageScrape så att analysen ändå kan köras.
      console.warn("Genomlysning: skrap misslyckades, fortsätter utan.", e);
      scrape = fallbackScrape(tab, scan);
    }

    // ── Steg 3: hämta policytext ────────────────────────────────────────
    setStatus(3, "Hämtar policytext…");
    let policyTexts = [];
    try {
      policyTexts = await fetchPolicyTexts(scrape);
    } catch (e) {
      // Hela steget är best-effort; fel per länk hanteras internt.
      console.warn("Genomlysning: policyhämtning misslyckades.", e);
      policyTexts = [];
    }

    // ── Steg 4: bygg prompt + anropa OpenRouter ─────────────────────────
    setStatus(4, `Analyserar med ${settings.model}…`);
    let messages;
    try {
      messages = buildMessages({ scan, scrape, policyTexts, settings });
    } catch (e) {
      throw new Error("Kunde inte bygga analys-prompten. " + cleanMsg(e));
    }

    // Transparens (#212): visa exakt vad som skickas innan vi väntar på svaret.
    showTransparency(messages);

    let analysis;
    try {
      analysis = await callAnalysis({ messages, settings });
      if (!analysis || typeof analysis !== "object") {
        throw new Error("Modellen gav inget giltigt svar.");
      }
    } catch (e) {
      throw new Error("Analysen via OpenRouter misslyckades. " + cleanMsg(e));
    }

    // ── Steg 5: rita rapport ────────────────────────────────────────────
    setStatus(5, "Sammanställer rapport…");
    const reportData = {
      analysis,
      scan,
      scrape,
      model: settings.model,
      lang: settings.reportLanguage || "sv",
    };
    try {
      renderReport(els.report, reportData);
      showExportBar(reportData);
    } catch (e) {
      throw new Error("Kunde inte rita rapporten. " + cleanMsg(e));
    }

    clearStatus();
  } catch (e) {
    showError(cleanMsg(e));
  } finally {
    endScanUI();
  }
}

/* ── Policytext ───────────────────────────────────────────────────────── */
async function fetchPolicyTexts(scrape) {
  const out = [];
  const links = pickBestPolicyLinks(
    scrape && Array.isArray(scrape.policyLinks) ? scrape.policyLinks : [],
    MAX_POLICY_PAGES
  );

  for (const link of links) {
    try {
      // Sidopanelen är ett säkert ursprung — uppgradera http→https så att
      // policysidor inte tyst blockeras som mixed content.
      const fetchUrl = link.href.replace(/^http:\/\//i, "https://");
      const resp = await fetch(fetchUrl, { credentials: "omit", redirect: "follow" });
      if (!resp || !resp.ok) continue;
      const html = await resp.text();
      const text = htmlToText(html);
      if (text) {
        out.push({ url: link.href, title: link.text || link.href, text });
      }
    } catch (e) {
      // Fel per länk ignoreras (best-effort).
      console.warn("Genomlysning: kunde inte hämta policy", link && link.href, e);
    }
  }
  return out;
}

/** Rangordna och plocka de bästa policy-länkarna; dedupe på href. */
function pickBestPolicyLinks(links, limit) {
  const HIGH = ["integritet", "personuppgift", "dataskydd", "privacy", "gdpr", "data-policy", "privacy-policy", "personvern", "datapolicy"];
  const MED = ["cookie", "kakor", "spårning", "tracking"];

  const seen = new Set();
  const scored = [];
  for (const link of links) {
    if (!link || !nonEmpty(link.href)) continue;
    let href = link.href;
    if (!/^https?:/i.test(href)) continue; // bara hämtbara absoluta länkar
    if (seen.has(href)) continue;
    seen.add(href);

    const hay = `${link.text || ""} ${href}`.toLowerCase();
    let score = 0;
    for (const k of HIGH) if (hay.includes(k)) score += 3;
    for (const k of MED) if (hay.includes(k)) score += 1;
    scored.push({ link, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.link);
}

/**
 * Konvertera HTML till ren text. DOMParser i ett detached-dokument, ta bort
 * brus, capa längden. Returnerar "" vid fel.
 */
function htmlToText(html) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc
      .querySelectorAll("script, style, noscript, nav, header, footer, svg, iframe, template, form")
      .forEach((node) => node.remove());

    const root = doc.body || doc.documentElement;
    if (!root) return "";

    // innerText i detached-dokument är ofta tomt; textContent är fallback.
    let text = (root.innerText || root.textContent || "");
    text = text
      .replace(/\r/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (text.length > POLICY_TEXT_CAP) text = text.slice(0, POLICY_TEXT_CAP) + "…";
    return text;
  } catch (e) {
    console.warn("Genomlysning: htmlToText misslyckades.", e);
    return "";
  }
}

/* ── Transparens-ruta ─────────────────────────────────────────────────── */
function showTransparency(messages) {
  els.transparency.replaceChildren();

  const userMsg = Array.isArray(messages)
    ? messages.find((m) => m && m.role === "user")
    : null;

  let content;
  if (userMsg && typeof userMsg.content === "string") {
    content = userMsg.content;
  } else if (userMsg) {
    try {
      content = JSON.stringify(userMsg.content, null, 2);
    } catch {
      content = String(userMsg.content);
    }
  } else {
    content = "(inget användarmeddelande att visa)";
  }

  const details = makeEl("details", "disclosure transparency-box");
  details.appendChild(makeEl("summary", null, "Detta skickades till OpenRouter"));
  details.appendChild(
    makeEl(
      "p",
      "disclosure-note",
      "För full transparens: exakt det användarmeddelande som skickades för analys. Inget annat lämnar din dator, och vi spårar dig inte."
    )
  );
  details.appendChild(makeEl("pre", "payload", content));

  els.transparency.appendChild(details);
  els.transparency.hidden = false;
}

/* ── Exportbar ────────────────────────────────────────────────────────── */
function showExportBar(data) {
  els.exportBar.replaceChildren();

  els.exportBar.appendChild(makeEl("span", "export-label", "Exportera:"));

  const mdBtn = makeEl("button", "btn btn-small", "⬇ Markdown");
  mdBtn.type = "button";
  mdBtn.addEventListener("click", () => {
    try {
      downloadText(buildFilename(data.scan, "md"), buildMarkdown(data), "text/markdown;charset=utf-8");
    } catch (e) {
      console.warn("Genomlysning: md-export misslyckades.", e);
    }
  });

  const copyBtn = makeEl("button", "btn btn-small", "⧉ Kopiera");
  copyBtn.type = "button";
  copyBtn.addEventListener("click", async () => {
    const ok = await copyText(buildMarkdown(data));
    const original = "⧉ Kopiera";
    copyBtn.textContent = ok ? "✓ Kopierat!" : "Kunde inte kopiera";
    setTimeout(() => {
      copyBtn.textContent = original;
    }, 1600);
  });

  const jsonBtn = makeEl("button", "btn btn-small", "⬇ JSON");
  jsonBtn.type = "button";
  jsonBtn.addEventListener("click", () => {
    try {
      downloadText(buildFilename(data.scan, "json"), buildJson(data), "application/json");
    } catch (e) {
      console.warn("Genomlysning: json-export misslyckades.", e);
    }
  });

  els.exportBar.appendChild(mdBtn);
  els.exportBar.appendChild(copyBtn);
  els.exportBar.appendChild(jsonBtn);
  els.exportBar.hidden = false;
}

/* ── Status-UI ────────────────────────────────────────────────────────── */
function startScanUI() {
  scanning = true;
  els.scanBtn.disabled = true;
  els.scanBtn.textContent = "Genomlyser…";
  els.report.replaceChildren();
  els.transparency.hidden = true;
  els.transparency.replaceChildren();
  els.exportBar.hidden = true;
  els.exportBar.replaceChildren();
  els.status.hidden = false;
  els.status.classList.remove("status-error");
  els.status.replaceChildren();
}

function setStatus(step, text) {
  els.status.hidden = false;
  els.status.classList.remove("status-error");
  els.status.replaceChildren();

  const row = makeEl("div", "status-row");
  row.appendChild(makeEl("span", "spinner"));
  row.appendChild(makeEl("span", "status-text", `Steg ${step}/${STEP_COUNT}: ${text}`));
  els.status.appendChild(row);

  const bar = makeEl("div", "status-bar");
  const fill = makeEl("div", "status-bar-fill");
  fill.style.width = Math.round((step / STEP_COUNT) * 100) + "%";
  bar.appendChild(fill);
  els.status.appendChild(bar);
}

function clearStatus() {
  els.status.hidden = true;
  els.status.replaceChildren();
}

function showError(message) {
  els.status.hidden = false;
  els.status.classList.add("status-error");
  els.status.replaceChildren();

  const row = makeEl("div", "status-row");
  row.appendChild(makeEl("span", "status-icon", "!"));
  row.appendChild(makeEl("span", "status-text", message || "Något gick fel."));
  els.status.appendChild(row);
}

function endScanUI() {
  scanning = false;
  els.scanBtn.disabled = false;
  els.scanBtn.textContent = "Genomlys den här sidan";
}

/* ── Hjälpare ─────────────────────────────────────────────────────────── */
function isUnscannable(url) {
  if (!url) return true;
  const u = url.toLowerCase();
  return (
    u.startsWith("chrome://") ||
    u.startsWith("edge://") ||
    u.startsWith("about:") ||
    u.startsWith("file:") ||
    u.startsWith("chrome-extension://") ||
    u.startsWith("devtools://") ||
    u.startsWith("view-source:") ||
    u.startsWith("data:")
  );
}

/** Bygg ett välformat PageScrape när content-scriptet inte svarar. */
function fallbackScrape(tab, scan) {
  return {
    title: (tab && tab.title) || "",
    url: (tab && tab.url) || (scan && scan.pageUrl) || "",
    lang: "",
    excerpt: "",
    fullTextLength: 0,
    policyLinks: [],
    cmp: { detected: false, vendor: null, signals: [] },
    embeddedTrackers: [],
  };
}

function nonEmpty(v) {
  return typeof v === "string" && v.trim() !== "";
}

/** Snygga till felmeddelanden (ta bort "Error: "-prefix). */
function cleanMsg(e) {
  if (!e) return "Okänt fel.";
  let msg = e instanceof Error ? e.message : String(e);
  msg = msg.replace(/^Error:\s*/i, "").trim();
  return msg || "Okänt fel.";
}

/** Litet createElement-omslag (textContent => XSS-säkert). */
function makeEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null && text !== "") node.textContent = String(text);
  return node;
}
