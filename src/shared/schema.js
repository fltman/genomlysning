// Delade typer (JSDoc) och JSON-schemat för LLM-analysens svar.

/** Standardinställningar. Se CONTRACT.md. */
export const DEFAULT_SETTINGS = Object.freeze({
  apiKey: "",
  model: "anthropic/claude-sonnet-4.6",
  reportLanguage: "sv",
  redactBeforeSend: false,
});

/** Lagringsnyckel i chrome.storage.local. */
export const SETTINGS_KEY = "geno_settings";

/** Förslag på modeller (fritext tillåts ändå i options). */
export const MODEL_SUGGESTIONS = Object.freeze([
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-opus-4.8",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "openai/gpt-4.1",
  "openai/gpt-4.1-mini",
]);

/**
 * Hämta inställningar med defaults ifyllda.
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
}

/**
 * Spara (delvis) inställningar.
 * @param {Partial<typeof DEFAULT_SETTINGS>} patch
 */
export async function saveSettings(patch) {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/**
 * JSON-schema för LLM-svaret. Skickas som
 * response_format: { type: "json_schema", json_schema: ANALYSIS_JSON_SCHEMA }.
 */
export const ANALYSIS_JSON_SCHEMA = Object.freeze({
  name: "genomlysning_analys",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "verdict",
      "consent",
      "sensitiveData",
      "policyGaps",
      "trackerSummary",
      "recommendations",
    ],
    properties: {
      verdict: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "bluntStatement", "summary", "severity"],
        properties: {
          headline: { type: "string", description: "Kort rubrik (max ~12 ord)." },
          bluntStatement: {
            type: "string",
            description:
              "Säg rakt ut vad sajten faktiskt gör jämfört med vad den påstår. En–två meningar.",
          },
          summary: { type: "string", description: "2–4 meningars sammanfattning." },
          severity: {
            type: "integer",
            description: "Heltal 1–5. 1=oskyldigt, 5=grov underdrift/känslig dataläcka.",
          },
        },
      },
      consent: {
        type: "object",
        additionalProperties: false,
        required: [
          "cmpDetected",
          "cmpVendor",
          "trackersFiredBeforeConsent",
          "assessment",
        ],
        properties: {
          cmpDetected: { type: "boolean" },
          cmpVendor: { type: ["string", "null"] },
          trackersFiredBeforeConsent: {
            type: "integer",
            description: "Antal spårar-anrop som avfyrades (heltal ≥ 0).",
          },
          assessment: {
            type: "string",
            description:
              "Bedömning av samtycke: laddades trackers innan användaren gav samtycke?",
          },
        },
      },
      sensitiveData: {
        type: "array",
        description:
          "Fall där känslig data (GDPR art. 9) riskerar läcka. Tom array om inget hittas.",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "category",
            "evidence",
            "recipient",
            "howLeaked",
            "gdprArticle",
            "severity",
          ],
          properties: {
            category: {
              type: "string",
              description:
                "T.ex. 'politiska åsikter', 'hälsa', 'religion', 'sexuell läggning', 'facklig tillhörighet'.",
            },
            evidence: {
              type: "string",
              description: "Konkret bevis, t.ex. den faktiska URL som skickades.",
            },
            recipient: { type: "string", description: "Vem som tog emot, t.ex. 'Meta'." },
            howLeaked: {
              type: "string",
              description: "Hur, t.ex. 'sidans URL i Meta Pixelns dl-parameter'.",
            },
            gdprArticle: { type: "string" },
            severity: { type: "integer", description: "Heltal 1–5." },
          },
        },
      },
      policyGaps: {
        type: "array",
        description: "Glapp mellan policytext och uppmätt verklighet.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["policyClaim", "reality", "gapType", "gdprReference"],
          properties: {
            policyClaim: {
              type: "string",
              description: "Vad policyn säger (citat eller nära parafras).",
            },
            reality: { type: "string", description: "Vad vi faktiskt mätte." },
            gapType: {
              type: "string",
              description:
                "T.ex. 'underdrift', 'utelämnande', 'samtycke saknas', 'vag formulering'.",
            },
            gdprReference: { type: "string" },
          },
        },
      },
      trackerSummary: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["entity", "category", "requestCount", "whatTheyGot"],
          properties: {
            entity: { type: "string" },
            category: { type: "string" },
            requestCount: { type: "integer", description: "Antal anrop (heltal ≥ 0)." },
            whatTheyGot: {
              type: "string",
              description: "Kort: vad denna aktör sannolikt fick ta del av.",
            },
          },
        },
      },
      recommendations: {
        type: "array",
        description: "Konkreta råd till medborgaren som granskar.",
        items: { type: "string" },
      },
    },
  },
});

/**
 * @typedef {Object} CapturedRequest
 * @property {string} url
 * @property {string} domain
 * @property {string} etld1
 * @property {string} type
 * @property {string|null} initiator
 * @property {number} timeStamp
 * @property {boolean} thirdParty
 * @property {string|null} entity
 * @property {string|null} category
 * @property {"high"|"medium"|"low"|null} sensitivity
 * @property {boolean} isTracker
 * @property {null|{kind:string, leaked:Object<string,string>}} beacon
 */

/**
 * @typedef {Object} ScanResult
 * @property {string} pageUrl
 * @property {string} pageDomain
 * @property {string} pageEtld1
 * @property {number} capturedAt
 * @property {CapturedRequest[]} requests
 * @property {Object[]} cookies
 * @property {{totalThirdPartyRequests:number, trackerRequests:number, distinctEntities:number, thirdPartyCookies:number}} stats
 */
