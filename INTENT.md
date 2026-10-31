# Intent — {{Project name}}

Status: {{draft | active}}
Last revised: {{YYYY-MM-DD}}

<!-- Why this project exists and what "working" means. Fill it with
     /agent-onboarding:setup-intent or by hand; delete sections that do not
     apply and this comment once done. Keep your own wording.

     AGENTS.md says how to work in the repo and is loaded on every request.
     This file says what the product is for, and is read at the start of a
     change. A plan links the section it serves instead of restating it. -->

## Problem

{{What is wrong today, for whom, and how they cope without this.}}

## Outcome

{{What exists when this works. A sentence a user would recognize, not a feature list.}}

## Users

{{Who uses it, in what situation, and what they already know. Name what this
project assumes and does not teach or handle.}}

## Success criteria

<!-- Specific and measurable: a number, a threshold, a test set. "Fast" and
     "accurate" are not criteria; "p95 under 200ms on the fixture set" and
     "F1 at least 0.85 on 500 held-out cases" are. Every criterion here
     becomes a test or an eval. One without a check goes under "Not checked
     yet". -->

| Criterion | Measure | Threshold | Checked by |
|---|---|---|---|
| {{e.g. task fidelity}} | {{metric, on what data}} | {{target}} | {{test, eval, or `nothing yet`}} |

## Invariants

<!-- Properties that hold in every version. Breaking one means the design is
     wrong, not that the code has a bug. The most important one also goes in
     AGENTS.md ## Rules. -->

- **{{Invariant.}}** {{What breaks if it does not hold.}}

## Constraints and non-goals

- **Constraint:** {{a limit the solution must live within: budget, platform, latency, regulation}}
- **Non-goal:** {{what this deliberately does not do, and why}}

## Open questions

- {{question}} — settled by {{what evidence would decide it}}

<!-- Agent projects only: delete the two sections below if no part of the
     product runs an LLM or an agent loop. -->

## Why an agent

<!-- The simplest thing that works wins. A fixed sequence of steps is a
     workflow; plain code is plainer still. Say what needs model-driven
     decisions, and what stays deterministic. -->

{{What the model decides, and why plain code or a fixed workflow cannot.}}
{{What is deterministic and never goes through the model.}}

## Loop contract

```text
Trigger: {{what starts a run}}
Work:    {{the steps, and the tools the agent may call}}
Verify:  {{the ground truth checked at each step: tool results, state, tests}}
Memory:  {{where state and history persist}}
Stop:    {{success, max turns/tokens/time, and when it hands back to a human}}
```
