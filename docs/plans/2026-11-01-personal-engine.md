# Notes decide what a page means: page region, facts and reminders

Status: open

Issues: #9 (page region), #8 (facts and labels), #10 (reminders), #16 (memory, Safa)

## Intent
Serves: `docs/INTENT.md` § Outcome ("the better it knows which detours are fine for you") and § Invariants ("Both errors count", "Facts and timing are deterministic").

Change: no fact about the person can decide a label today. A note saying "working with İrem on the hackathon" should mean a conversation with İrem gets no nudge and the feed on the same URL does, with no model call at decision time.

**Conflict to settle in this work:** `docs/INTENT.md` § Constraints and `AGENTS.md` § Project say page content is read only right before a drift word. `pageRegion` reads a conversation's heading when the person works in it. Update both, and `docs/DECISIONS.md`, in the first PR.

Out of scope: Muse Code (#11), avatar work, chat, per-host learned tolerance, activity-based budget rates, screenshots, per-site scraping.

## Design

### What the LinkedIn check found (2026-11-01, real logged-in session, read-only)

| Finding | Consequence |
|---|---|
| The docked chat lives in an open shadow root under `#interop-outlet`: `role="dialog"`, `aria-label="Messaging"`, with a textbox | The dialog's own label holds no name |
| The dialog's first heading is the other person's name (`h2`) | The name comes from the heading |
| Message options expose text in `aria-label`s ("Options for the message from …") | Read only the heading, never all labels |
| Prototype: wheel in the chat gave `conversation` + the name; wheel on the feed and a click on the conversation list gave `page` | "Last thing touched" works on real LinkedIn |
| Focus stays in the message box while the feed scrolls | Focus cannot say where the person is (matches the #13 finding) |
| The feed scrolls on `main`, not `document` | Use `wheel` and `pointerdown`; do not rely on document scroll |
| In the extension tool's page context, `instanceof Element` was false for shadow nodes, and the first prototype silently returned `page` | Use `nodeType === 1`, and `composedPath()` because `event.target` is retargeted to the host |
| The full page `/messaging/thread/<id>/` has no dialog; the textbox is in `main`, with the name as nearest heading | Needs its own rule (below) |

Not checked: other sites (WhatsApp Web, Slack, Discord), a group chat, minimised chats, a feed post's comment box.

Confirmed on LinkedIn: when the chat sits at the middle of the window and nothing is typed, `readExcerpt` gets the shadow host from `elementFromPoint`, whose `innerText` holds no shadow text, so it reads the page behind the chat. `pageRegion` covers known people. A chat with someone not in the notes is still judged by the page behind it until the person types.

### Nodes

```text
Note -> buildProfile (facts added) -> verifyFacts -> "What Tuck knows" card -> cfg.personal
Page -> pageRegion -> context.surface -> personRule (pure, no model) -> engine
At a natural moment -> pickReminder (pure) -> line + three answers
```

- **`pageRegion`** in `src/background/page.js`, self-contained like its neighbours. On `pointerdown` and `wheel`, walk `composedPath()` up to `body`. Result is `conversation` when:
  - a `role="dialog"` element contains a textbox; or
  - the URL path contains a messaging word (`messag`, `chat`, `inbox`, `thread`) and the event is inside a `main` that contains a textbox. This restriction keeps a feed comment box from counting as a conversation.

  Otherwise `page`. Labels: the container's first heading only. On a change, send the existing `record-active` message (`src/background/index.js:768`).
- **`context.surface`**: read in `contextJob` (`src/background/index.js:189`), logged raw on the `context` input so replay sees it. `INPUTS` in `src/attention/replay.js:8` drops unknown types, so no new input type.
- **Surface in keys**: `relevanceKey`, `labelKeys` (`src/attention/relevance.js:32,38`) and the look cache key (`src/background/index.js:241`) gain a conversation suffix. `evidence` (`src/attention/engine.js:85`) carries the surface.
- **Facts**: shape in #8. `chrome.storage.local` `personal`, merged into `cfg.personal`. `buildProfile` (`src/agent/profile.js:64`) returns `people` and `projects`; new pure `verifyFacts`. Needs #16.
- **`personRule`** in `src/attention/relevance.js`, called from `applyContext` (`src/attention/engine.js:109`). Source `person` is never a return point (`rememberRelated`, `src/attention/engine.js:100`). The worker's logged label excludes it, so replay with another `cfg.personal` differs.
- **Label order** in `knownLabel` (`src/background/index.js:230`) and the engine: built-in; own `related` label; `personRule`, yielding to an own `unrelated` label; fresh look `related`; own `unrelated` label; project host; cache; model.
- **Two-way labels**: `nextLabel` and `labelHolds` (`src/attention/relevance.js`) gain `against` days. "Take me back" (`src/background/index.js:606`) adds one. Lasting needs `labelDays` days on that side and more days than the other.
- **`pickReminder`**: new `src/attention/reminders.js`; state `loops` in `chrome.storage.local`; `doneAt` also filters `dueSoon` (`src/background/index.js:45`).
- **`other_commitment`**: fourth label in `src/agent/relevance.js:7`, with a short list from `taskQueue()`.

Flagged concerns:
- A first name can match the wrong person. The card corrects it; scrolling the feed always ends the match.
- A chat with one known person about something else counts as work. Accepted.
- Step 3 onward depends on #16. Until it lands, build against a fixture with the agreed shape.
- LinkedIn's markup can change. The rule uses roles and headings, not its class names; the fallback is `page`, which behaves as today.

## Plan

Each step is its own commit and leaves `npm test` green.

| # | Build | Files | You can see |
|---|---|---|---|
| 1 | `pageRegion`, `context.surface`, docs conflict settled | `src/background/page.js`, `src/background/index.js`, `AGENTS.md`, `docs/INTENT.md`, `docs/DECISIONS.md` | The event log shows `conversation` and the name |
| 2 | Surface in keys, labels, evidence | `src/attention/relevance.js`, `src/attention/engine.js`, `src/background/index.js` | An answer in a chat does not excuse the feed |
| 3 | Facts, `verifyFacts`, card | `src/agent/profile.js`, `src/options/` | The card shows name and quote; a fake quote is rejected |
| 4 | `personRule`, `cfg.personal`, label order | `src/attention/relevance.js`, `src/attention/engine.js`, `src/background/index.js` | Same page, two memories, two responses |
| 5 | Two-way labels, project as `topic` | `src/attention/relevance.js`, `src/background/index.js`, `src/attention/intents.js` | "Take me back" teaches |
| 6 | `pickReminder`, answers, greeting | `src/attention/reminders.js`, `src/tuck/`, `src/agent/nudge.js`, `src/background/index.js` | "Closes today, did it go in?" |
| 7 | `other_commitment` | `src/agent/relevance.js`, `src/tuck/`, `evals/` | A page for another commitment gets no nudge |
| 8 | Recorded session, evals | `test/fixtures/`, `evals/` | Both error rates reported |

Risk: step 2 changes keys, so existing caches and labels stop matching for conversations. Step 5 changes what #13's label e2e expects; update those tests consciously, never weaken them.

## Test plan

Tier: unit, replay and integration (e2e against the fake model). Eval for the prompt changes.

New cases:
- e2e, extending the docked-chat page (`test/browser/extension.mjs:52`), with the chat in an open shadow root like LinkedIn's: touching the chat gives `conversation`; scrolling the feed returns to `page`, with focus still in the box; a comment box in the feed stays `page`; a messaging URL's `main` counts.
- Unit: `personRule` (match, no match, folding İ/I, `unrelated` label wins, not a return point); `verifyFacts` (fake quote, name not in quote); surface in keys; two-way labels (3 days, not 3 times in one day); `pickReminder` (moments only, once a day, done stays done).
- Replay: one log with two `cfg.personal` values gives different triggers; a log without `surface` replays as `main` does.
- Eval: about 10 fact-extraction cases on invented notes; `other_commitment` cases. Baseline `evals/baseline.json`. The #13 excerpt cases have not been run yet, so run them first to get a clean starting point.
- Manual on real LinkedIn after steps 1 and 4.

Done when: `npm test`, `npm run test:browser` and `npm run test:e2e` all pass; `npm run eval` meets `docs/INTENT.md` (accuracy ≥ 85%, false "unrelated" ≤ 5%); and the two-profile replay test passes.
