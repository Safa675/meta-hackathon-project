# Meta Hackathon Project

Chrome extension (MV3): a focus agent that knows what you meant to do and notices when you drift. Optional later: a connection to a Muse Code session.

Built during the Meta AI developer hackathon. Design inspired by a private personal knowledge system; no code reused.

## Layout

| Folder | Owner | What |
|---|---|---|
| `memory/` | Safa | Memory: entries, consolidation, recall, context pack, brain folder connector. See [memory/README.md](memory/README.md) |
| `extension/` | İrem | Extension shell and UI. Current files are placeholders that show how to call memory |
| `manifest.json` | İrem | At the root so Chrome can load both folders |
| `test/` | both | `npm test` (node), `npm run test:browser` (real Chromium) |

## Status

Memory is complete and tested (node and real Chromium): entries, consolidation, topic-aware recall, context pack, activity log, distill, scheduled upkeep, and the brain folder connection (import, export, re-sync from the remembered folder). See [memory/README.md](memory/README.md).

Not done:
- The agent loop: the audit call on the context pack and activity (required for the hackathon).
- Tab capture in the extension (`memory.recordActivity` is ready for it) and the UI.
- Agent status from claude.ai/code (`extension/content/claude-code.js` is a stub; DOM unverified).

## Brain compatibility

Entries use the second-brain record format (`Date · Context · Decision/Result · Evidence · Next action`, plus `kind`, `topic`, `title`, `source`). A brain checkout can be imported, and new entries can be written into its `inbox/` in the same format. Brain content is never committed here (`brain/` is gitignored).

## Demo data

The demo runs on the author's own second brain, loaded locally at demo time. It is not part of this repo.

## Develop

```
npm test                  # node unit tests
npm run test:browser      # loads the extension in Chromium; needs Playwright
npm run test:live         # real model call; needs MODEL_API_KEY in the environment
```

Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → this folder.

Secret scanning: `pre-commit install` (gitleaks). The fake keys in `test/consolidate.test.js` are fixtures for the redactor.

## License

MIT
