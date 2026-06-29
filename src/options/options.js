// Inställningssidan för Genomlysning.
//
// Laddas som <script type="module">. Läser/sparar inställningar via shared/schema.js
// och kan testa OpenRouter-nyckeln via analysis/openrouter.js (pingModel).

import { loadSettings, saveSettings, MODEL_SUGGESTIONS } from "../shared/schema.js";
import { pingModel } from "../analysis/openrouter.js";

// --- DOM-referenser ---
const form = document.getElementById("settings-form");
const apiKeyEl = document.getElementById("api-key");
const modelEl = document.getElementById("model");
const reportLanguageEl = document.getElementById("report-language");
const redactEl = document.getElementById("redact");
const datalistEl = document.getElementById("model-suggestions");
const toggleKeyBtn = document.getElementById("toggle-key");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("test-key");
const statusEl = document.getElementById("status");

let statusTimer = null;

/**
 * Visa ett statusmeddelande.
 * @param {string} message
 * @param {"ok"|"err"|"busy"|""} [kind]
 * @param {boolean} [autoClear] töm meddelandet efter en stund (gäller bara "ok").
 */
function setStatus(message, kind = "", autoClear = false) {
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  statusEl.textContent = message;
  statusEl.className = "status" + (kind ? " " + kind : "");
  if (autoClear && message) {
    statusTimer = setTimeout(() => {
      statusEl.textContent = "";
      statusEl.className = "status";
    }, 4000);
  }
}

/** Fyll <datalist> med modellförslag (om HTML inte redan gjort det). */
function fillModelSuggestions() {
  if (!datalistEl || datalistEl.children.length > 0) return;
  for (const slug of MODEL_SUGGESTIONS) {
    const opt = document.createElement("option");
    opt.value = slug;
    datalistEl.appendChild(opt);
  }
}

/** Läs aktuella fältvärden till ett settings-objekt. */
function readForm() {
  return {
    apiKey: apiKeyEl.value.trim(),
    model: modelEl.value.trim(),
    reportLanguage: reportLanguageEl.value === "en" ? "en" : "sv",
    redactBeforeSend: redactEl.checked,
  };
}

/** Fyll formuläret från sparade inställningar. */
async function hydrate() {
  fillModelSuggestions();
  try {
    const settings = await loadSettings();
    apiKeyEl.value = settings.apiKey || "";
    modelEl.value = settings.model || "";
    reportLanguageEl.value = settings.reportLanguage === "en" ? "en" : "sv";
    redactEl.checked = Boolean(settings.redactBeforeSend);
  } catch (e) {
    setStatus("Kunde inte läsa inställningarna: " + errText(e), "err");
  }
}

/** Plocka ut ett läsbart felmeddelande ur valfritt fel-objekt. */
function errText(e) {
  if (!e) return "okänt fel";
  if (typeof e === "string") return e;
  if (e.message) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

// --- Visa/dölj nyckel ---
toggleKeyBtn.addEventListener("click", () => {
  const show = apiKeyEl.type === "password";
  apiKeyEl.type = show ? "text" : "password";
  toggleKeyBtn.textContent = show ? "Dölj" : "Visa";
  toggleKeyBtn.setAttribute("aria-pressed", show ? "true" : "false");
});

// --- Spara ---
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = readForm();
  saveBtn.disabled = true;
  setStatus("Sparar …", "busy");
  try {
    await saveSettings(values);
    setStatus("Sparat", "ok", true);
  } catch (e) {
    setStatus("Kunde inte spara: " + errText(e), "err");
  } finally {
    saveBtn.disabled = false;
  }
});

// --- Testa nyckel ---
testBtn.addEventListener("click", async () => {
  const settings = readForm();
  if (!settings.apiKey) {
    setStatus("Ange en API-nyckel innan du testar.", "err");
    apiKeyEl.focus();
    return;
  }
  if (!settings.model) {
    setStatus("Ange en modell innan du testar.", "err");
    modelEl.focus();
    return;
  }

  testBtn.disabled = true;
  setStatus("Testar nyckeln mot OpenRouter …", "busy");
  try {
    const res = await pingModel({ settings });
    // pingModel kan returnera {ok, error/message} eller kasta vid fel.
    if (res && res.ok === false) {
      setStatus("Nyckeln fungerade inte: " + errText(res.error || res.message), "err");
    } else {
      setStatus("Nyckeln fungerar – anslutningen till OpenRouter lyckades.", "ok", true);
    }
  } catch (e) {
    setStatus("Nyckeln fungerade inte: " + errText(e), "err");
  } finally {
    testBtn.disabled = false;
  }
});

// --- Start ---
hydrate();
