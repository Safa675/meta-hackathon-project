# Attention Engine Implementation Plan (Plan 1 of 2)

> **Done, kept as a record.** Paths below are from before the 2026-11-01 reorganisation: `attention/`, `agent/`, `memory/` now live under `src/`, `extension/background.js` is `src/background/index.js`, popup and options are `src/popup/` and `src/options/`, and tests are `test/unit/<area>/<name>.test.js`. Full mapping: design §13.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working, measurable attention engine in the extension: it logs every browsing event, judges each page against the stated goal, detects drift and fragmentation, decides intervention levels, and surfaces them through the badge and popup with *Take me back* / *This is for my task* / *5-min break* — verified by unit, replay and e2e tests and a relevance eval.

**Architecture:** `attention/` is a pure, Chrome-free reducer (`step(state, input) → {state, out}`) plus a policy module; `extension/background.js` is a thin shell that turns Chrome events into engine inputs, persists engine state in `chrome.storage.session`, appends inputs and outputs to an IndexedDB event log, and asks `agent/relevance.js` (LLM#1) for unknown pages. Replay feeds a recorded log back through the same `step`.

**Tech Stack:** Plain ES modules (no build), Chrome MV3, IndexedDB, `node --test`, Playwright (integration), Meta Model API via `memory/model.js`.

**Spec:** `docs/superpowers/specs/2026-10-31-attention-agent-design.md` (read §5–§7 and §9 before starting). Plan 2 (agent dialogue, overlay avatar, side panel, learning, demo) follows this one.

## Global Constraints

- Everything in English: code, comments, prompts, UI text, commit messages.
- No build step; plain ES modules. No new runtime dependencies.
- `attention/` never touches `chrome.*`; it must run under `node --test`.
- `memory/` is Safa's: import its API, never edit it (needed changes → GitHub issue).
- The model never calls tools; every LLM output is JSON validated against a schema, retried once with the error, then a deterministic fallback.
- Relevance uses URL + title only; no page content, no screenshots (v1, under test).
- Engine state is never trusted in memory: it is read from and written to `chrome.storage.session` on every input.
- Default model `muse-spark-1.3-contributor`; `muse-spark-1.3` if Contributor is unavailable.
- Commits: plain imperative subject like the existing history, no type prefix, no trailers.
- Format touched JS with `npx prettier --write <file>`; never reformat untouched files.
- Both errors count (INTENT.md): never nag on an unsure page, never stay silent on a clear drift.

## Review Focus

1. **Service worker restart mid-drift** — state survives a JSON round trip; the drift trigger fires once, not twice, and the budget keeps counting. Pinned in Task 3.
2. **Burst of Chrome events** (`onActivated` + several `onUpdated` for one navigation) — inputs are processed strictly one at a time, in arrival order. Pinned in Task 6 (`createSerialQueue`).
3. **A relevance answer arrives after the user moved on** — it updates the cache but never relabels the page now in front. Pinned in Task 3.
4. **Laptop sleep / long silence between inputs** — a gap longer than `maxGapSec` is time away, never unrelated time. Pinned in Task 3.
5. **The last related tab was closed** — *Take me back* opens its URL in a new tab instead of failing. Pinned in Task 7 (e2e).

---

## File Structure

```
attention/config.js        DEFAULTS and withOverrides()
attention/relevance.js     hostOf, normalizeTitle, relevanceKey, labelKeys, builtinLabel, isUnsure
attention/engine.js        initialState, step, nextWakeAt — budget, state machine, trigger candidates
attention/policy.js        initialPolicy, decide — levels, cooldown, mode suppression, unsure cap
attention/intents.js       dayKey, isExpired — shadow-intent expiry
attention/replay.js        replay(log, opts) — drives step() over a recorded log
attention/queue.js         createSerialQueue
attention/store.js         IndexedDB "attention": events, labels, relevanceCache, intents (browser only)
agent/json.js              extractJsonObject (copied from agent/audit.js)
agent/relevance.js         relevanceMessages, parseRelevance, classifyRelevance (LLM#1)
evals/relevance/cases.jsonl, evals/run.mjs, evals/baseline.json, evals/reports/
extension/background.js    rewritten: sensor → engine → log → badge; actions
extension/popup/*          rewritten check-in card → engine state + last trigger + 3 buttons
extension/options/*        + export/import event log
test/attention-*.test.js, test/agent-relevance.test.js, test/fixtures/
test/browser/extension.mjs rewritten e2e
```

---

### Task 1: Config and relevance keys

**Files:**
- Create: `attention/config.js`, `attention/relevance.js`
- Test: `test/attention-relevance.test.js`

**Interfaces:**
- Produces:
  - `DEFAULTS` = `{ toleranceSec: 45, decayRate: 2, unsureConfidence: 0.6, fragWindowSec: 120, fragMinSwitches: 6, fragUnrelatedShare: 0.5, escalateAfterSec: 30, cooldownSec: 120, gentleMultiplier: 2, returnAwaySec: 300, maxGapSec: 120, breakMin: 5, dayBoundaryHour: 4, expireAwayHours: 6, retentionDays: 7 }`
  - `withOverrides(overrides?: object) → object` (shallow merge over `DEFAULTS`, unknown keys ignored)
  - `hostOf(url) → string` (lowercase, no `www.`; `""` if unparsable)
  - `normalizeTitle(title) → string`: drop a leading `(\d+) ` counter, collapse whitespace, trim, lowercase, max 120 chars
  - `TITLE_SENSITIVE = ["youtube.com", "reddit.com", "x.com", "twitter.com", "medium.com", "news.ycombinator.com", "instagram.com", "tiktok.com"]`
  - `relevanceKey(intentId, url, title) → string` = `` `${intentId}|${host}|${normalizeTitle(title)}` `` (cache key)
  - `labelKeys(topic, url, title) → string[]` — most specific first: title-sensitive host → `[topic|host|normTitle, topic|host]`; otherwise `[topic|host]`
  - `builtinLabel(url, ownOrigin) → "neutral" | null` — neutral for: empty URL, `about:`, `chrome:`, `edge:`, `chrome-extension:` (incl. `ownOrigin`), new tab, `www.google.com/search`, `www.bing.com/search`, `duckduckgo.com`, `calendar.google.com`
  - `isUnsure({label, confidence}, cfg) → boolean` = `label === "unrelated" && confidence < cfg.unsureConfidence`

- [ ] **Step 1: Write the failing tests** — `normalizeTitle("(3) Inbox  - Gmail ")` → `"inbox - gmail"`; `relevanceKey("i1", "https://www.youtube.com/watch?v=a", "Top 10 F1")` → `"i1|youtube.com|top 10 f1"`; `labelKeys("focus", "https://youtube.com/watch", "React hooks")` → `["focus|youtube.com|react hooks", "focus|youtube.com"]`; `labelKeys("focus", "https://github.com/acme/shop", "x")` → `["focus|github.com"]`; `builtinLabel("https://www.google.com/search?q=x")` → `"neutral"`, `builtinLabel("https://github.com/x")` → `null`; `isUnsure({label:"unrelated", confidence:0.5}, DEFAULTS)` true, at `0.6` false; `withOverrides({toleranceSec: 3, bogus: 1})` has `toleranceSec 3` and no `bogus`.
- [ ] **Step 2:** `node --test test/attention-relevance.test.js` → FAIL (module not found).
- [ ] **Step 3:** Implement both files.
- [ ] **Step 4:** Same command → PASS; `npm test` → all pass.
- [ ] **Step 5:** Commit `Add attention config and relevance keys`.

---

### Task 2: LLM#1 classifyRelevance and the relevance eval

**Files:**
- Create: `agent/json.js` (copy `extractJsonObject` from `agent/audit.js` verbatim), `agent/relevance.js`
- Create: `evals/relevance/cases.jsonl`, `evals/run.mjs`, `evals/reports/.gitkeep`
- Test: `test/agent-relevance.test.js`
- Modify: `package.json` (script `"eval": "node --env-file=.env evals/run.mjs"`), `AGENTS.md` and `docs/guides/testing.md` (eval command), `.gitignore` (`evals/reports/*.json`)

**Interfaces:**
- Consumes: `modelClient` from `memory/model.js` (`complete(messages, {maxTokens, temperature}) → Promise<string>`).
- Produces:
  - `relevanceMessages({ intent: {title, steps?: string[]}, url, title, examples?: {host, title, label}[] }) → messages`
  - `parseRelevance(text) → { label: "related"|"unrelated"|"neutral", confidence: number 0..1, reason: string ≤200 }` — throws `Error` naming the bad field on invalid JSON/label/confidence
  - `classifyRelevance(complete, input, { now = Date.now } = {}) → Promise<{ label, confidence, reason, source: "llm"|"fallback", latencyMs, retried: boolean, error?: string }>` — `complete(messages, {maxTokens: 4000, temperature: 0})`; on parse failure, one retry with an extra user message `Your last reply was invalid: <error>. Reply with the JSON object only.`; on second failure or a thrown `complete`, `{label: "neutral", confidence: 0, source: "fallback", error}`.

Prompt content (system message, English): the companion judges whether *one page* serves the stated goal; `related` = serves the goal or its steps (docs, tools, research, communication about it); `unrelated` = entertainment, social, shopping or another topic; `neutral` = can't tell from URL and title (generic titles, inboxes, dashboards). Confidence reflects how clear the title is. Reply with one JSON object `{"label","confidence","reason"}`. Use the user examples (`examples`) as the person's own past labels.

- [ ] **Step 1: Write the failing tests** with a fake `complete`: valid reply → parsed result, `source:"llm"`, `retried:false`; reply wrapped in ```` ```json ```` and `<think>` → parsed; first reply `"nope"`, second valid → `retried:true` and the second call's last message contains `Your last reply was invalid`; two invalid replies → `{label:"neutral", source:"fallback"}`; `complete` throws `HTTP 429` → fallback with `error` matching `/429/`; `parseRelevance('{"label":"maybe","confidence":1}')` throws `/label/`; confidence `1.7` throws `/confidence/`; `relevanceMessages` user message contains the goal title, host and page title, and no full URL query string.
- [ ] **Step 2:** `node --test test/agent-relevance.test.js` → FAIL.
- [ ] **Step 3:** Implement `agent/json.js` and `agent/relevance.js`.
- [ ] **Step 4:** Test → PASS; `npm test` → all pass.
- [ ] **Step 5: Write the eval.** `cases.jsonl`: one JSON object per line `{id, intent: {title, steps?}, url, title, expect}`. Draft ≥30 cases: every page in the scenarios of `test/live/audit.mjs` (label each page on its own), plus edge cases: a YouTube tutorial for the goal (related), a YouTube vlog (unrelated), Gmail inbox (neutral), Google search (neutral), a Turkish goal with a Turkish page, Spotify (unrelated), the goal's own Google Doc (related). `evals/run.mjs`: reads `MODEL_API_KEY`, `MODEL_PROVIDER` (default `meta-contributor`); runs each case `REPS` times (env, default 3) with `classifyRelevance`; reports per case majority label; computes **accuracy** = share of cases whose majority label equals `expect`, **falseUnrelated** = share of `expect:"related"` cases whose majority is `unrelated` with confidence ≥ 0.6, **p50/p95 latency**, fallback count; prints a table of misses; writes `evals/reports/<ISO date>.json`; if `evals/baseline.json` exists, prints the deltas and fails when accuracy drops > 0.05; exits 1 if accuracy < 0.85 or falseUnrelated > 0.05.
- [ ] **Step 6: Human gate.** Ask İrem to review the `expect` labels in `cases.jsonl` (they are her judgment, not the model's) and to create `.env` with `MODEL_API_KEY`.
- [ ] **Step 7:** `npm run eval` → prints the table; record the run. If Contributor returns HTTP 403/404, rerun with `MODEL_PROVIDER=meta` and note it. Copy the report to `evals/baseline.json` only when İrem accepts it.
- [ ] **Step 8:** Update the eval row in `AGENTS.md` Commands and `docs/guides/testing.md` Tiers with `npm run eval`; move "Relevance accuracy" out of "Not checked yet". Commit `Add the relevance classifier and its eval`.

---

### Task 3: Engine — budget, state machine, trigger candidates

**Files:**
- Create: `attention/engine.js`
- Test: `test/attention-engine.test.js`

**Interfaces:**
- Consumes: `DEFAULTS`, `isUnsure` (Task 1); `decide`, `initialPolicy` (Task 4 — write Task 3 tests against `step` with the policy stubbed as "every candidate passes at level 1" by passing `cfg.decide`; Task 4 replaces the default).
- Produces:
  - `initialState() → EngineState` — JSON-serialisable: `{ mode: "focus", intent: null, state: "no_intent", budgetSec: 0, lastTs: null, current: null, lastRelevant: null, timeline: [], awaySince: null, breakUntil: null, sessionDay: null, policy: { episode: null, cooldownUntil: {} }, tolerance: {} }` (the `policy` literal is the same shape Task 4's `initialPolicy()` returns)
  - Inputs (`EngineInput`):
    - `{type:"context", ts, tabId, url, host, title, key, label?, confidence?, source?, audible, browserFocused, idleState: "active"|"idle"|"locked"}`
    - `{type:"relevance", ts, key, label, confidence, source}`
    - `{type:"session", ts, kind: "intent_set"|"intent_done"|"mode", payload}` — `intent_set` payload `{id, title, topic}`; `mode` payload `{mode: "focus"|"gentle"|"dnd"|"off"}`
    - `{type:"response", ts, triggerId, choice: "back"|"related"|"break"|"dismiss"}`
    - `{type:"tick", ts}`
  - `step(state, input, cfg = DEFAULTS) → { state, out: Output[] }` — never mutates its arguments
  - Outputs:
    - `{type:"state", ts, from, to, budgetSec, switches2m}`
    - `{type:"trigger", ts, id: `${kind}-${ts}`, kind: "session_start"|"drift"|"fragmentation"|"return"|"break_over", level: 0..3, evidence: {host, title, dwellSec, budgetSec, switches2m, lastRelevant}, suppressedBy?: "dnd"|"cooldown"}`
    - `{type:"need_relevance", ts, key, url, host, title}` (not logged)
  - `nextWakeAt(state, cfg) → number | null` — the earliest ts at which a tick can change the outcome (budget crossing tolerance, next escalation, break end), or `null`
  - `effectiveTolerance(state, cfg) → seconds` = `(state.tolerance[current.host] ?? cfg.toleranceSec) × (mode === "gentle" ? cfg.gentleMultiplier : 1)`

**Rules the tests pin (values from the spec):**
- Time advances by `dt = ts − lastTs`, capped: if `dt > cfg.maxGapSec`, the gap counts as `away` (no budget change).
- While `current` is `unrelated` (incl. unsure): `budgetSec += dt`. `related`: `budgetSec = max(0, budgetSec − dt × cfg.decayRate)`. `neutral` or pending: unchanged. `away`/`break`/`paused`: unchanged.
- A context without `label` is neutral and emits `need_relevance` (once per key until answered). A `relevance` input updates `current` only if `input.key === current.key`.
- States: `no_intent` until `intent_set`; then `focused` (related/neutral), `detour` (unrelated, budget < tolerance), `drifting` (budget ≥ tolerance), `away` (`idleState !== "active"` and not audible, or `browserFocused === false`), `break` (until `breakUntil`), `paused` (mode `dnd` or `off` — `dnd` still evaluates and emits suppressed triggers, `off` emits nothing).
- `lastRelevant` = `{tabId, url, title, ts}` of the latest `related` context.
- Timeline keeps `{ts, key, label}` switches within `fragWindowSec`; fragmentation candidate when switches ≥ `fragMinSwitches` and unrelated time share in the window ≥ `fragUnrelatedShare`.
- Candidates: `drift` on entering `drifting` and again every `escalateAfterSec` while still drifting; `fragmentation`; `return` on leaving `away` after ≥ `returnAwaySec` with an intent; `break_over` at `breakUntil`. (`session_start` is added in Task 5.)
- Responses: `back` and `related` end the episode (`budgetSec = 0`); `related` also sets `current.label = "related"`; `break` sets `breakUntil = ts + cfg.breakMin × 60000`; `dismiss` is passed to the policy (cooldown).

- [ ] **Step 1: Write the failing tests** (`t0` fixed, inputs built with a small helper, no Chrome):
  - `unrelated past tolerance → drift`: intent set, related at t0, unrelated at t0+10s, ticks every 1s → first `drift` trigger at t0+55s (±1s), state `drifting`.
  - `related never warns`: 10 min of related contexts and ticks → no trigger, budget 0.
  - `neutral leaves the budget unchanged`: budget 20 → 5 min neutral → still 20.
  - `unsure pages accumulate budget` (policy caps the level, Task 4).
  - `decay`: 30s unrelated then 10s related → budget 10.
  - `hopping catches fragmentation`: 7 switches in 90s, 60% unrelated time → one `fragmentation` candidate.
  - `stale relevance is ignored for the page in front`: need_relevance for key A, user moves to B, relevance for A arrives → `current.key` B unchanged, no state change.
  - `a long gap is away, not drift`: unrelated at t0, next tick at t0+30min → no drift trigger, budget unchanged.
  - `JSON round trip mid-drift`: run to t0+50s, `JSON.parse(JSON.stringify(state))`, continue → exactly one `drift` trigger overall, at the same ts as without the round trip.
  - `audible tab while idle is not away`; `browser unfocused is away`.
  - `break then break_over`: `break` response → state `break`, no drift for 5 min, `break_over` candidate at +5 min.
  - `no intent → no drift`; `step` does not mutate its input state (deep-equal before/after).
  - `nextWakeAt`: in detour with budget 10, tolerance 45 → `lastTs + 35000`.
- [ ] **Step 2:** `node --test test/attention-engine.test.js` → FAIL.
- [ ] **Step 3:** Implement `attention/engine.js`.
- [ ] **Step 4:** Test → PASS; `npm test` → all pass.
- [ ] **Step 5:** Commit `Add the attention engine: budget, states and triggers`.

---

### Task 4: Policy — levels, cooldown, modes

**Files:**
- Create: `attention/policy.js`
- Modify: `attention/engine.js` (default `cfg.decide = decide`)
- Test: `test/attention-policy.test.js`

**Interfaces:**
- Produces:
  - `initialPolicy() → { episode: null | {kind, level, startedTs, triggerId}, cooldownUntil: {[kind]: ts} }`
  - `decide(policy, candidate: {kind, ts, evidence}, ctx: {mode, unsure: boolean}, cfg) → { policy, trigger: Output | null }`

**Rules the tests pin:**
- Levels: first candidate of an episode → L1; each escalation candidate of the same episode → level + 1. Max level: focus 3, gentle 2, unsure page 1. A candidate that would not raise the level returns `trigger: null`.
- `session_start`, `return`, `break_over` are L2 immediately (no escalation).
- `dnd` → trigger with `level 0, suppressedBy: "dnd"` (logged, never shown). `off` → `null`.
- After a `dismiss` response, or after any L2+ trigger of kind K, no new L2+ trigger of kind K until `cooldownSec` has passed → the candidate is returned as `level 1, suppressedBy: "cooldown"`.
- Episode ends on `back`, `related`, `break`, or when the engine leaves `drifting`.

- [ ] **Step 1: Write the failing tests:** drift escalates L1 → L2 → L3 at +0/+30/+60s in focus; stops at L2 in gentle; stays L1 on an unsure page; dnd gives level 0 `suppressedBy:"dnd"`; `dismiss` at L2 then still drifting → next escalations inside 120s are `suppressedBy:"cooldown"`, after 120s L3 is allowed; `return` → L2; a new episode after `back` starts again at L1.
- [ ] **Step 2:** `node --test test/attention-policy.test.js` → FAIL.
- [ ] **Step 3:** Implement `attention/policy.js`; wire it as the engine default.
- [ ] **Step 4:** `npm test` → all pass (engine tests still green with the real policy; adjust only tests that asserted the stub's levels, and say so in the commit body).
- [ ] **Step 5:** Commit `Add the intervention policy`.

---

### Task 5: Shadow intents and day expiry

**Files:**
- Create: `attention/intents.js`
- Test: `test/attention-intents.test.js`, `test/attention-engine.test.js`

**Interfaces:**
- Produces:
  - `dayKey(ts, cfg, tzOffsetMin = new Date(ts).getTimezoneOffset()) → "YYYY-MM-DD"` — the local date of `ts − dayBoundaryHour`
  - `makeIntent({title, steps = [], estMin = null, topic, memoryEntryId = null, fromLoopId = null}, ts, id = crypto.randomUUID()) → Intent` = `{id, title, steps, estMin, topic, createdAt: ts, doneAt: null, expiredAt: null, memoryEntryId, fromLoopId}`; `topic` defaults to a slug of the title (lowercase words joined by `-`, max 40 chars)
  - `isExpired(intent, nowTs, lastActiveTs, cfg, tzOffsetMin?) → boolean` — true when `dayKey(now) !== dayKey(createdAt)`, or `now − lastActiveTs ≥ expireAwayHours`
- Modify `attention/engine.js`: emit a `session_start` candidate on the first active context whose `dayKey` differs from `state.sessionDay` while `intent` is null, then set `sessionDay`.

- [ ] **Step 1: Write the failing tests** with `tzOffsetMin = -180` (Istanbul): created 23:00, checked 03:30 next day → not expired; checked 04:01 → expired; 7h idle at noon → expired; `makeIntent({title: "Edit the demo video"})` topic `"edit-the-demo-video"`. In `test/attention-engine.test.js`: `session_start` fires once on the first active context of a day with no intent (L2), not again the same day, and not while an intent is set.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `Add shadow intents with day expiry`.

---

### Task 6: Store, serial queue, and the background rewrite

**Files:**
- Create: `attention/store.js`, `attention/queue.js`
- Test: `test/attention-queue.test.js`
- Rewrite: `extension/background.js`
- Modify: `extension/options/options.html`, `extension/options/options.js` (Export / Import event log)

**Interfaces:**
- Consumes: Tasks 1–5; `Memory` (`setIntent`, `completeIntent`, `add`, `recordActivity`, `maintain`, `syncBrain`, `distill`); `classifyRelevance`; `modelClient`, `loadModelSettings`.
- Produces:
  - `createSerialQueue() → (fn: () => Promise<T>) => Promise<T>` — runs jobs one at a time in call order; a rejected job does not block the next
  - `openStore(name = "attention") → Store` with `appendEvent(record)`, `eventsSince(ts)`, `exportLog() → {version: 1, exportedAt, events}`, `importLog(log)` (replaces events), `getLabel(key)`, `putLabel({key, label, topic, host, title?, ts})`, `getCached(key)`, `putCached({key, label, confidence, source, ts})`, `putIntent(intent)`, `activeIntent()`, `pruneBefore(ts)`. IndexedDB version 1, stores `events` (autoIncrement, indexes `ts`, `type`), `labels`, `relevanceCache` (keyPath `key`), `intents` (keyPath `id`).
  - Background messages (popup/options → background): `set-intent {title, next}`, `complete-intent`, `set-mode {mode}`, `respond {triggerId, choice}`, `get-status → {engine, lastTrigger, intent}`, `export-log`, `import-log {log}`.
  - `chrome.storage.session.engine` (EngineState), `chrome.storage.local.lastTrigger`, `chrome.storage.local.attentionConfig` (overrides for `withOverrides`; tests set `{toleranceSec: 3, escalateAfterSec: 2}`).

**Background behavior:**
- Keep from the old worker: tab capture listeners (`onActivated`, `onUpdated` with url/title/complete, `windows.onFocusChanged`, `idle.onStateChanged` with the audible exception), own-pages-as-idle, `memory.recordActivity`, alarms `distill` (60) and `memory-maintain` (15). Remove: the `audit` alarm, `audit()`, notifications, `lastAudit`.
- Mode `off`: the listeners still record `memory.recordActivity`, but no engine input is fed except `session` inputs (the sensor is off for attention).
- Every Chrome event becomes one engine input and goes through the serial queue: load `engine` from `chrome.storage.session` (or `initialState()`), compute `key` with `relevanceKey`, resolve the label in order `builtinLabel` → `labelKeys` in `labels` → `relevanceCache` → none; `step`; save state; append the input (except `tick`) and every `state`/`trigger` output to the log with their `type`; handle outputs.
- `need_relevance` → outside the queue, `classifyRelevance` with the active intent and up to 5 recent labels as examples; log `{type:"llm", node:"classifyRelevance", model, latencyMs, ok, error?}` and `{type:"relevance", ...}`; cache it; feed a `relevance` input through the queue.
- Wake-ups: after each step, `nextWakeAt` → if within 30 s, `setTimeout` a `tick`; otherwise `chrome.alarms.create("attention-wake", {when})`. A 30 s `attention-heartbeat` alarm also feeds `tick`.
- `trigger` with level ≥ 1 and no `suppressedBy` → `chrome.storage.local.lastTrigger`, badge `"!"` (red `#dc2626`) for L2+, `"·"` (grey `#64748b`) for L1; badge cleared on state `focused`.
- `respond`: log `{type:"response", triggerId, choice, latencyMs}` and feed it to the engine; `back` → focus `lastRelevant.tabId` (`chrome.tabs.update` + `chrome.windows.update` focused) or, if that tab no longer exists, `chrome.tabs.create({url})`; `related` → `putLabel` on the first of `labelKeys(...)` and `memory.add({kind: "preference", topic, title: "<host> counts as work for <topic>", context: "Marked by the user from a nudge.", result: "related"})`.
- `set-intent` → `makeIntent`, `memory.setIntent` (store returned id as `memoryEntryId`), `putIntent`, feed `session intent_set`. On startup and on the first input of a day, an active intent that `isExpired` gets `expiredAt` and the engine gets `intent_done`.
- `maintain` alarm also calls `store.pruneBefore(now − retentionDays)`.
- Options page: **Export event log** downloads `attention-log-<date>.json`; **Import event log** reads a file and calls `import-log`.

- [ ] **Step 1: Write the failing queue tests:** three jobs with different delays finish in call order; a rejecting job's error reaches its caller and the next job still runs.
- [ ] **Step 2:** FAIL. **Step 3:** Implement `attention/queue.js`; PASS.
- [ ] **Step 4:** Implement `attention/store.js` and rewrite `extension/background.js` and the options page as above.
- [ ] **Step 5:** Load unpacked, browse for two minutes, export the log → it contains `context`, `relevance`, `llm`, `state` records in ts order. (Store and background are covered by the e2e in Task 7.)
- [ ] **Step 6:** `npm test` → PASS. Commit `Rewrite the background worker around the attention engine`.

---

### Task 7: Popup check-in and the e2e rewrite

**Files:**
- Modify: `extension/popup/popup.html`, `extension/popup/popup.js` (keep the intent card and the 30-minute activity card; replace the "Check-in" card)
- Rewrite: `test/browser/extension.mjs`

**Interfaces:**
- Consumes: background messages from Task 6.
- Produces: popup elements `#state-pill` (text = engine state, class = state), `#trigger` (hidden unless `lastTrigger` is L1+ and newer than the last response), `#trigger-text` (template: drift → `"You've been on <host> for <dwell> — back to <intent title>?"`; fragmentation → `"Lots of tab hopping — want to pick one thing?"`; return → `"Welcome back. You were on <lastRelevant.title>."`; break_over → `"Break's over — ready for <intent title>?"`; session_start → `"What are we working on today?"`), buttons `#take-me-back`, `#for-my-task`, `#give-me-5`, and a mode `<select id="mode">` (Focus / Gentle / Do not disturb / Off). The intent form posts `set-intent`; *Done* posts `complete-intent`.

- [ ] **Step 1: Rewrite the e2e first** (same harness: fake server with `/repo` on `127.0.0.1` and `/video` on `localhost`; fake model returns `{"label":"unrelated","confidence":0.9,"reason":"…"}` when the user message contains `Top 10 F1 crashes`, else `related 0.9`). Set `attentionConfig {toleranceSec: 3, escalateAfterSec: 2}` and model settings; set the intent from the popup; open `/repo`, wait 2 s; open `/video`, wait until `lastTrigger.kind === "drift"` (timeout 15 s); assert the badge is `"·"` or `"!"`, the popup shows `#trigger`, `#trigger-text` mentions `localhost`; click `#take-me-back` → the active tab URL is `/repo`. Then: go to `/video` again, close the `/repo` tab, drift, click `#take-me-back` → a new tab with the `/repo` URL is active (Review Focus 5). Then: `#for-my-task` on `/video` → revisiting it for 6 s creates no new trigger. Export the log from the options page → contains records of type `context`, `relevance`, `llm`, `state`, `trigger`, `response`; no record has a URL starting with `chrome-extension:`. No `pageerror` events.
- [ ] **Step 2:** `npm run test:e2e` → FAIL (old popup).
- [ ] **Step 3:** Implement the popup.
- [ ] **Step 4:** `npm run test:browser && npm run test:e2e` → both `ok`; `npm test` → PASS.
- [ ] **Step 5:** Update `README.md` "Try it" and "Status" for the new flow and the folder table (`agent/`, `attention/` → İrem); add the privacy line (URL + title only; content script reads nothing). Commit `Show engine triggers in the popup and rewrite the e2e`.

---

### Task 8: Replay and the criteria tests

**Files:**
- Create: `attention/replay.js`, `test/attention-replay.test.js`, `test/fixtures/<name>.log.json` + `test/fixtures/<name>.labels.json`
- Modify: `docs/guides/testing.md` (move the two criteria out of "Not checked yet")

**Interfaces:**
- Consumes: `initialState`, `step`, `withOverrides`.
- Produces: `replay(log: {events}, { cfg = DEFAULTS, tickSec = 1 } = {}) → { triggers: Output[], states: Output[] }` — feeds the logged inputs (`context`, `relevance`, `session`, `response`) in ts order, inserts `tick`s every `tickSec` between them, and ignores logged outputs (they are recomputed). Labels file: `{ onTask: [{start, end}], drifts: [{start, end}] }` (ms timestamps).

- [ ] **Step 1: Human gate — record the fixture.** İrem works with the extension for 30–60 minutes on a real task, including at least two real drifts and one stretch of research, exports the log, and marks `onTask` and `drifts` windows in the labels file. Remove anything private from titles before committing (replace with neutral text, keep the host).
- [ ] **Step 2: Write the tests** over every fixture pair: **no unfair warnings** — L2+ triggers (no `suppressedBy`) whose ts falls in `onTask` windows ≤ 1 per on-task hour; **drift is caught** — every drift window longer than `toleranceSec` has a `drift` trigger with `start ≤ ts ≤ start + toleranceSec×1000 + 5000`; **replay is deterministic** — two runs give deep-equal triggers.
- [ ] **Step 3:** `node --test test/attention-replay.test.js` → FAIL until `replay` exists; implement `attention/replay.js`.
- [ ] **Step 4:** Run. If a criterion fails, tune `DEFAULTS` (never the thresholds in the test), record the before/after numbers in the commit body, and re-run `npm test` and `npm run test:e2e`.
- [ ] **Step 5:** Commit `Add replay and the criteria tests`.

---

## Out of this plan (Plan 2)

Overlay avatar and bubble (L1 animation, L2/L3 text), side panel with chat and "You missed one", LLM#2–#5 and the LangGraph gate, personal tolerance learning, `checkin` trigger, metrics view, demo brain and demo log, live smoke run.
