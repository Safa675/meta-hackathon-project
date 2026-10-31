# Intent — Focus Companion

Status: active
Last revised: 2026-10-31

## Problem

People with ADHD, and anyone whose attention drifts easily, lose their task in the
browser without noticing: mid-work they slide into Spotify, YouTube or email. A short
detour is fine; the damage is staying long without realising it, or hopping between
tabs constantly. Today they cope alone — noticing late, if at all — or with blockers
that punish and get switched off.

## Outcome

A small companion lives in the browser, knows what you meant to do today, notices when
you drift away from it, and talks you back — like a buddy sitting next to you, not a
blocker. The more you use it, the better it knows which detours are fine for you.

## Users

People with ADHD and people who get distracted quickly, working in Chrome on their own
projects and goals. They know what they want to get done; what they lack is a gentle,
timely nudge when they slip. The product assumes a Chromium browser and an API key for
Meta's Model API; it does not monitor anything outside the browser and does not give
medical or therapeutic help.

## Success criteria

| Criterion | Measure | Threshold | Checked by |
|---|---|---|---|
| No unfair warnings | L2+ interventions per hour on replayed on-task sessions | ≤ 1 per on-task hour | replay test |
| Relevance accuracy (LLM#1) | Accuracy and false-"unrelated" rate on a labelled set of ~30 cases (repo scenarios + recorded contexts) | accuracy ≥ 85%, false "unrelated" ≤ 5% | JS eval |
| Drift is caught | Share of real drifts in replay that trigger, and delay after tolerance is crossed | 100% caught, delay ≤ 5 s | replay test |
| Intervention speed | Time from trigger to the bubble on screen (template), and to LLM text | threshold: open | e2e test |
| Demo flow works | The demo script (design §8) end to end with a fake model | passes on every run | e2e test |
| It actually helps | Share of nudges followed by a return to related work within 2 min, in the user's own use | threshold: open | computed from the event log |

## Invariants

- **Never punish, never block.** An intervention never locks the page, opens a modal,
  or cannot be dismissed. Breaking this turns a buddy into a blocker people uninstall.
- **Both errors count: false warnings and missed drifts.** A buddy that nags during
  research gets uninstalled; one that misses most distractions is useless. Every nudge
  offers a one-click correction, both rates are measured, and feedback tunes them.
  Breaking this makes the companion either annoying or pointless.
- **Facts and timing are deterministic.** Sensors, dwell time, budget, state, triggers,
  cooldowns and modes are plain code; the model only judges. Breaking this makes timing
  unreliable and behaviour untestable.
- **No moralising, no diagnosis.** The voice is short, warm, concrete. Breaking this
  makes the companion feel like a judge.

## Constraints and non-goals

- **Constraint:** deadline Nov 4 2026, 9:00 PM ET; judged on the demo video and the repo.
- **Constraint:** Chromium MV3 extension, all JavaScript, no separate backend.
- **Constraint:** Meta models (`muse-spark-1.3-contributor`, else `muse-spark-1.3`).
- **Constraint:** `src/memory/` belongs to Safa and is used only through its `Memory` API.
- **Constraint:** everything in English; the companion answers in the user's language.
- **Constraint (v1, under test):** relevance is judged from URL and title only — no page
  content, no screenshots. This is a hypothesis, not a rule: if the relevance-accuracy
  and "it actually helps" criteria cannot be met from URL and title, the page cannot be
  interpreted well enough, and the signal is extended (design §10: a small page snippet
  when confidence is low), sized by the accuracy gap.
- **Non-goal:** system-wide or desktop monitoring — the MVP stays in the browser.
- **Non-goal:** Safa's MCP server and the Muse Code connection — later stages.
- **Non-goal:** Chrome Web Store publication — optional bonus only.

## Open questions

- Is URL + title enough to judge relevance? — settled by the relevance-accuracy eval and
  the share of `neutral`/low-confidence records in the event log; if not, extend the
  signal (see the v1 constraint above).
- What intervention speed is right (trigger → bubble, trigger → LLM text)? — settled by
  trying the overlay in real use and measuring latencies from the event log.
- What return rate after a nudge counts as "it helps"? — settled by a few days of the
  user's own event log.
- Does LangGraph.js run in the extension with interrupt/resume? — settled by the
  day-one trial (design §6.3).

## Why an agent

The model decides what code cannot: whether a page serves *this* goal ("React tutorial"
vs "F1 crashes" on the same site), turning a free-text plan into a structured goal,
understanding a free-text reply, wording a nudge for this person, and finding patterns
in the event log. Each is a single structured-output call; the model never calls tools.

Deterministic and never through the model: sensors, dwell time, drift budget, tab-switch
rate, state machine, triggers, cooldowns, modes, labels and cache, switching back to a
tab, button actions, logging and metrics.

## Loop contract

```text
Trigger: a trigger event from the attention engine (session_start, drift, fragmentation,
         return, break_over, checkin) that the policy lets through, or a user message
         in the side panel.
Work:    one LLM node (classifyRelevance, openSession, interpretReply, composeNudge,
         reflect) returns structured output; a script validates it and executes the
         action. No tool calls.
Verify:  the output validates against the node's JSON schema; the action is one of the
         allowed set; the result is written to the event log.
Memory:  hot layer — attention's IndexedDB (events, labels, cache, tolerance, intents)
         and chrome.storage.session for engine state; cold layer — Memory API / brain.
Stop:    one model call per node, one retry with the schema error, then the
         deterministic fallback (neutral, template message, skip). The user can always
         dismiss, switch mode, or turn it off.
```
