# Meta Hackathon Project

Chrome extension (MV3): a focus agent that knows what you meant to do and notices when you drift. Optional later: a connection to a Muse Code session.

Built during the Meta AI developer hackathon. Design inspired by a private personal knowledge system; no code reused.

## Layout

| Folder | Owner | What |
|---|---|---|
| `memory/` | Safa | Memory: entries, consolidation, recall, context pack, brain folder connector. See [memory/README.md](memory/README.md) |
| `attention/` | İrem | The attention engine: a pure reducer over browsing events: relevance keys, drift budget, states, triggers, intervention policy, shadow goals, event log store |
| `agent/` | İrem (audit by Safa) | LLM nodes with structured output: `relevance.js` judges one page against the goal. `audit.js` is Safa's earlier audit, kept as reference and not wired |
| `evals/` | İrem | `npm run eval`: relevance accuracy against the real model |
| `extension/` | İrem (first version by Safa) | Background worker (Chrome events → engine → event log, relevance calls, badge, hourly distill, upkeep), popup (goal, state, nudge with *Take me back* / *This is for my task* / *5-min break*, mode), settings page (model, brain, event log export/import) |
| `manifest.json` | İrem | At the root so Chrome can load both folders |
| `test/` | both | `npm test` (node), `npm run test:browser` (real Chromium) |

## Status

Memory is complete and tested (node and real Chromium): entries, consolidation, topic-aware recall, context pack, activity log, distill, scheduled upkeep, and the brain folder connection (import, export, re-sync from the remembered folder). See [memory/README.md](memory/README.md).

The attention engine works end to end in Chromium against a fake model (`npm run test:e2e`): goal from the popup, each page judged against it, drift after the tolerance, badge and nudge, *Take me back* (also when the related tab was closed), *This is for my task* silencing that page next time, and the exported event log. The engine itself is unit-tested in node (`npm test`).

**Privacy:** the companion sees page URLs and titles only. It never reads page content or takes screenshots. The event log stays on this device for 7 days.

Not done:
- The relevance eval against the real model (`npm run eval`) and its baseline.
- Replay tests on a recorded real session.
- The avatar overlay, side panel chat and agent dialogue (plan 2).
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
4. In the popup, say what you are about to do. Browse. About 45 seconds on an unrelated page and the badge shows a nudge; open the popup to answer it. The options page exports the event log.

Secret scanning: `pre-commit install` (gitleaks). The fake keys in `test/consolidate.test.js` are fixtures for the redactor.

## License

MIT
