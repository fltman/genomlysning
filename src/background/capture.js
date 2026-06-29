// Request-bearbetning: berikar råa webRequest-detaljer till CapturedRequest,
// plockar ut den faktiska läckta payloaden ur kända spårningsbeacons, bygger
// cookie-info och sammanställer ScanResult.

import { classify, etldPlus1, hostnameOf } from "./tracker-db.js";

/** Maxlängd på enskilt läckt värde som vi behåller (URL:er kan vara långa). */
const MAX_LEAK_LEN = 600;

function clip(s, n = MAX_LEAK_LEN) {
  if (typeof s !== "string") return s;
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function safeDecode(v) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/**
 * Analysera en URL och plocka ut den intressanta payloaden om det är en känd beacon.
 * Returnerar null om inget intressant hittas.
 * @param {string} url
 * @returns {null|{kind:string, leaked:Object<string,string>}}
 */
export function parseBeacon(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  const q = u.searchParams;
  const leaked = {};

  const add = (key, val) => {
    if (val == null || val === "") return;
    leaked[key] = clip(safeDecode(String(val)));
  };

  // ── Meta Pixel ──────────────────────────────────────────────────────────────
  // connect.facebook.net/.../fbevents.js (loader) eller facebook.com/tr (beacon).
  if (
    (host.endsWith("facebook.com") && (path === "/tr" || path === "/tr/")) ||
    host.endsWith("facebook.net")
  ) {
    add("dl", q.get("dl")); // document location = sidans URL
    add("rl", q.get("rl")); // referrer
    add("ev", q.get("ev")); // event (PageView, ViewContent, ...)
    add("id", q.get("id")); // pixel-id
    // Custom data cd[...] kan innehålla content-kategori m.m.
    for (const [k, v] of q.entries()) {
      if (k.startsWith("cd[") || k.startsWith("cd%5B")) add(k, v);
    }
    if (Object.keys(leaked).length) return { kind: "meta-pixel", leaked };
  }

  // ── Google Analytics 4 / Universal Analytics ────────────────────────────────
  if (
    host.endsWith("google-analytics.com") ||
    host.endsWith("analytics.google.com") ||
    path.includes("/g/collect") ||
    path.endsWith("/collect") ||
    path.includes("/mp/collect")
  ) {
    add("dl", q.get("dl")); // document location
    add("dt", q.get("dt")); // dokumenttitel
    add("dr", q.get("dr")); // referrer
    add("ul", q.get("ul")); // user language
    add("tid", q.get("tid")); // tracking id
    if (Object.keys(leaked).length) return { kind: "ga4", leaked };
  }

  // ── Google Tag Manager / gtag ───────────────────────────────────────────────
  if (host.endsWith("googletagmanager.com")) {
    add("id", q.get("id")); // GTM-XXXX eller G-XXXX
    if (Object.keys(leaked).length) return { kind: "gtm", leaked };
  }

  // ── TikTok pixel ────────────────────────────────────────────────────────────
  if (host.includes("tiktok")) {
    add("url", q.get("url"));
    add("referrer", q.get("referrer"));
    add("sdkid", q.get("sdkid"));
    if (Object.keys(leaked).length) return { kind: "tiktok", leaked };
  }

  // ── Generisk: leta efter parametrar som ofta bär sidans URL/titel ──────────
  const GENERIC_KEYS = [
    "dl", "url", "u", "uri", "ref", "referrer", "referer", "r",
    "page", "loc", "location", "l", "dt", "title", "pageurl", "page_url",
  ];
  for (const key of GENERIC_KEYS) {
    const v = q.get(key);
    if (v && (v.startsWith("http") || v.includes("/") || v.length > 12)) add(key, v);
  }
  if (Object.keys(leaked).length) return { kind: "generic", leaked };

  return null;
}

/**
 * Berika en webRequest-detalj till en CapturedRequest.
 * @param {chrome.webRequest.WebRequestBodyDetails} details
 * @param {string} pageEtld1
 * @returns {import("../shared/schema.js").CapturedRequest}
 */
export function enrichRequest(details, pageEtld1) {
  const domain = hostnameOf(details.url);
  const etld1 = etldPlus1(domain);
  const cls = classify(domain);
  return {
    url: clip(details.url, 800),
    domain,
    etld1,
    type: details.type || "other",
    initiator: details.initiator || details.documentUrl || null,
    timeStamp: details.timeStamp || 0,
    thirdParty: !!etld1 && etld1 !== pageEtld1,
    entity: cls.entity,
    category: cls.category,
    sensitivity: cls.sensitivity,
    isTracker: cls.isTracker,
    beacon: parseBeacon(details.url),
  };
}

/**
 * Bygg CookieInfo (utan värde) från en chrome.cookies.Cookie.
 * @param {chrome.cookies.Cookie} cookie
 * @param {string} pageEtld1
 * @param {number} nowSec  Aktuell tid i sekunder (Date.now()/1000) — skickas in.
 * @returns {object}
 */
export function buildCookieInfo(cookie, pageEtld1, nowSec) {
  const domain = (cookie.domain || "").replace(/^\./, "").toLowerCase();
  const etld1 = etldPlus1(domain);
  const cls = classify(domain);
  let expiresInDays = null;
  if (!cookie.session && typeof cookie.expirationDate === "number") {
    expiresInDays = Math.round((cookie.expirationDate - nowSec) / 86400);
  }
  return {
    name: cookie.name,
    domain,
    etld1,
    session: !!cookie.session,
    expiresInDays,
    httpOnly: !!cookie.httpOnly,
    secure: !!cookie.secure,
    sameSite: cookie.sameSite || "unspecified",
    thirdParty: !!etld1 && etld1 !== pageEtld1,
    entity: cls.entity,
    category: cls.category,
  };
}

/**
 * Räkna fram sammanställd statistik.
 * @param {Array} requests  (redan filtrerade till tredjepart)
 * @param {Array} cookies
 */
export function computeStats(requests, cookies) {
  const entities = new Set();
  let trackerRequests = 0;
  for (const r of requests) {
    if (r.entity) entities.add(r.entity);
    if (r.isTracker) trackerRequests++;
  }
  const thirdPartyCookies = cookies.filter((c) => c.thirdParty).length;
  return {
    totalThirdPartyRequests: requests.length,
    trackerRequests,
    distinctEntities: entities.size,
    thirdPartyCookies,
  };
}

/**
 * Sätt ihop ett ScanResult.
 * @param {{pageUrl:string, pageDomain:string, pageEtld1:string, requests:Array, cookies:Array, capturedAt:number}} parts
 * @returns {import("../shared/schema.js").ScanResult}
 */
export function buildScanResult({ pageUrl, pageDomain, pageEtld1, requests, cookies, capturedAt }) {
  return {
    pageUrl,
    pageDomain,
    pageEtld1,
    capturedAt,
    requests,
    cookies,
    stats: computeStats(requests, cookies),
  };
}
