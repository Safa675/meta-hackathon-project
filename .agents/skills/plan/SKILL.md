---
name: plan
description: "Read this skill when planning a change in this repository — where the plan file goes, what it must contain, and how it is closed"
---

# Plan

The harness already has a planning mode. This is only the repository's
convention for the artifact it leaves behind.
<!-- A default, not a law. Edit it to match docs/guides/workflow.md, or delete
     it if your workflow keeps no plan files. -->

Applies to work spanning more than one session. Shorter work needs no file.

1. **Read `INTENT.md` and check `DECISIONS.md` first.** Do not propose something already rejected there.
2. **Write the plan to `docs/plans/YYYY-MM-<slug>.md`.** The date prefix is how
   staleness becomes visible without opening the file.
3. **Include a `Done when:` line** — a command and its expected output, not "when
   it feels complete". A plan without an observable completion condition lets an
   agent declare victory at the point it stopped typing.
4. **Reference, do not paste.** `src/x.py:120`, never a copied snippet; the copy
   is stale on the next commit.
5. **Use the template in `docs/guides/workflow.md`**: Intent, Design, Plan,
   Test plan, and `Done when:`. Skip a section only when it has nothing to say.
   The Intent section is about this change: link the `INTENT.md` section it
   serves; do not restate the product. If the change conflicts with
   `INTENT.md`, stop and say so.
6. **The test plan names the tier** from `docs/guides/testing.md`, the cases
   the change adds, and, for a change to LLM or agent behavior, the eval
   criteria it touches and the baseline it is compared with. `Done when:`
   names the same command.
7. **When the plan changes during the work, update the file in the same
   commit.** The merged diff should still match the plan.
8. **Close the plan when the work lands; do not delete it.** Set
   `Status: done` with the PR link at the top. The plan stays in git as the
   record of what was asked and decided. Durable knowledge still moves to
   `docs/guides/`, and choices to `DECISIONS.md`.
