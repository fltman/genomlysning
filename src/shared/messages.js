// Meddelandekonstanter och promise-baserade helpers.
//
// VIKTIGT: content.js är ett klassiskt content script och kan INTE importera denna
// modul. Dessa strängvärden är därför duplicerade som literaler i content.js — håll
// dem i synk om de ändras här.

export const MSG = Object.freeze({
  START_SCAN: "GENO_START_SCAN", // sidepanel -> background
  GET_BUFFER: "GENO_GET_BUFFER", // sidepanel -> background
  SCRAPE: "GENO_SCRAPE",         // sidepanel -> content script
});

/**
 * Skicka ett meddelande till background-service-workern och få ett promise tillbaka.
 * @param {object} message
 * @returns {Promise<any>}
 */
export function sendToBackground(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(response);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Skicka ett meddelande till content-scriptet i en specifik flik.
 * @param {number} tabId
 * @param {object} message
 * @returns {Promise<any>}
 */
export function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(response);
      });
    } catch (e) {
      reject(e);
    }
  });
}
