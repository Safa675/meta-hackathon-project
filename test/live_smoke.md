# Live smoke

<!-- A checklist a human arms. The agent never runs it on its own initiative.
     Delete this file if nothing in the project touches a real service. -->

Not part of the automated suite.

## Preconditions

- {{account, sandbox, or environment the test runs against}}
- {{credentials and permissions it needs, and what it must NOT have}}
- {{health checks that must pass before step 1}}

## Budget

- {{the most money, requests, or quota one run may spend}}
- {{what makes the run stop early}}

## Arm

The human types `{{ARM_WORD}}` in the conversation. Approval covers one run.

## Steps

1. {{step}} — expect {{result}}
2. {{undo what step 1 created}} — expect {{clean state}}

## Record

Results go to {{where}}, with the date, the commit SHA, and every step marked
`passed`, `failed`, or `skipped` with a reason.
