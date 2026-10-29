// chrome.storage.local wrapper for entries. Kept apart from entry.js so the
// format code stays testable under node.
import { makeEntry } from "./entry.js";

const KEY = "entries";

export async function listEntries() {
  const { [KEY]: entries = [] } = await chrome.storage.local.get(KEY);
  return entries;
}

export async function addEntry(fields) {
  const entry = makeEntry(fields);
  const entries = await listEntries();
  entries.push({ ...entry, ts: Date.now() });
  await chrome.storage.local.set({ [KEY]: entries });
  return entry;
}

export async function lastIntent() {
  const entries = await listEntries();
  return [...entries].reverse().find((e) => e.kind === "todo");
}
