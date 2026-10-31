// Engine constants. Values start from the design (docs/superpowers/specs/
// 2026-10-31-attention-agent-design.md §6.1) and are tuned by replay.

export const DEFAULTS = Object.freeze({
  toleranceSec: 45, // drift budget that triggers a drift
  decayRate: 2, // related time drains the budget this many times faster than unrelated fills it
  unsureConfidence: 0.6, // an "unrelated" below this is unsure: never past L1
  fragWindowSec: 120,
  fragMinSwitches: 6,
  fragUnrelatedShare: 0.5,
  escalateAfterSec: 30, // still drifting this long after a trigger → next level
  cooldownSec: 120,
  gentleMultiplier: 2,
  returnAwaySec: 300,
  maxGapSec: 120, // a longer silence between inputs is time away (sleep, crash)
  breakMin: 5,
  relevanceRetrySec: 30, // ask the model again if an answer never came (worker died mid-call)
  dayBoundaryHour: 4,
  expireAwayHours: 6,
  retentionDays: 7,
  tzOffsetMin: null, // null = the machine's time zone; tests pin it
});

export function withOverrides(overrides = {}) {
  const cfg = { ...DEFAULTS };
  for (const [k, v] of Object.entries(overrides ?? {})) if (k in DEFAULTS) cfg[k] = v;
  return cfg;
}
