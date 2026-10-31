---
name: test
description: "Read this skill before testing a change in this repository: which tier it needs, how a bug test is written, when evals run, and how results are reported"
---

# Test

The harness can already run tests. This is the repository's policy for which
tests a change needs and what counts as evidence. The values live in
`docs/guides/testing.md`; this skill holds none.
<!-- A default, not a law. Edit it to match docs/guides/testing.md. -->

## Steps

1. **Read `docs/guides/testing.md`** and the plan's `## Test plan`, if there
   is a plan. No test plan: pick the tier from the changed paths, and say
   which you picked and why.
2. **A bug: write the failing test first.** Run it and confirm it fails for
   the reason the bug describes, not for a typo. Then fix the code.
3. **New behavior: one test per behavior** the change adds, through the
   public seam. Use the fixtures the guide names; do not hand-write a
   payload when a captured one exists.
4. **Run the tiers** with the exact commands in `AGENTS.md`. Never invent a
   command. Unit always; integration when the guide says so; live never,
   unless a human armed it in this conversation.
5. **LLM or agent behavior changed:** run the eval command from `AGENTS.md`
   against the baseline. Open a sample of passing and failing transcripts in
   the report and check that the passes did the work.
6. **A test fails:** fix the code. If you believe the test is wrong, stop and
   say so; do not edit it to pass. Removing an assert, loosening an expected
   value, or adding a skip is reported as a decision for the human.
7. **Report the evidence:** each command, its exit status, the test count,
   and for evals the pass rate per criterion against the baseline and the
   report path. Name every tier you did not run.
