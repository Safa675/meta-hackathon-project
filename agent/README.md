# agent/

The audit: compares what the user said they would do (memory's stated intent and open loops) with what they are doing (memory's activity log), and returns a verdict.

```js
import { runAudit } from "../agent/audit.js";
import { modelClient, loadModelSettings } from "../memory/model.js";

const verdict = await runAudit(memory, modelClient(await loadModelSettings()), { minutes: 30 });
// { verdict: "on_track" | "drifting" | "break" | "unclear", confidence, reason, nudge, activity, intent }
```

With no activity or no stated intent it answers `unclear` without calling the model, and asks for an intent.

## Is the model good enough?

`npm run test:live:audit` runs seven synthetic scenarios (on track, drifting, a short break, research that looks like browsing, drifting disguised as tech reading, one in Turkish, mixed social tabs) against the real model and prints each verdict, reason, nudge and latency, plus a score.
