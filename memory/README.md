# memory/

The agent's memory. Runs inside the extension (IndexedDB), and can import or write to a second-brain folder in the same Markdown format. The extension uses it only through `Memory` in `index.js`.

## Pipeline

```
add() ──► inbox ──consolidate()──► log ──► recall index ──► contextPack()
                (validate, redact,                (BM25, built
                 dedupe, stable id)                at load)
importBrain(folder) ──► log + notes (snapshot of a second brain)
```

| File | What it does |
|---|---|
| `entry.js` | Entry format and validation; inbox Markdown in and out |
| `brain.js` | Reads a brain checkout: `inbox/`, `notes/log/`, other notes; open loops |
| `consolidate.js` | Inbox → log: validate, redact secret-shaped strings, drop unchanged restatements, id |
| `recall.js` | In-memory BM25 over entries and notes. İ/I/ı/i fold to one letter; diacritics stripped |
| `context.js` | Context pack: latest intent, open loops and notes related to the current tab, rendered for a prompt |
| `db.js` | IndexedDB stores: `entries` (by id, indexed by status), `notes` (by path) |
| `connector.js` | Brain folder access (File System Access API): read, and write entries into `inbox/` |
| `index.js` | The `Memory` API below |

## API

```js
import { Memory } from "../memory/index.js";
const memory = await Memory.open();

await memory.importBrain(dirHandle);           // or importFiles([{ path, text }])
await memory.add({ kind, topic, title, context, result, evidence?, next? });
await memory.consolidate();                    // { accepted, duplicates, rejected, redactions }
await memory.recall("query", { limit });       // [{ ref, title, score, item }]
await memory.openLoops();                      // entries with a next action
await memory.latestIntent();                   // newest todo
const { pack, prompt } = await memory.contextPack({ title, url });  // prompt: text for the model
await memory.writeToBrain(dirHandle, entry, host);                  // live connection
```

Entry fields follow the second-brain record: `kind` (`decision|fact|preference|event|lesson|todo`), `topic` (slug), `title` (3-120 chars), `date`, `source`, `context`, `result`, `evidence`, `next`.

## Not done

- Live connection: the folder handle is not persisted, so the user re-picks it; whether Chrome re-prompts after a restart is untested.
- Scheduled consolidation (`chrome.alarms`); today the caller runs `consolidate()`.
- Embeddings; recall is keyword-only.
- Auto-distill (a Meta model turns activity into entries).
