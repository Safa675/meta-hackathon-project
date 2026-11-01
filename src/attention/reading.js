// Which pages Tuck may read an excerpt of before a nudge. Pure; the reading itself
// is background/page.js. The person can turn reading off or edit the site list.

// Sites never read: money, government and health, passwords, email. A line matches
// the host and its subdomains.
export const NEVER_READ = [
  "paypal.com",
  "revolut.com",
  "wise.com",
  "garantibbva.com.tr",
  "yapikredi.com.tr",
  "enpara.com",
  "qnb.com.tr",
  "teb.com.tr",
  "kuveytturk.com.tr",
  "gov",
  "gov.tr",
  "gov.uk",
  "1password.com",
  "lastpass.com",
  "dashlane.com",
  "bitwarden.com",
  "mail.google.com",
  "outlook.live.com",
  "outlook.office.com",
  "outlook.office365.com",
  "mail.yahoo.com",
  "proton.me",
];
// A host that contains one of these words is never read either (most banks, self-hosted vaults).
export const NEVER_READ_WORDS = ["bank", "vault", "password"];

// stored: what the settings page saved (chrome.storage.local "pageReading"), or nothing.
export function readingSettings(stored) {
  return { enabled: stored?.enabled ?? true, neverRead: stored?.neverRead ?? NEVER_READ };
}

export function mayRead(url, { enabled, neverRead }) {
  if (!enabled) return false;
  let host;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    host = u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  if (NEVER_READ_WORDS.some((w) => host.includes(w))) return false;
  return !neverRead.some((line) => {
    const site = line
      .trim()
      .toLowerCase()
      .replace(/^\*?\./, "");
    return site && (host === site || host.endsWith(`.${site}`));
  });
}
