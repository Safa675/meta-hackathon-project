// UNVERIFIED: whether session status is readable from the claude.ai/code DOM is
// still an open question. Inspect the page, then replace detectStatus().
// Until then this reports nothing.
function detectStatus() {
  return null; // "running" | "waiting" | "done" once the DOM is known
}

let last = null;
setInterval(() => {
  const status = detectStatus();
  if (status && status !== last) {
    last = status;
    chrome.runtime.sendMessage({ type: "agent-status", status, url: location.href });
  }
}, 3000);
