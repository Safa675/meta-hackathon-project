// Which tab is "the page in front", and in what condition. Pure: background.js
// passes in what Chrome reports.
// tab: a chrome.tabs.Tab. focusedWindowId: the focused Chrome window, or -1.
// forceUnfocused: Chrome reported that no Chrome window has focus.
export function contextFlags(tab, { focusedWindowId, idleState = "active", forceUnfocused = false }) {
  if (!tab?.active) return null;
  if (forceUnfocused) return { browserFocused: false, idleState };
  // The active tab of a window the user is not in (music in a second window) is not in front.
  if (tab.windowId !== focusedWindowId) return null;
  return { browserFocused: true, idleState };
}

// Same page for "Take me back": ignores the #fragment and a trailing slash.
export function sameDocument(a, b) {
  const norm = (u) => {
    try {
      const url = new URL(u);
      url.hash = "";
      return url.href.replace(/\/$/, "");
    } catch {
      return null;
    }
  };
  const na = norm(a);
  return na !== null && na === norm(b);
}
