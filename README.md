# Meta Hackathon Project

Chrome extension (MV3) that remembers what you were doing while your coding agent runs, and hands you the thread back when you return.

Built during the Meta AI developer hackathon. Design inspired by a private personal knowledge system; no code reused.

## Status

Skeleton. Working: intent capture in the popup, local storage, export. Not done:
- Reading agent status from the claude.ai/code page (`src/content/claude-code.js` is a stub; DOM unverified).
- Drift detection.
- Meta-model reasoning layer (required for the hackathon).

## Memory format

Every entry uses the same fields as a second-brain inbox record: `Date · Context · Decision/Result · Evidence · Next action`, plus `kind` (`decision|fact|preference|event|lesson|todo`), `topic` (slug), `title`, `source`.

- `src/entry.js` validates entries and converts to/from inbox markdown (`toInboxMarkdown`, `fromInboxMarkdown`).
- The popup's "Export to brain inbox" downloads one `.md` file per entry. Drop them into a brain's `inbox/` as-is.
- `src/brain.js` reads a brain checkout (`inbox/`, `notes/log/`, and every other note under `notes/`) into entries and free-form documents, and extracts open loops (entries with a next action). Nothing is filtered by topic. The options page picks the folder with the File System Access API and reads it in the browser. Brain content is never committed here (`brain/` is gitignored).

## Demo data

The demo runs on the author's own second brain, loaded locally through the options page at demo time. It is not part of this repo.

## Develop

```
npm test                 # format round-trip tests, node only
```

Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → this folder.

Secret scanning: `pre-commit install` (gitleaks) before the first commit.

## License

MIT
