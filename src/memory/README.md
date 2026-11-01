# memory/

The agent's memory. Runs inside the extension (IndexedDB), and can import or write to a second-brain folder in the same Markdown format. The extension uses it only through `Memory` in `index.js`.

## Pipeline

```
tab events ──recordActivity()──► activity ──activity()──► "github.com 14 min, youtube.com 15 min"
                                     │
                                     └──distill(model)──┐
add() ─────────────────────────────────────────────────►├─► inbox ──consolidate()──► log ──► recall ──► contextPack()
                                                         │        (validate, redact,             (BM25,
importBrain(folder) ──► log + notes ◄────────────────────┘         dedupe, stable id)             topic-aware)
                         ▲                                                   │
                         └──────── syncBrain() ◄── brain folder ◄── exportPending()
maintain() (every 15 min): consolidate + prune activity older than 7 days + exportPending
```

| File | What it does |
|---|---|
| `entry.js` | Entry format and validation; inbox Markdown in and out |
| `brain.js` | Reads a brain checkout: `inbox/`, `notes/log/`, other notes; open loops |
| `consolidate.js` | Inbox → log: validate, redact secret-shaped strings, drop unchanged restatements, id |
| `recall.js` | In-memory BM25 over entries and notes. İ/I/ı/i fold to one letter; diacritics stripped; URL debris ignored. `topicSearch` boosts topics the tab names or the stated intent belongs to; nothing is excluded |
| `context.js` | Context pack: latest intent, open loops and notes related to the current tab, rendered for a prompt |
| `activity.js` | Tab events → time spans → per-site summary |
| `distill.js` | Prompt and parser for turning activity into entries (the model call is passed in) |
| `model.js` | OpenAI-compatible client; provider presets; settings storage |
| `db.js` | IndexedDB stores: `entries`, `notes`, `activity`, `meta` |
| `connector.js` | Brain folder access (File System Access API): read, permissions, write into `inbox/` |
| `index.js` | The `Memory` API below |

## API

```js
import { Memory } from "../memory/index.js";
import { modelClient, loadModelSettings } from "../memory/model.js";
const memory = await Memory.open();

// Brain
await memory.connectBrain(dirHandle);           // remember the folder and import it
await memory.syncBrain({ prompt });             // re-import; prompt: true only from a click
await memory.exportPending({ prompt });         // write consolidated own entries into its inbox/

// Entries
await memory.add({ kind, topic, title, context, result, evidence?, next? });
await memory.consolidate();                     // { accepted, duplicates, rejected, redactions }
await memory.recall("query", { limit });        // [{ ref, title, score, item }]
await memory.openLoops();                       // entries with a next action
await memory.latestIntent();                    // newest todo
const { pack, prompt } = await memory.contextPack({ title, url });

// Activity: call on tab activation, URL/title change, and window blur / chrome.idle
await memory.recordActivity({ url, title, kind: "focus" | "idle" });
const { spans, summary, text } = await memory.activity({ minutes: 60 });

// Distill: a model turns recent activity into inbox entries
const complete = modelClient(await loadModelSettings());
await memory.distill(complete, { minutes: 60 });

// Upkeep (background alarm)
await memory.maintain();

// Redaction for any text that leaves the device (a page excerpt): { text, count }
import { redact } from "../memory/index.js";
```

Entry fields follow the second-brain record: `kind` (`decision|fact|preference|event|lesson|todo`), `topic` (slug), `title` (3-120 chars), `date`, `source`, `context`, `result`, `evidence`, `next`.

## Model

`model.js` speaks OpenAI-compatible chat completions. Presets:

| Preset | Model | Note |
|---|---|---|
| `meta-contributor` (default) | `muse-spark-1.3-contributor` on Meta's Model API | Cheapest; Meta may train on inputs and outputs; offered only in some countries |
| `meta` | `muse-spark-1.3` on Meta's Model API | Standard price, not used for training |
| `openrouter` | `meta/muse-glimmer-30b` | Muse Glimmer is not served on Meta's Model API |
| `ollama` | `muse-glimmer` on `localhost:11434` | Local; no key. Ollama must allow the extension origin (`OLLAMA_ORIGINS`) |
| `together`, `fireworks`, `baseten`, `groq`, `nebius` | Muse Spark Open | The hosts Meta's deploy docs list; not on Meta's Model API |
 Settings, including the API key, are kept in `chrome.storage.session` (cleared when the browser closes) unless the user chooses to remember them on the device.

Live check: `npm run test:live` (one ping and one distill), with `MODEL_API_KEY` in the environment. Relevance against the real model: `npm run eval`.

## Not tested

- A brain folder chosen with the real folder picker: tests use an origin-private folder. Whether Chrome asks again for permission after a restart is unknown; `syncBrain()` reports `needsPermission` when it does.
- Distill against a real model (the live script exists; it needs a key).
- Embeddings: recall is keyword-only.
