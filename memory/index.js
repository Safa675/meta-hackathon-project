// Public memory API. The extension talks to memory only through this class.
import { makeEntry } from "./entry.js";
import { loadBrain, openLoops } from "./brain.js";
import { consolidate, entryId } from "./consolidate.js";
import { buildIndex, search, entryDoc, noteDoc } from "./recall.js";
import { contextPack, renderPack, latestIntent } from "./context.js";
import { openDb, getAll, byStatus, putAll, removeAll, clear } from "./db.js";
import { readBrainFolder, writeInboxEntry } from "./connector.js";

export class Memory {
  #db;
  #index = null;
  #entries = [];

  static async open(name) {
    const m = new Memory();
    m.#db = await openDb(name);
    return m;
  }

  async #load() {
    if (this.#index) return;
    this.#entries = await getAll(this.#db, "entries");
    const notes = await getAll(this.#db, "notes");
    this.#index = buildIndex([...this.#entries.map(entryDoc), ...notes.map(noteDoc)]);
  }

  #dirty() {
    this.#index = null;
  }

  // One-time import of a brain snapshot: [{ path, text }]. Replaces earlier imports.
  async importFiles(files) {
    const { entries, documents, skipped } = loadBrain(files);
    const own = (await getAll(this.#db, "entries")).filter((e) => !e.path);
    await clear(this.#db, "entries");
    await clear(this.#db, "notes");
    await putAll(this.#db, "entries", [
      ...own,
      ...entries.map((e) => ({ ...e, id: e.id ?? entryId(e), status: e.path.startsWith("inbox/") ? "inbox" : "log" })),
    ]);
    await putAll(this.#db, "notes", documents);
    this.#dirty();
    return { entries: entries.length, notes: documents.length, skipped };
  }

  async importBrain(dirHandle) {
    return this.importFiles(await readBrainFolder(dirHandle));
  }

  // New entry from the extension. Lands in the inbox until consolidate().
  async add(fields) {
    const entry = makeEntry({ source: "extension", ...fields });
    const stored = { ...entry, id: entryId(entry), status: "inbox", ts: Date.now() };
    await putAll(this.#db, "entries", [stored]);
    this.#dirty();
    return stored;
  }

  async consolidate() {
    const pending = await byStatus(this.#db, "inbox");
    const existing = await byStatus(this.#db, "log");
    const result = consolidate(pending, existing);
    // Rejected entries stay in the inbox with their errors attached; the rest leave it.
    // Redaction can change an accepted entry's id, so remove by the pending ids.
    const flagged = result.rejected.map(({ entry, errors }) => ({ ...entry, errors }));
    await removeAll(this.#db, "entries", pending.map((e) => e.id));
    await putAll(this.#db, "entries", [...result.accepted.map((e) => ({ ...e, ts: e.ts ?? Date.now() })), ...flagged]);
    this.#dirty();
    return {
      accepted: result.accepted.length,
      duplicates: result.duplicates.length,
      rejected: result.rejected.length,
      redactions: result.redactions,
    };
  }

  async recall(query, opts) {
    await this.#load();
    return search(this.#index, query, opts).map(({ ref, title, score, item }) => ({ ref, title, score, item }));
  }

  async openLoops() {
    await this.#load();
    return openLoops(this.#entries);
  }

  async latestIntent() {
    await this.#load();
    return latestIntent(this.#entries);
  }

  // activity: { title, url }. Returns { pack, prompt }.
  async contextPack(activity, opts) {
    await this.#load();
    const pack = contextPack(this.#index, this.#entries, activity, opts);
    return { pack, prompt: renderPack(pack, opts) };
  }

  // Live connection: write an entry back into the user's brain inbox/.
  async writeToBrain(dirHandle, entry, host) {
    await writeInboxEntry(dirHandle, entry, host);
  }
}
