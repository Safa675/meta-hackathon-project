# Agent Instructions

<!-- Fill every {{TOKEN}}, delete what does not apply, delete this line. Keep
     under ~60 lines: this file is loaded on every request. Depth goes to
     docs/guides/<area>.md. -->

## Project

{{ONE PARAGRAPH: what this does, who it is for, and what it deliberately does NOT do.}}

**Stack:** {{language + version, framework, datastore, package manager}}
**Layout:** {{only the non-obvious directories, one line each — skip what `ls` answers}}

## Commands

| Task | Command |
|---|---|
| install | `{{...}}` |
| run locally | `{{...}}` |
| test — all | `{{...}}` |
| test — one | `{{...}}` |
| test — integration | `{{...}}` |
| lint + format | `{{...}}` |
| typecheck | `{{...}}` |

Never invent an invocation. If a command is missing here, ask for it, then add it.

## Rules

1. **{{The one rule that, if broken, means the design is wrong.}}**
   {{Why, in one sentence.}} <!-- enforced by: {{check, or `nothing yet`}} -->
2. **{{Rule.}}** {{Why.}}
3. **Small diffs.** Do not rewrite, reorganize, or reformat code the task did not require.
4. **No new files as a side effect.** No extra README, summary, or report unless asked.

## Workflow

- Read `INTENT.md` before a change that touches what the product does. If the
  change conflicts with it, say so before writing code.
- Non-trivial change: follow `docs/guides/workflow.md`. Plan first (`/plan`),
  agree on it, then implement.
- Read the guide for an area before changing it; update that guide when behavior changes.
- State assumptions when a requirement has two readings. Push back when a simpler
  design or an existing pattern solves it better.
- Style is the linter's job. Run the lint command; do not hand-police formatting.
- The worktree may hold human edits. Inspect current content before editing and
  preserve unrelated changes.
- Before reporting a change done, run the test and lint commands above and reach
  green; if a check fails or can't run, say so instead of reporting done.
- Testing follows `.agents/skills/test/SKILL.md`: which tier a change needs, and
  never weakening a test to pass.
- Before opening a PR, run `/code-review` at the level the change warrants.

## Reporting

Say only what you verified, and name the evidence — command, exit status, test count, SHA.
`written` → `tests pass` → `merged` → `deployed` are separate claims; none implies the next.
If a check was skipped or failed, say so plainly. Your own second pass is not verification.

## Git

Conventional Commits. No trailers, ever. Never push unless asked, every time.

- **Protected branches:** {{main}}. Branch first; never commit ordinary work there.
- **Commit body width:** {{72}}
- **Before committing:** {{environment step hooks need, or `none`}}

Full procedure: `.agents/skills/commit/SKILL.md`.

## Where to look

| For | Read |
|---|---|
| what the product is for and what "working" means | `INTENT.md` |
| how a change goes from idea to merged PR | `docs/guides/workflow.md` |
| what was decided or rejected, and why | `DECISIONS.md` |
| test tiers, fixtures, what may be mocked | `docs/guides/testing.md` |
| visual identity and banned UI patterns — read before any UI work | `DESIGN.md` |
| depth on {{area}} | `docs/guides/{{area}}.md` |
| plans, open and done | `docs/plans/` |

Directory-scoped rules live in `<dir>/AGENTS.md` and apply to everything under it.
