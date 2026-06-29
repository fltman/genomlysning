// OpenRouter-klient. Använder ENBART användarens egen API-nyckel och anropas bara
// när användaren startar en analys (se CONTRACT.md). Inga andra nätverksanrop.

import { ANALYSIS_JSON_SCHEMA } from "../shared/schema.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** Gemensamma headers för alla anrop. */
function buildHeaders(settings) {
  return {
    Authorization: "Bearer " + ((settings && settings.apiKey) || ""),
    "Content-Type": "application/json",
    // OpenRouter rekommenderar dessa för attribution; ingen spårning av användaren.
    "HTTP-Referer": "https://genomlysning.local",
    "X-Title": "Genomlysning",
  };
}

/**
 * Kör analysen mot OpenRouter och returnera det parsade objektet enligt
 * ANALYSIS_JSON_SCHEMA.schema.
 * @param {object} args
 * @param {Array<{role:string, content:string}>} args.messages
 * @param {typeof import("../shared/schema.js").DEFAULT_SETTINGS} args.settings
 * @returns {Promise<object>}
 */
export async function callAnalysis({ messages, settings }) {
  if (!settings || !settings.apiKey) {
    throw new Error("Ingen API-nyckel angiven. Öppna inställningarna och klistra in din OpenRouter-nyckel.");
  }

  const body = {
    model: settings.model,
    messages,
    response_format: { type: "json_schema", json_schema: ANALYSIS_JSON_SCHEMA },
    temperature: 0.2,
  };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: buildHeaders(settings),
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error("Kunde inte nå OpenRouter: " + (e && e.message ? e.message : String(e)));
  }

  if (!res.ok) {
    throw new Error("OpenRouter-fel " + res.status + (await errorDetail(res)));
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error("OpenRouter svarade med ogiltig JSON.");
  }

  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : null;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter returnerade inget analysinnehåll.");
  }

  return parseJsonObject(content);
}

/**
 * Minimalt testanrop för att verifiera nyckel + modell i inställningarna.
 * Kastar aldrig — returnerar alltid ett statusobjekt.
 * @param {object} args
 * @param {typeof import("../shared/schema.js").DEFAULT_SETTINGS} args.settings
 * @returns {Promise<{ok:boolean, model?:string, error?:string}>}
 */
export async function pingModel({ settings }) {
  if (!settings || !settings.apiKey) {
    return { ok: false, error: "Ingen API-nyckel angiven." };
  }
  if (!settings.model) {
    return { ok: false, error: "Ingen modell angiven." };
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: buildHeaders(settings),
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
        temperature: 0,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: "Fel " + res.status + (await errorDetail(res)) };
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      // Svaret gick igenom (200) även om kroppen inte var läsbar — räkna som ok.
    }
    const model = (data && data.model) || settings.model;
    return { ok: true, model };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Hjälpare                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

/** Plocka ett läsbart felmeddelande ur en icke-ok respons. */
async function errorDetail(res) {
  try {
    const clone = res.clone ? res.clone() : res;
    const data = await clone.json();
    const msg =
      (data && data.error && data.error.message) ||
      (data && data.message) ||
      "";
    if (msg) return ": " + msg;
    return "";
  } catch {
    try {
      const text = await res.text();
      return text ? ": " + text.slice(0, 300) : "";
    } catch {
      return "";
    }
  }
}

/** JSON.parse med fallback som extraherar första balanserade {...}-blocket. */
function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const obj = extractFirstJsonObject(text);
    if (obj) return obj;
    throw new Error("Kunde inte tolka modellsvaret som JSON.");
  }
}

/**
 * Hitta och parsa det första balanserade JSON-objektet i en sträng (modeller
 * lägger ibland till ```json-staket eller inledande text).
 * @param {string} text
 * @returns {object|null}
 */
function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
