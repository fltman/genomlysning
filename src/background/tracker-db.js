// Entitets-/spårningsdatabas och domänklassning.
//
// Detta är en kurerad, medvetet kompakt lista — inte en fullständig blocklista.
// Syftet är att gruppera tredjepartsanrop per ägande bolag och peka ut de aktörer
// som faktiskt är intressanta ur ett integritetsperspektiv. Okända tredjeparter
// flaggas ändå som tredjepart (isTracker:false, category:"unknown") så att de syns.

/**
 * Varje post matchar på suffix av hostname (t.ex. "facebook.com" matchar
 * "connect.facebook.net"? nej — suffixmatch på "facebook.net" krävs separat).
 * Matchning sker på exakt domän eller ".<domän>"-suffix.
 */
const DB = [
  // ── Meta ───────────────────────────────────────────────────────────────────
  { d: ["facebook.com", "facebook.net", "fbcdn.net", "fbsbx.com", "fb.com"], entity: "Meta", category: "social", sensitivity: "high" },
  { d: ["instagram.com", "cdninstagram.com"], entity: "Meta", category: "social", sensitivity: "high" },
  { d: ["whatsapp.com", "whatsapp.net"], entity: "Meta", category: "social", sensitivity: "medium" },

  // ── Google / Alphabet ───────────────────────────────────────────────────────
  { d: ["doubleclick.net", "googlesyndication.com", "googleadservices.com", "2mdn.net", "g.doubleclick.net", "adservice.google.com"], entity: "Google", category: "advertising", sensitivity: "high" },
  { d: ["google-analytics.com", "analytics.google.com", "ssl.google-analytics.com"], entity: "Google", category: "analytics", sensitivity: "medium" },
  { d: ["googletagmanager.com", "googletagservices.com"], entity: "Google", category: "tag-manager", sensitivity: "medium" },
  { d: ["youtube.com", "youtube-nocookie.com", "ytimg.com"], entity: "Google (YouTube)", category: "social", sensitivity: "medium" },
  { d: ["gstatic.com", "googleapis.com"], entity: "Google", category: "cdn", sensitivity: "low" },
  { d: ["fonts.googleapis.com", "fonts.gstatic.com"], entity: "Google Fonts", category: "cdn", sensitivity: "low" },

  // ── Microsoft ───────────────────────────────────────────────────────────────
  { d: ["clarity.ms"], entity: "Microsoft Clarity", category: "session-recording", sensitivity: "high" },
  { d: ["bat.bing.com", "bing.com", "msn.com"], entity: "Microsoft (Bing Ads)", category: "advertising", sensitivity: "high" },

  // ── Session recording / heatmaps ───────────────────────────────────────────
  { d: ["hotjar.com", "hotjar.io"], entity: "Hotjar", category: "session-recording", sensitivity: "high" },
  { d: ["fullstory.com", "fs.com"], entity: "FullStory", category: "session-recording", sensitivity: "high" },
  { d: ["mouseflow.com"], entity: "Mouseflow", category: "session-recording", sensitivity: "high" },
  { d: ["contentsquare.net", "contentsquare.com"], entity: "Contentsquare", category: "session-recording", sensitivity: "high" },
  { d: ["smartlook.com"], entity: "Smartlook", category: "session-recording", sensitivity: "high" },

  // ── Sociala plattformar / annonspixlar ──────────────────────────────────────
  { d: ["analytics.tiktok.com", "tiktok.com", "tiktokcdn.com", "byteoversea.com"], entity: "TikTok", category: "advertising", sensitivity: "high" },
  { d: ["linkedin.com", "licdn.com", "ads.linkedin.com"], entity: "LinkedIn (Microsoft)", category: "advertising", sensitivity: "high" },
  { d: ["snapchat.com", "sc-static.net", "snap.com"], entity: "Snap", category: "advertising", sensitivity: "high" },
  { d: ["pinterest.com", "pinimg.com"], entity: "Pinterest", category: "advertising", sensitivity: "medium" },
  { d: ["twitter.com", "x.com", "t.co", "ads-twitter.com", "twimg.com"], entity: "X (Twitter)", category: "advertising", sensitivity: "high" },
  { d: ["reddit.com", "redditstatic.com", "redditmedia.com"], entity: "Reddit", category: "advertising", sensitivity: "medium" },

  // ── Adtech / RTB / data brokers ─────────────────────────────────────────────
  { d: ["criteo.com", "criteo.net"], entity: "Criteo", category: "advertising", sensitivity: "high" },
  { d: ["taboola.com"], entity: "Taboola", category: "advertising", sensitivity: "high" },
  { d: ["outbrain.com"], entity: "Outbrain", category: "advertising", sensitivity: "high" },
  { d: ["amazon-adsystem.com"], entity: "Amazon Ads", category: "advertising", sensitivity: "high" },
  { d: ["adsrvr.org"], entity: "The Trade Desk", category: "data-broker", sensitivity: "high" },
  { d: ["adnxs.com", "adnxs-simple.com"], entity: "Xandr (Microsoft)", category: "advertising", sensitivity: "high" },
  { d: ["pubmatic.com"], entity: "PubMatic", category: "advertising", sensitivity: "high" },
  { d: ["rubiconproject.com"], entity: "Magnite (Rubicon)", category: "advertising", sensitivity: "high" },
  { d: ["casalemedia.com"], entity: "Index Exchange", category: "advertising", sensitivity: "high" },
  { d: ["openx.net"], entity: "OpenX", category: "advertising", sensitivity: "high" },
  { d: ["smartadserver.com", "sas.com"], entity: "Equativ (Smart)", category: "advertising", sensitivity: "high" },
  { d: ["adform.net", "adform.com"], entity: "Adform", category: "advertising", sensitivity: "high" },
  { d: ["teads.tv"], entity: "Teads", category: "advertising", sensitivity: "high" },
  { d: ["sharethrough.com"], entity: "Sharethrough", category: "advertising", sensitivity: "high" },
  { d: ["triplelift.com"], entity: "TripleLift", category: "advertising", sensitivity: "high" },
  { d: ["gumgum.com"], entity: "GumGum", category: "advertising", sensitivity: "high" },
  { d: ["yieldlab.net"], entity: "Yieldlab", category: "advertising", sensitivity: "high" },
  { d: ["360yield.com", "improvedigital.com"], entity: "Improve Digital", category: "advertising", sensitivity: "high" },
  { d: ["bidswitch.net"], entity: "BidSwitch", category: "data-broker", sensitivity: "high" },
  { d: ["id5-sync.com"], entity: "ID5", category: "data-broker", sensitivity: "high" },
  { d: ["rlcdn.com", "liveramp.com", "idsync.rlcdn.com"], entity: "LiveRamp", category: "data-broker", sensitivity: "high" },
  { d: ["permutive.com", "permutive.app"], entity: "Permutive", category: "data-broker", sensitivity: "high" },
  { d: ["crwdcntrl.net"], entity: "Lotame", category: "data-broker", sensitivity: "high" },
  { d: ["agkn.com"], entity: "Neustar/TransUnion", category: "data-broker", sensitivity: "high" },
  { d: ["demdex.net", "everesttech.net", "omtrdc.net", "2o7.net"], entity: "Adobe (Audience/Analytics)", category: "data-broker", sensitivity: "high" },
  { d: ["mathtag.com"], entity: "MediaMath", category: "advertising", sensitivity: "high" },
  { d: ["yahoo.com", "yahoo.net", "advertising.com", "adtech.com"], entity: "Yahoo/AOL", category: "advertising", sensitivity: "high" },

  // ── Mätning / publik ────────────────────────────────────────────────────────
  { d: ["scorecardresearch.com", "comscore.com", "sb.scorecardresearch.com"], entity: "Comscore", category: "analytics", sensitivity: "high" },
  { d: ["imrworldwide.com"], entity: "Nielsen", category: "analytics", sensitivity: "high" },
  { d: ["quantserve.com", "quantcount.com", "quantcast.com"], entity: "Quantcast", category: "analytics", sensitivity: "high" },
  { d: ["chartbeat.com", "chartbeat.net"], entity: "Chartbeat", category: "analytics", sensitivity: "medium" },
  { d: ["parsely.com", "parse.ly"], entity: "Parse.ly", category: "analytics", sensitivity: "medium" },
  { d: ["cxense.com", "cxpublic.com"], entity: "Cxense (Piano)", category: "data-broker", sensitivity: "high" },
  { d: ["piano.io", "tinypass.com", "npttech.com"], entity: "Piano", category: "analytics", sensitivity: "medium" },

  // ── Produktanalys ───────────────────────────────────────────────────────────
  { d: ["segment.com", "segment.io"], entity: "Segment (Twilio)", category: "analytics", sensitivity: "medium" },
  { d: ["mixpanel.com"], entity: "Mixpanel", category: "analytics", sensitivity: "medium" },
  { d: ["amplitude.com"], entity: "Amplitude", category: "analytics", sensitivity: "medium" },
  { d: ["hubspot.com", "hs-scripts.com", "hs-analytics.net", "hubapi.com"], entity: "HubSpot", category: "analytics", sensitivity: "medium" },

  // ── Nordiska / svenska adtech ───────────────────────────────────────────────
  { d: ["adnami.io"], entity: "Adnami", category: "advertising", sensitivity: "high" },
  { d: ["deltaprojects.com"], entity: "Delta Projects", category: "advertising", sensitivity: "high" },
  { d: ["strossle.com"], entity: "Strossle", category: "advertising", sensitivity: "high" },
  { d: ["relevant-digital.com"], entity: "Relevant Digital", category: "advertising", sensitivity: "medium" },
  { d: ["tradedoubler.com"], entity: "Tradedoubler", category: "advertising", sensitivity: "medium" },
  { d: ["emediate.eu", "emediate.com"], entity: "Emediate", category: "advertising", sensitivity: "medium" },
  { d: ["schibsted.com", "sdrn.io", "schibsted.io"], entity: "Schibsted", category: "data-broker", sensitivity: "high" },

  // ── Consent / CMP (inte trackers i sig, men intressanta) ───────────────────
  { d: ["cookiebot.com", "cookiebot.eu"], entity: "Cookiebot", category: "consent", sensitivity: "low" },
  { d: ["onetrust.com", "cookielaw.org", "cookiepro.com"], entity: "OneTrust", category: "consent", sensitivity: "low" },
  { d: ["didomi.io"], entity: "Didomi", category: "consent", sensitivity: "low" },
  { d: ["sourcepoint.com", "sp-prod.net", "summerhamster.com", "carmag.dev"], entity: "Sourcepoint", category: "consent", sensitivity: "low" },
  { d: ["consensu.org"], entity: "IAB TCF", category: "consent", sensitivity: "low" },
  { d: ["usercentrics.eu", "usercentrics.com"], entity: "Usercentrics", category: "consent", sensitivity: "low" },

  // ── Felövervakning / funktionellt (ej trackers) ────────────────────────────
  { d: ["sentry.io", "sentry-cdn.com", "ingest.sentry.io"], entity: "Sentry", category: "other", sensitivity: "low" },
  { d: ["bugsnag.com"], entity: "Bugsnag", category: "other", sensitivity: "low" },
  { d: ["newrelic.com", "nr-data.net"], entity: "New Relic", category: "other", sensitivity: "low" },

  // ── Mer adtech / SSP / DSP / verifiering ────────────────────────────────────
  { d: ["adroll.com"], entity: "AdRoll", category: "advertising", sensitivity: "high" },
  { d: ["lijit.com", "sovrn.com"], entity: "Sovrn", category: "advertising", sensitivity: "high" },
  { d: ["sonobi.com"], entity: "Sonobi", category: "advertising", sensitivity: "high" },
  { d: ["yieldmo.com"], entity: "Yieldmo", category: "advertising", sensitivity: "high" },
  { d: ["nativo.com", "postrelease.com"], entity: "Nativo", category: "advertising", sensitivity: "high" },
  { d: ["revcontent.com"], entity: "Revcontent", category: "advertising", sensitivity: "high" },
  { d: ["mgid.com"], entity: "MGID", category: "advertising", sensitivity: "high" },
  { d: ["spotxchange.com", "spotx.tv"], entity: "SpotX (Magnite)", category: "advertising", sensitivity: "high" },
  { d: ["3lift.com"], entity: "TripleLift", category: "advertising", sensitivity: "high" },
  { d: ["serving-sys.com"], entity: "Sizmek (Amazon)", category: "advertising", sensitivity: "high" },
  { d: ["flashtalking.com"], entity: "Flashtalking", category: "advertising", sensitivity: "high" },
  { d: ["bidtheatre.com"], entity: "BidTheatre", category: "advertising", sensitivity: "high" },
  { d: ["adsafeprotected.com"], entity: "Integral Ad Science", category: "advertising", sensitivity: "medium" },
  { d: ["doubleverify.com"], entity: "DoubleVerify", category: "advertising", sensitivity: "medium" },
  { d: ["moatads.com"], entity: "Oracle Moat", category: "advertising", sensitivity: "medium" },
  { d: ["quora.com"], entity: "Quora Pixel", category: "advertising", sensitivity: "high" },
  { d: ["mail.ru", "top-fwz1.mail.ru"], entity: "Mail.ru", category: "advertising", sensitivity: "high" },

  // ── Identitet / datamäklare (mer) ───────────────────────────────────────────
  { d: ["bluekai.com", "bkrtx.com"], entity: "Oracle BlueKai", category: "data-broker", sensitivity: "high" },
  { d: ["krxd.net"], entity: "Salesforce DMP (Krux)", category: "data-broker", sensitivity: "high" },
  { d: ["tapad.com"], entity: "Tapad", category: "data-broker", sensitivity: "high" },
  { d: ["eyeota.net"], entity: "Eyeota (Dun & Bradstreet)", category: "data-broker", sensitivity: "high" },
  { d: ["adsymptotic.com"], entity: "Drawbridge", category: "data-broker", sensitivity: "high" },
  { d: ["semasio.net"], entity: "Semasio", category: "data-broker", sensitivity: "high" },
  { d: ["zeotap.com"], entity: "Zeotap", category: "data-broker", sensitivity: "high" },
  { d: ["audienceproject.com", "userreport.com"], entity: "AudienceProject", category: "data-broker", sensitivity: "high" },
  { d: ["mparticle.com"], entity: "mParticle", category: "data-broker", sensitivity: "high" },
  { d: ["gigya.com"], entity: "SAP CDC (Gigya)", category: "data-broker", sensitivity: "high" },

  // ── Sessionsinspelning & produktanalys (mer) ────────────────────────────────
  { d: ["heap.io", "heapanalytics.com"], entity: "Heap", category: "analytics", sensitivity: "medium" },
  { d: ["pendo.io"], entity: "Pendo", category: "analytics", sensitivity: "medium" },
  { d: ["logrocket.com", "lr-ingest.io", "lr-in.com"], entity: "LogRocket", category: "session-recording", sensitivity: "high" },
  { d: ["inspectlet.com"], entity: "Inspectlet", category: "session-recording", sensitivity: "high" },
  { d: ["crazyegg.com"], entity: "Crazy Egg", category: "session-recording", sensitivity: "high" },
  { d: ["luckyorange.com", "luckyorange.net"], entity: "Lucky Orange", category: "session-recording", sensitivity: "high" },
  { d: ["quantummetric.com"], entity: "Quantum Metric", category: "session-recording", sensitivity: "high" },

  // ── Webbanalys (mer, inkl. integritetsvänliga) ──────────────────────────────
  { d: ["statcounter.com"], entity: "StatCounter", category: "analytics", sensitivity: "medium" },
  { d: ["getclicky.com", "clicky.com"], entity: "Clicky", category: "analytics", sensitivity: "medium" },
  { d: ["mc.yandex.ru", "yandex.ru", "yandex.com"], entity: "Yandex", category: "analytics", sensitivity: "high" },
  { d: ["hm.baidu.com", "baidu.com"], entity: "Baidu", category: "analytics", sensitivity: "high" },
  { d: ["plausible.io"], entity: "Plausible", category: "analytics", sensitivity: "low" },
  { d: ["usefathom.com"], entity: "Fathom Analytics", category: "analytics", sensitivity: "low" },
  { d: ["simpleanalytics.com", "simpleanalyticscdn.com"], entity: "Simple Analytics", category: "analytics", sensitivity: "low" },
  { d: ["matomo.cloud"], entity: "Matomo Cloud", category: "analytics", sensitivity: "low" },

  // ── Tagghanterare / CDP (mer) ───────────────────────────────────────────────
  { d: ["tiqcdn.com", "tealium.com", "tealiumiq.com"], entity: "Tealium", category: "tag-manager", sensitivity: "medium" },
  { d: ["adobedtm.com", "assets.adobedtm.com"], entity: "Adobe Experience (Launch/DTM)", category: "tag-manager", sensitivity: "medium" },
  { d: ["ensighten.com"], entity: "Ensighten", category: "tag-manager", sensitivity: "medium" },
  { d: ["tagcommander.com", "commander1.com"], entity: "Commanders Act", category: "tag-manager", sensitivity: "medium" },
  { d: ["rudderstack.com", "rudderlabs.com"], entity: "RudderStack", category: "analytics", sensitivity: "medium" },

  // ── A/B-test & optimering ───────────────────────────────────────────────────
  { d: ["optimizely.com", "optimizelyapis.com"], entity: "Optimizely", category: "ab-testing", sensitivity: "medium" },
  { d: ["visualwebsiteoptimizer.com", "vwo.com", "wingify.com"], entity: "VWO", category: "ab-testing", sensitivity: "medium" },
  { d: ["abtasty.com"], entity: "AB Tasty", category: "ab-testing", sensitivity: "medium" },
  { d: ["kameleoon.com", "kameleoon.eu"], entity: "Kameleoon", category: "ab-testing", sensitivity: "medium" },
  { d: ["convertexperiments.com", "convert.com"], entity: "Convert", category: "ab-testing", sensitivity: "medium" },
  { d: ["dynamicyield.com"], entity: "Dynamic Yield (Mastercard)", category: "ab-testing", sensitivity: "medium" },

  // ── Marknadsföring / e-post / push ──────────────────────────────────────────
  { d: ["klaviyo.com"], entity: "Klaviyo", category: "marketing", sensitivity: "high" },
  { d: ["list-manage.com", "mailchimp.com", "mailchi.mp"], entity: "Mailchimp (Intuit)", category: "marketing", sensitivity: "medium" },
  { d: ["marketo.net", "mktoresp.com", "mktoweb.com"], entity: "Marketo (Adobe)", category: "marketing", sensitivity: "high" },
  { d: ["pardot.com"], entity: "Pardot (Salesforce)", category: "marketing", sensitivity: "high" },
  { d: ["eloqua.com", "en25.com"], entity: "Oracle Eloqua", category: "marketing", sensitivity: "high" },
  { d: ["exacttarget.com", "marketingcloudapis.com"], entity: "Salesforce Marketing Cloud", category: "marketing", sensitivity: "high" },
  { d: ["braze.com", "appboycdn.com"], entity: "Braze", category: "marketing", sensitivity: "high" },
  { d: ["activecampaign.com"], entity: "ActiveCampaign", category: "marketing", sensitivity: "medium" },
  { d: ["omnisend.com"], entity: "Omnisend", category: "marketing", sensitivity: "medium" },
  { d: ["onesignal.com", "os.tc"], entity: "OneSignal", category: "marketing", sensitivity: "medium" },
  { d: ["pushwoosh.com"], entity: "Pushwoosh", category: "marketing", sensitivity: "medium" },

  // ── Kundsupport / chattwidgetar ─────────────────────────────────────────────
  { d: ["intercom.io", "intercomcdn.com", "intercom.com"], entity: "Intercom", category: "customer-support", sensitivity: "medium" },
  { d: ["zendesk.com", "zdassets.com", "zopim.com"], entity: "Zendesk", category: "customer-support", sensitivity: "medium" },
  { d: ["drift.com"], entity: "Drift", category: "customer-support", sensitivity: "medium" },
  { d: ["tawk.to"], entity: "Tawk.to", category: "customer-support", sensitivity: "medium" },
  { d: ["livechatinc.com", "livechat.com"], entity: "LiveChat", category: "customer-support", sensitivity: "medium" },
  { d: ["crisp.chat"], entity: "Crisp", category: "customer-support", sensitivity: "medium" },
  { d: ["freshchat.com", "freshworks.com"], entity: "Freshworks", category: "customer-support", sensitivity: "medium" },
  { d: ["olark.com"], entity: "Olark", category: "customer-support", sensitivity: "medium" },

  // ── Affiliate / konvertering ────────────────────────────────────────────────
  { d: ["dpbolvw.net", "anrdoezrs.net", "tkqlhce.com", "emjcd.com", "jdoqocy.com", "kqzyfj.com", "ftjcfx.com"], entity: "CJ Affiliate", category: "affiliate", sensitivity: "medium" },
  { d: ["linksynergy.com"], entity: "Rakuten Advertising", category: "affiliate", sensitivity: "medium" },
  { d: ["impact.com", "impactradius-event.com"], entity: "Impact", category: "affiliate", sensitivity: "medium" },
  { d: ["awin1.com", "awin.com", "zenaps.com"], entity: "Awin", category: "affiliate", sensitivity: "medium" },
  { d: ["adtraction.com"], entity: "Adtraction", category: "affiliate", sensitivity: "medium" },
  { d: ["partner-ads.com"], entity: "Partner-ads", category: "affiliate", sensitivity: "medium" },
  { d: ["webgains.com"], entity: "Webgains", category: "affiliate", sensitivity: "medium" },

  // ── Embeds / video / kommentarer (sociala) ──────────────────────────────────
  { d: ["vimeo.com", "vimeocdn.com"], entity: "Vimeo", category: "social", sensitivity: "medium" },
  { d: ["brightcove.com", "brightcove.net"], entity: "Brightcove", category: "social", sensitivity: "medium" },
  { d: ["jwpcdn.com", "jwplayer.com", "jwpsrv.com"], entity: "JW Player", category: "social", sensitivity: "medium" },
  { d: ["wistia.com", "wistia.net", "wi.st"], entity: "Wistia", category: "social", sensitivity: "medium" },
  { d: ["disqus.com", "disquscdn.com"], entity: "Disqus", category: "social", sensitivity: "high" },
  { d: ["addthis.com"], entity: "AddThis (Oracle)", category: "social", sensitivity: "high" },
  { d: ["sharethis.com"], entity: "ShareThis", category: "social", sensitivity: "high" },
  { d: ["vk.com", "vk.ru", "userapi.com"], entity: "VK", category: "social", sensitivity: "high" },

  // ── CMP / consent (mer) ─────────────────────────────────────────────────────
  { d: ["trustarc.com", "truste.com"], entity: "TrustArc", category: "consent", sensitivity: "low" },
  { d: ["iubenda.com"], entity: "Iubenda", category: "consent", sensitivity: "low" },
  { d: ["osano.com"], entity: "Osano", category: "consent", sensitivity: "low" },
  { d: ["axept.io"], entity: "Axeptio", category: "consent", sensitivity: "low" },
  { d: ["termly.io"], entity: "Termly", category: "consent", sensitivity: "low" },
  { d: ["cookiefirst.com"], entity: "CookieFirst", category: "consent", sensitivity: "low" },
  { d: ["fundingchoicesmessages.google.com"], entity: "Google Funding Choices", category: "consent", sensitivity: "low" },

  // ── Rena CDN:er ─────────────────────────────────────────────────────────────
  { d: ["cloudflare.com", "cloudflareinsights.com"], entity: "Cloudflare", category: "cdn", sensitivity: "low" },
  { d: ["cloudfront.net"], entity: "Amazon CloudFront", category: "cdn", sensitivity: "low" },
  { d: ["akamai.net", "akamaized.net", "akamaihd.net", "edgekey.net", "edgesuite.net"], entity: "Akamai", category: "cdn", sensitivity: "low" },
  { d: ["fastly.net", "fastlylb.net"], entity: "Fastly", category: "cdn", sensitivity: "low" },
  { d: ["jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com", "bootstrapcdn.com"], entity: "Public CDN", category: "cdn", sensitivity: "low" },
  { d: ["typekit.net", "use.typekit.net"], entity: "Adobe Fonts", category: "cdn", sensitivity: "low" },
];

// Index för snabb suffix-matchning: bygg en map domän -> post.
const EXACT = new Map();
for (const post of DB) {
  for (const dom of post.d) EXACT.set(dom, post);
}

// Publika andra-nivå-suffix för eTLD+1-beräkning (kompakt urval).
const TWO_LEVEL_TLDS = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.nz", "org.nz", "govt.nz",
  "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
  "com.br", "net.br", "org.br", "gov.br",
  "com.cn", "net.cn", "org.cn", "gov.cn",
  "co.in", "net.in", "org.in",
  "co.za", "org.za",
  "com.tr", "gov.tr", "edu.tr",
  "com.mx", "com.ar", "com.sg", "com.hk", "com.tw",
]);

/**
 * Grov eTLD+1-beräkning (registrerbar domän) utan fullständig PSL.
 * Räcker för gruppering och tredjeparts-bedömning.
 * @param {string} hostname
 * @returns {string}
 */
export function etldPlus1(hostname) {
  if (!hostname) return "";
  let h = hostname.toLowerCase().replace(/\.$/, "");
  // Strippa ev. port.
  h = h.split(":")[0];
  // IP-adress? returnera som den är.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return h;
  const parts = h.split(".");
  if (parts.length <= 2) return h;
  const lastTwo = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");
  if (TWO_LEVEL_TLDS.has(lastTwo)) return lastThree;
  return lastTwo;
}

/**
 * Plocka hostname ur en URL utan att kasta.
 * @param {string} url
 * @returns {string}
 */
export function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Klassificera en hostname mot databasen.
 * @param {string} hostname
 * @returns {{entity:string|null, category:string, sensitivity:("high"|"medium"|"low"|null), isTracker:boolean}}
 */
export function classify(hostname) {
  if (!hostname) {
    return { entity: null, category: "unknown", sensitivity: null, isTracker: false };
  }
  const host = hostname.toLowerCase().replace(/\.$/, "");

  // 1) Exakt domän.
  if (EXACT.has(host)) return decorate(EXACT.get(host));

  // 2) Suffix: prova att klippa av subdomäner steg för steg.
  const parts = host.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    if (EXACT.has(candidate)) return decorate(EXACT.get(candidate));
  }

  // 3) Okänd.
  return { entity: null, category: "unknown", sensitivity: null, isTracker: false };
}

const TRACKER_CATEGORIES = new Set([
  "advertising",
  "analytics",
  "social",
  "session-recording",
  "data-broker",
  "tag-manager",
  "ab-testing",
  "marketing",
  "affiliate",
]);

function decorate(post) {
  return {
    entity: post.entity,
    category: post.category,
    sensitivity: post.sensitivity,
    isTracker: TRACKER_CATEGORIES.has(post.category),
  };
}
