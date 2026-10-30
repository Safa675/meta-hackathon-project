# Meta Hackathon Project

Chrome extension (MV3): a focus agent that knows what you meant to do and notices when you drift. Optional later: a connection to a Muse Code session.

Built during the Meta AI developer hackathon. Design inspired by a private personal knowledge system; no code reused.

## Layout

| Folder | Owner | What |
|---|---|---|
| `memory/` | Safa | Memory: entries, consolidation, recall, context pack, brain folder connector. See [memory/README.md](memory/README.md) |
| `agent/` | Safa | The audit: stated intent and open loops vs. recent activity → verdict and nudge. See [agent/README.md](agent/README.md) |
| `extension/` | İrem (first version by Safa) | Background worker (tab capture, audit every 5 min, drift notification and badge, hourly distill, upkeep), popup, settings page |
| `manifest.json` | İrem | At the root so Chrome can load both folders |
| `test/` | both | `npm test` (node), `npm run test:browser` (real Chromium) |

## Status

Memory is complete and tested (node and real Chromium): entries, consolidation, topic-aware recall, context pack, activity log, distill, scheduled upkeep, and the brain folder connection (import, export, re-sync from the remembered folder). See [memory/README.md](memory/README.md).

The extension works end to end in Chromium against a fake model (`npm run test:e2e`): tab capture, intent from the popup, "Check now", drift verdict and badge, the audit timer's notification, and "Done".

Not done:
- Runs against the real model: `npm run test:live:audit`.
- A real Chrome session on a laptop: real folder picker, real idle and focus events.
- Agent status from claude.ai/code (`extension/content/claude-code.js` is a stub; DOM unverified).

## Brain compatibility

Entries use the second-brain record format (`Date · Context · Decision/Result · Evidence · Next action`, plus `kind`, `topic`, `title`, `source`). A brain checkout can be imported, and new entries can be written into its `inbox/` in the same format. Brain content is never committed here (`brain/` is gitignored).

## Demo data

The demo runs on the author's own second brain, loaded locally at demo time. It is not part of this repo.

## Develop

```
npm test                  # node unit tests
npm run test:browser      # memory API inside the extension in Chromium; needs Playwright
npm run test:e2e          # the whole extension against a fake model; needs Playwright
npm run test:live         # real model call; needs MODEL_API_KEY in the environment
npm run test:live:audit   # audit scenarios against the real model
```

## Try it

1. `chrome://extensions` → Developer mode → Load unpacked → this folder.
2. Pin the extension, open Settings (from the popup), pick a provider, paste the key, Save, Test connection.
3. Optional: Connect folder → your second-brain checkout.
4. In the popup, say what you are about to do. Browse. The popup's "Check now" asks for a verdict; the timer checks every 5 minutes and notifies when you drift (at most once per 15 minutes).

Secret scanning: `pre-commit install` (gitleaks). The fake keys in `test/consolidate.test.js` are fixtures for the redactor.

## License

MIT
