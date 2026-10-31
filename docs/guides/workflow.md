# Workflow

How a change goes from idea to merged PR with a coding agent. Adapted from
Anthropic's [AI-Native SDLC Playbook](https://academy.claude.com/courses/ai-native-sdlc-playbook/introduction),
sized for one engineer and one repository.

**The rule:** every step ends with something written down, and the next step
starts by reading it. I decide at each gate. The agent does the work between
gates.

## The steps

| Step | I do | The agent does | Leaves behind |
|---|---|---|---|
| 1. Intent | Describe the problem in my own words | Reads `docs/INTENT.md`, asks the questions an analyst would ask | `## Intent` in the plan, linked to `docs/INTENT.md` |
| 2. Design | Pick the direction, settle the open questions | Maps the architecture and the UI, flags concerns | `## Design`, board links, `docs/DECISIONS.md` entries |
| 3. Plan | Question the plan until I would hand it to someone else | Reads the code in plan mode, writes the plan and its test plan | `## Plan`, `## Test plan`, `Done when:` |
| 4. Build | Watch for drift from the plan | Implements, runs the fast checks, fixes its own failures | The diff |
| 5. Test | Read the evidence, not the summary | Runs the tiers the test plan names, and evals for LLM behavior | Green tiers, an eval report, no unexplained test edits |
| 6. Review | Judge intent and risk, then merge | Verifies in a fresh context, reviews its own diff, opens the PR | A merged PR, the plan marked done |
| 7. Learn | Decide what becomes a rule | Writes the rule, the check, or the new test or eval case | `AGENTS.md`, `checks/`, `test/unit/`, `evals/cases/` |

Small changes skip the plan file: the intent fits in the prompt, and the work
starts at step 3 in plan mode. They still go through Test. Work that spans
sessions gets a plan file (`/plan`, see `.agents/skills/plan/SKILL.md`).

## The loops

The steps are run by five loops. Each loop has a trigger, a check the agent
runs on its own work, a point where it stops, and a file that remembers what
happened. I design the loops; the agent runs them.

| Loop | Trigger | Verify | Stop | Memory |
|---|---|---|---|---|
| Plan | A new idea, issue, or bug | Someone who never saw the conversation could build from the plan alone | I accept the plan | `docs/plans/` |
| Build | An accepted plan | Format hook, lint and typecheck from `AGENTS.md` | The plan's steps are implemented | The diff and the plan |
| Test | The build loop stops | The tiers in `docs/guides/testing.md`; evals against `evals/baseline.json` | The `Done when:` command shows the expected output, and no test was weakened without saying so | `test/unit/`, `evals/reports/` |
| Review | The test loop stops | `verifier` agent, `/code-review` with `docs/guides/review.md`, pre-commit | No open findings, and I approve | The PR thread |
| Learn | The same mistake twice, or a bug a test or review missed | The new rule, check, or case fails on the old mistake | The next PR does not repeat it | `AGENTS.md`, `checks/`, `test/unit/`, `evals/cases/` |

A loop that keeps failing its check comes back to me. It does not lower the
check.

## 1. Intent

Say what is wrong today, who it affects, what better looks like, and what is
out of scope. No formal language. The agent reads `docs/INTENT.md` first: the
change either serves a section of it, or it changes the intent, and then
`docs/INTENT.md` is updated before the plan. The agent asks about scope, users,
constraints and what success looks like until the idea is concrete. Research
comes in from GitHub issues on the repo and the design in `docs/superpowers/specs/`.

## 2. Design

The agent drafts the architecture and the UI against `docs/DESIGN.md` and
`docs/DECISIONS.md`. Architecture goes on a design doc in `docs/superpowers/specs/`, UI in the browser. The agent lists every place
where it cannot satisfy a rule, or where two rules conflict. I settle those
before any code exists. A real choice goes into `docs/DECISIONS.md` with its
reason.

## 3. Plan

Start in plan mode, where the agent can read but not edit. On a large or
unfamiliar codebase, map it first (a read-only
exploration) so the plan comes from the real structure, not from guessing.
The plan names the files that change, the order of work, the riskiest step,
and the test plan: which tier proves it, which cases are new, and which eval
criteria the change touches. Before accepting it, ask: what could this break,
which step is riskiest, and what did you decide not to do?

## 4. Build

The agent implements against the plan. The format hook runs on every edit,
and the agent keeps lint and typecheck green as it goes. For a bug, the
failing test comes first. For UI, the agent checks its work in a browser
against the design and iterates. If the work departs from the plan, the plan
is updated in the same commit.

## 5. Test

The agent follows `.agents/skills/test/SKILL.md`. It runs the tiers the test
plan names and pastes the output. A fix changes the code, never the test; if
a test really is wrong, the agent says so and I decide. For LLM or agent
behavior it runs the evals several times, compares them with the baseline,
and reads a sample of transcripts for shortcuts before trusting the score.
Live or paid tiers run only when I arm them.

## 6. Review

The `verifier` agent checks the change against the plan and
`docs/guides/testing.md` in a fresh context, so the verdict is not shaped by
the assumptions that wrote the code. The agent then runs `/code-review` on its
own diff, with the invariants in `docs/guides/review.md`. Pre-commit runs on
every commit, and the `commit` skill follows the git rules in `AGENTS.md`. The
agent opens the PR. I review it against the plan: does it do what was
intended, and is the risk acceptable? The agent that wrote the code never
approves it.

When the PR merges, the plan gets `Status: done` and the PR link. Plans stay
in git: together with the PR they record what was asked, what was decided,
and who approved it.

## 7. Learn

- The same mistake twice becomes a rule in `AGENTS.md`. If a tool can check
  it, it becomes a check in `checks/` instead.
- A bug a test missed becomes a test. An LLM failure seen in use becomes a
  case in `evals/cases/`.
- An invariant a generic reviewer missed goes into `docs/guides/review.md`.
- Durable knowledge from a plan moves to `docs/guides/`, and choices move to
  `docs/DECISIONS.md`.
- A bug found later starts a new intent, so the loop runs again.

## Plan file template

```markdown
# <Change name>

Status: open

## Intent
Serves: docs/INTENT.md § <section>
Change: <what this change does, and why now>
Out of scope: <what this change will not do>
Open questions: <what is not decided yet>

## Design
<Architecture and UI in a few lines. Links to boards.
Flagged concerns, and how each was settled.>

## Plan
Files: <path, path, path>
Order: <1. ... 2. ... 3. ...>
Risk: <the step most likely to break something, and why>

## Test plan
Tier: <unit | integration | live, from docs/guides/testing.md>
New cases: <the tests or eval cases this change adds>
Evals: <criteria touched, and the baseline compared, or `none`>

Done when: <command> shows <expected output>
```

## Not yet

These playbook steps pay off at team scale, and I add them when a project
needs them: evals for changes to `AGENTS.md`, skills and hooks themselves;
approval hooks on deploy commands; and agents watching production that write
their findings as a new intent.
