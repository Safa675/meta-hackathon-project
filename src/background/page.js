// Functions run inside the page in front for the second look, through
// chrome.scripting.executeScript({ func }). Chrome sends each function's source on its
// own, so each must be self-contained: no imports, no names from outside it. They run
// in this extension's isolated world, where a value left on `window` stays for the
// page's life. Covered by the extension e2e.

// Notes when a key was last pressed or a field last changed on this page: a time,
// never which key or what text. Installs once per page.
export function watchTyping() {
  if (window.__tuckTyping) return true;
  window.__tuckTyping = { last: 0 };
  const mark = () => (window.__tuckTyping.last = Date.now());
  addEventListener("keydown", mark, { capture: true, passive: true });
  addEventListener("input", mark, { capture: true, passive: true });
  return true;
}

// Is the person typing on this page: is the focus in a field that takes text, and did
// they type within recentMs? A field left focused while scrolling is not typing. Reads
// no text. Tuck's own bubble does not count.
export function isComposing(recentMs) {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) {
    if (el.id === "tuck-companion") return false;
    el = el.shadowRoot.activeElement;
  }
  if (!el || el === document.body || el.id === "tuck-companion") return false;
  const notText = ["checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "image", "hidden"];
  const field =
    el.isContentEditable ||
    el.tagName === "TEXTAREA" ||
    (el.tagName === "INPUT" && !notText.includes((el.type || "text").toLowerCase()));
  return field && Date.now() - (window.__tuckTyping?.last ?? 0) < recentMs;
}

// A short excerpt of the visible page: the text around the focused field when
// fromFocus (the person is typing there), else around the middle of the window. Never
// reads form values or drafts, and reads nothing when a password field is visible,
// also inside open shadow roots and same-origin frames. Returns { password, text }, or
// null when the tab has moved on from url.
export function readExcerpt(url, maxChars, minChars, fromFocus) {
  if (location.href !== url) return null;
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const hasPassword = (root) => {
    if ([...root.querySelectorAll('input[type="password"]')].some(shown)) return true;
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot && hasPassword(el.shadowRoot)) return true;
      if (el.tagName === "IFRAME" && shown(el)) {
        let doc = null;
        try {
          doc = el.contentDocument; // null or a throw for another origin
        } catch {}
        if (doc && hasPassword(doc)) return true;
      }
    }
    return false;
  };
  if (hasPassword(document)) return { password: true, text: "" };
  let focus = document.activeElement;
  while (focus?.shadowRoot?.activeElement && focus.id !== "tuck-companion") focus = focus.shadowRoot.activeElement;
  const typing =
    fromFocus &&
    !!focus &&
    focus !== document.body &&
    focus.id !== "tuck-companion" &&
    (focus.isContentEditable || focus.tagName === "TEXTAREA" || focus.tagName === "INPUT");
  const flat = (s) => (s || "").replace(/\s+/g, " ").trim();
  // Climb from there until the container holds enough text to say what it is about.
  let node = typing ? focus : document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  let text = "";
  for (; node && node !== document.documentElement; node = node.parentElement) {
    text = flat(node.innerText);
    if (text.length >= minChars) break;
  }
  // innerText has no form values; drafts in editable boxes are the person's, not the page's.
  for (const box of node?.querySelectorAll?.('[contenteditable=""], [contenteditable="true"]') ?? []) {
    const draft = flat(box.innerText);
    if (draft) text = flat(text.replace(draft, " "));
  }
  // Next to a text field the newest lines (a chat's last messages) are at the end.
  return { password: false, text: typing ? text.slice(-maxChars) : text.slice(0, maxChars) };
}
