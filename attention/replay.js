// Replays a recorded event log through the engine. Only inputs are fed; logged
// outputs (states, triggers) and side records (llm, feedback) are recomputed or
// ignored, so a log recorded by an older engine still measures the current one.
import { DEFAULTS } from "./config.js";
import { initialState, step } from "./engine.js";

const INPUTS = new Set(["context", "relevance", "session", "response"]);

export function replay(log, { cfg = DEFAULTS, tickSec = 1 } = {}) {
  const inputs = log.events.filter((e) => INPUTS.has(e.type)).sort((a, b) => a.ts - b.ts);
  const out = [];
  let state = initialState();
  const feed = (input) => {
    const r = step(state, input, cfg);
    state = r.state;
    out.push(...r.out);
  };
  inputs.forEach((input, i) => {
    feed(input);
    const next = inputs[i + 1]?.ts ?? input.ts;
    for (let ts = input.ts + tickSec * 1000; ts < next; ts += tickSec * 1000) feed({ type: "tick", ts });
  });
  return {
    triggers: out.filter((o) => o.type === "trigger"),
    states: out.filter((o) => o.type === "state"),
  };
}
