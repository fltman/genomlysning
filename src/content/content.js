// content.js — klassiskt content script för Genomlysning.
//
// VIKTIGT: detta är INTE en ES-modul. Inga import-satser. Konstanter som delas med
// resten av tillägget (t.ex. meddelandetypen) dupliceras här som literaler. Håll dem
// i synk med src/shared/messages.js (MSG.SCRAPE === "GENO_SCRAPE").
//
// Uppgift: när side panel skickar {type:"GENO_SCRAPE"} bygger vi en PageScrape och
// svarar med den. Allt är inkapslat i try/catch så att scriptet aldrig kastar och
// alltid returnerar ett komplett objekt.

(function () {
  "use strict";

  // Meddelandetypen, duplicerad medvetet (se kommentaren ovan).
  const SCRAPE = "GENO_SCRAPE";

  // Nyckelord för att hitta integritets-/cookie-/samtyckeslänkar. Matchas mot både
  // länktext och href (case-insensitivt). Svenska och engelska varianter.
  const POLICY_KEYWORDS = [
    "integritetspolicy",
    "integritet",
    "personuppgift",
    "dataskydd",
    "cookie",
    "cookies",
    "privacy",
    "gdpr",
    "om annonser",
    "hantera samtycke",
    "dina val",
    "cookieinställningar",
    "cookie-inställningar",
  ];

  /**
   * Trimma och normalisera whitespace i en sträng.
   * @param {string} s
   * @returns {string}
   */
  function squashWhitespace(s) {
    try {
      return String(s == null ? "" : s)
        .replace(/\s+/g, " ")
        .trim();
    } catch (_e) {
      return "";
    }
  }

  /**
   * Hämta bästa artikeltext från sidan.
   * Prioritetsordning: <article>, <main>, [role=main], annars alla <p>-texter.
   * Cappas till 1500 tecken.
   * @returns {string}
   */
  function getExcerpt() {
    let text = "";
    try {
      const candidates = [
        document.querySelector("article"),
        document.querySelector("main"),
        document.querySelector('[role="main"]'),
      ];
      for (const el of candidates) {
        if (el) {
          const t = squashWhitespace(el.innerText || el.textContent || "");
          if (t) {
            text = t;
            break;
          }
        }
      }
      if (!text) {
        const paras = document.querySelectorAll("p");
        const parts = [];
        for (let i = 0; i < paras.length; i++) {
          const t = squashWhitespace(
            paras[i].innerText || paras[i].textContent || ""
          );
          if (t) parts.push(t);
        }
        text = squashWhitespace(parts.join(" "));
      }
    } catch (_e) {
      text = "";
    }
    if (text.length > 1500) text = text.slice(0, 1500);
    return text;
  }

  /**
   * Gör en href absolut relativt nuvarande sida. Returnerar null vid fel.
   * @param {string} href
   * @returns {string|null}
   */
  function absolutize(href) {
    try {
      if (!href) return null;
      return new URL(href, location.href).href;
    } catch (_e) {
      return null;
    }
  }

  /**
   * Avgör om en länk matchar något policy-nyckelord (text ELLER href).
   * @param {string} text
   * @param {string} href
   * @returns {boolean}
   */
  function isPolicyLink(text, href) {
    try {
      const hay = ((text || "") + " " + (href || "")).toLowerCase();
      for (let i = 0; i < POLICY_KEYWORDS.length; i++) {
        if (hay.indexOf(POLICY_KEYWORDS[i]) !== -1) return true;
      }
      return false;
    } catch (_e) {
      return false;
    }
  }

  /**
   * Skanna alla <a> efter policy-/cookie-/samtyckeslänkar.
   * Deduplicerar på absolut href, prioriterar länkar i <footer>, max 8.
   * @returns {{text:string, href:string}[]}
   */
  function collectPolicyLinks() {
    const seen = new Set();
    const footerLinks = [];
    const otherLinks = [];
    try {
      // Förberäkna footer-element för snabb tillhörighetskontroll.
      const footers = document.querySelectorAll("footer");
      const inFooter = (el) => {
        try {
          if (el.closest && el.closest("footer")) return true;
        } catch (_e) {
          /* closest kan saknas i exotiska fall */
        }
        for (let i = 0; i < footers.length; i++) {
          if (footers[i].contains(el)) return true;
        }
        return false;
      };

      const anchors = document.querySelectorAll("a");
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        let rawHref = "";
        try {
          // a.href ger redan en absolut URL i de flesta fall, men vi normaliserar
          // ändå via absolutize() för att vara robusta.
          rawHref = a.getAttribute("href") || a.href || "";
        } catch (_e) {
          rawHref = "";
        }
        const text = squashWhitespace(a.textContent || "");
        if (!isPolicyLink(text, rawHref)) continue;

        const abs = absolutize(rawHref);
        if (!abs) continue;
        // Hoppa över rena ankar-/javascript-länkar utan riktigt mål.
        if (/^javascript:/i.test(abs)) continue;
        if (seen.has(abs)) continue;
        seen.add(abs);

        const entry = { text: text || abs, href: abs };
        if (inFooter(a)) footerLinks.push(entry);
        else otherLinks.push(entry);
      }
    } catch (_e) {
      /* defensivt: returnera vad vi hunnit samla */
    }
    // Footer-länkar först, sedan övriga. Max 8.
    return footerLinks.concat(otherLinks).slice(0, 8);
  }

  /**
   * Detektera känd Consent Management Platform (CMP) via DOM och globaler.
   * @returns {{detected:boolean, vendor:string|null, signals:string[]}}
   */
  function detectCmp() {
    const signals = [];
    let vendor = null;

    const has = (sel) => {
      try {
        return !!document.querySelector(sel);
      } catch (_e) {
        return false;
      }
    };
    const g = (name) => {
      try {
        return typeof window[name] !== "undefined" && window[name] != null;
      } catch (_e) {
        return false;
      }
    };

    try {
      // OneTrust / Optanon
      if (has("#onetrust-banner-sdk")) signals.push("OneTrust: #onetrust-banner-sdk");
      if (g("OneTrust")) signals.push("OneTrust: window.OneTrust");
      if (g("Optanon")) signals.push("OneTrust: window.Optanon");
      if (
        has("#onetrust-banner-sdk") ||
        g("OneTrust") ||
        g("Optanon")
      ) {
        vendor = vendor || "OneTrust";
      }

      // Cookiebot
      if (has("#CybotCookiebotDialog"))
        signals.push("Cookiebot: #CybotCookiebotDialog");
      if (g("Cookiebot")) signals.push("Cookiebot: window.Cookiebot");
      if (has("#CybotCookiebotDialog") || g("Cookiebot")) {
        vendor = vendor || "Cookiebot";
      }

      // Didomi
      if (has("#didomi-host")) signals.push("Didomi: #didomi-host");
      if (g("Didomi")) signals.push("Didomi: window.Didomi");
      if (has("#didomi-host") || g("Didomi")) {
        vendor = vendor || "Didomi";
      }

      // Sourcepoint
      if (has('iframe[id^="sp_message"]'))
        signals.push('Sourcepoint: iframe[id^="sp_message"]');
      if (has('iframe[id^="sp_message"]')) {
        vendor = vendor || "Sourcepoint";
      }

      // Usercentrics
      if (has("#usercentrics-root"))
        signals.push("Usercentrics: #usercentrics-root");
      if (g("UC_UI")) signals.push("Usercentrics: window.UC_UI");
      if (has("#usercentrics-root") || g("UC_UI")) {
        vendor = vendor || "Usercentrics";
      }

      // Quantcast / generell TCF
      if (g("__tcfapi")) signals.push("TCF: window.__tcfapi");
      if (g("__cmp")) signals.push("TCF: window.__cmp");
      if (g("__tcfapi") || g("__cmp")) {
        vendor = vendor || "Quantcast/TCF";
      }
    } catch (_e) {
      /* defensivt */
    }

    return {
      detected: signals.length > 0,
      vendor: vendor,
      signals: signals,
    };
  }

  /**
   * Detektera inbäddade trackers via globaler. Returnerar läsbara namn (deduplicerade).
   * @returns {string[]}
   */
  function detectEmbeddedTrackers() {
    const found = [];
    const add = (name) => {
      if (found.indexOf(name) === -1) found.push(name);
    };
    const g = (name) => {
      try {
        return typeof window[name] !== "undefined" && window[name] != null;
      } catch (_e) {
        return false;
      }
    };

    try {
      if (g("fbq") || g("_fbq")) add("Meta Pixel");
      if (
        g("gtag") ||
        g("ga") ||
        g("google_tag_manager") ||
        g("dataLayer")
      )
        add("Google Analytics/GTM");
      if (g("ttq")) add("TikTok Pixel");
      if (g("hj")) add("Hotjar");
      if (g("clarity")) add("Microsoft Clarity");
      if (g("_linkedin_data_partner_ids")) add("LinkedIn Insight");
      if (g("twq")) add("X Pixel");
      if (g("snaptr")) add("Snap Pixel");
      if (g("pintrk")) add("Pinterest Tag");
    } catch (_e) {
      /* defensivt */
    }

    return found;
  }

  /**
   * Bygg hela PageScrape-objektet. Alltid komplett, kastar aldrig.
   * @returns {object} PageScrape
   */
  function buildScrape() {
    let title = "";
    let url = "";
    let lang = "";
    let excerpt = "";
    let fullTextLength = 0;
    let policyLinks = [];
    let cmp = { detected: false, vendor: null, signals: [] };
    let embeddedTrackers = [];

    try {
      title = document.title || "";
    } catch (_e) {
      title = "";
    }
    try {
      url = location.href || "";
    } catch (_e) {
      url = "";
    }
    try {
      lang =
        (document.documentElement && document.documentElement.lang) || "";
    } catch (_e) {
      lang = "";
    }
    try {
      excerpt = getExcerpt();
    } catch (_e) {
      excerpt = "";
    }
    try {
      fullTextLength = (
        (document.body && document.body.innerText) ||
        ""
      ).length;
    } catch (_e) {
      fullTextLength = 0;
    }
    try {
      policyLinks = collectPolicyLinks();
    } catch (_e) {
      policyLinks = [];
    }
    try {
      cmp = detectCmp();
    } catch (_e) {
      cmp = { detected: false, vendor: null, signals: [] };
    }
    try {
      embeddedTrackers = detectEmbeddedTrackers();
    } catch (_e) {
      embeddedTrackers = [];
    }

    return {
      title: title,
      url: url,
      lang: lang,
      excerpt: excerpt,
      fullTextLength: fullTextLength,
      policyLinks: policyLinks,
      cmp: cmp,
      embeddedTrackers: embeddedTrackers,
    };
  }

  try {
    chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
      try {
        if (msg && msg.type === SCRAPE) {
          let scrape;
          try {
            scrape = buildScrape();
          } catch (_e) {
            // Nödfallsobjekt om något oväntat ändå kastar.
            scrape = {
              title: "",
              url: "",
              lang: "",
              excerpt: "",
              fullTextLength: 0,
              policyLinks: [],
              cmp: { detected: false, vendor: null, signals: [] },
              embeddedTrackers: [],
            };
          }
          sendResponse(scrape);
          return true; // håll kanalen öppen (svaret är synkront men detta är säkert)
        }
      } catch (_e) {
        // Svara aldrig med ett kastat fel — content scriptet ska vara osynligt.
      }
      return false;
    });
  } catch (_e) {
    // chrome.runtime kan saknas i exotiska kontexter — gör inget.
  }
})();
