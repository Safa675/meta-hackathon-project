// Is the model good enough to audit? Runs synthetic scenarios with an expected
// verdict through the real model and scores them. Same environment as model.mjs:
//   MODEL_API_KEY, MODEL_PROVIDER (default meta-contributor), MODEL_BASE_URL, MODEL_ID
import { modelClient } from "../../memory/model.js";
import { toSpans, summarize, renderSummary } from "../../memory/activity.js";
import { buildIndex, entryDoc } from "../../memory/recall.js";
import { contextPack, renderPack } from "../../memory/context.js";
import { auditMessages, parseVerdict } from "../../agent/audit.js";

const M = 60 * 1000;
const now = Date.now();
const date = new Date(now).toISOString().slice(0, 10);

// [minutes ago, url, title]; the last item is the current tab.
const scenarios = [
  {
    name: "on track: coding plus a related search",
    intent: "Fix the checkout bug in the shop repo",
    next: "Write the failing test",
    expect: ["on_track"],
    events: [
      [30, "https://github.com/acme/shop/blob/main/cart.js", "cart.js · acme/shop"],
      [12, "https://stackoverflow.com/questions/1", "JavaScript splice removes the wrong item"],
      [6, "https://github.com/acme/shop/pull/42", "Fix cart item removal · Pull Request #42"],
    ],
  },
  {
    name: "drifting: long video and reddit",
    intent: "Fix the checkout bug in the shop repo",
    next: "Write the failing test",
    expect: ["drifting"],
    events: [
      [45, "https://www.youtube.com/watch?v=a", "Top 10 F1 crashes of all time"],
      [20, "https://www.reddit.com/r/formula1", "r/formula1"],
      [8, "https://www.youtube.com/watch?v=b", "Every Senna onboard lap"],
    ],
  },
  {
    name: "break: short video after long focus",
    intent: "Fix the checkout bug in the shop repo",
    next: "Write the failing test",
    minutes: 60,
    expect: ["break", "on_track"],
    events: [
      [58, "https://github.com/acme/shop/blob/main/cart.js", "cart.js · acme/shop"],
      [40, "https://github.com/acme/shop/pull/42", "Fix cart item removal · Pull Request #42"],
      [22, "https://github.com/acme/shop/blob/main/cart.test.js", "cart.test.js · acme/shop"],
      [6, "https://www.youtube.com/watch?v=c", "Lofi beats to code to"],
    ],
  },
  {
    name: "research that looks like browsing",
    intent: "Write the market sizing slide for the investor deck",
    next: "Fill in SAM and SOM numbers",
    expect: ["on_track"],
    events: [
      [28, "https://docs.google.com/presentation/d/x", "Investor deck - Google Slides"],
      [14, "https://www.investopedia.com/tam-sam-som", "TAM vs SAM vs SOM: What's the Difference?"],
      [5, "https://www.statista.com/statistics/1", "Private clinics in Turkey by number 2025"],
    ],
  },
  {
    name: "drifting disguised as tech reading",
    intent: "Fix the checkout bug in the shop repo",
    next: "Write the failing test",
    expect: ["drifting"],
    events: [
      [35, "https://news.ycombinator.com/", "Hacker News"],
      [22, "https://example-blog.dev/rust-gc", "Why I rewrote my game engine's GC in Rust"],
      [9, "https://news.ycombinator.com/item?id=1", "Show HN: A keyboard made of wood"],
    ],
  },
  {
    name: "Turkish: house listings instead of the rules engine",
    intent: "SUT kural motorundaki kırık testleri düzelt",
    next: "Diyaliz kuralının testini yeşile çek",
    expect: ["drifting"],
    events: [
      [30, "https://github.com/acme/bilun/actions", "Testler başarısız · acme/bilun"],
      [22, "https://www.sahibinden.com/satilik-daire", "Satılık Daire İlanları - sahibinden.com"],
      [10, "https://www.sahibinden.com/ilan/1", "Karşıyaka 3+1 satılık daire"],
    ],
  },
  {
    name: "no stated intent fits; mixed tabs",
    intent: "Prepare the 3-minute demo script",
    next: "Write the opening line",
    expect: ["drifting", "unclear"],
    events: [
      [25, "https://x.com/home", "Home / X"],
      [10, "https://www.instagram.com/", "Instagram"],
    ],
  },
];

const complete = modelClient({
  provider: process.env.MODEL_PROVIDER ?? "meta-contributor",
  baseUrl: process.env.MODEL_BASE_URL,
  model: process.env.MODEL_ID,
  apiKey: process.env.MODEL_API_KEY,
});

let pass = 0;
for (const s of scenarios) {
  const minutes = s.minutes ?? 60;
  const events = s.events.map(([ago, url, title]) => ({ ts: now - ago * M, url, title, kind: "focus" }));
  const spans = toSpans(events, now);
  const activityText = renderSummary(summarize(spans), minutes * M);
  const intent = { id: "i", kind: "todo", source: "extension", topic: "focus", title: s.intent, date, context: "Stated by the user.", result: s.intent, evidence: "none", next: s.next, ts: now - 70 * M };
  const index = buildIndex([entryDoc(intent)]);
  const current = spans.at(-1);
  const contextPrompt = renderPack(contextPack(index, [intent], { title: current.title, url: current.url }));

  const t = performance.now();
  let v;
  try {
    v = parseVerdict(await complete(auditMessages({ activityText, contextPrompt, now: new Date(now) }), { maxTokens: 400 }));
  } catch (err) {
    v = { verdict: "error", reason: err.message, nudge: "", confidence: 0 };
  }
  const ok = s.expect.includes(v.verdict);
  pass += ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${s.name}  (${((performance.now() - t) / 1000).toFixed(1)} s)`);
  console.log(`      expected ${s.expect.join("|")}, got ${v.verdict} (${v.confidence})`);
  console.log(`      reason: ${v.reason}`);
  if (v.nudge) console.log(`      nudge:  ${v.nudge}`);
}
console.log(`\n${pass}/${scenarios.length} scenarios as expected`);
