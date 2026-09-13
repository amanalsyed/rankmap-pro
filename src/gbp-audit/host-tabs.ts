/** Google Search + Maps tabs that run listing tool content scripts. */
const GOOGLE_HOST_TAB_PATTERNS = ['https://www.google.com/*', 'https://google.com/*'];

/** Push audit queue / completion updates to every open Google host tab. */
export function notifyGoogleHostTabs(payload: Record<string, unknown>): void {
  void chrome.tabs.query({ url: GOOGLE_HOST_TAB_PATTERNS }).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id) chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
    }
  });
}
