// Live check against a real model provider: one ping, then one distill on
// synthetic activity. Reads the key from the environment, never from a file:
//   MODEL_API_KEY   required
//   MODEL_PROVIDER  meta | together | fireworks | baseten | groq | nebius (default: together)
//   MODEL_BASE_URL, MODEL_ID  optional overrides
import { modelClient } from "../../memory/model.js";
import { distillMessages, parseEntries } from "../../memory/distill.js";

const complete = modelClient({
  provider: process.env.MODEL_PROVIDER ?? "together",
  baseUrl: process.env.MODEL_BASE_URL,
  model: process.env.MODEL_ID,
  apiKey: process.env.MODEL_API_KEY,
});
const date = new Date().toISOString().slice(0, 10);

console.log("ping:", JSON.stringify(await complete([{ role: "user", content: "Reply with exactly: pong" }], { maxTokens: 64 })));

const messages = distillMessages({
  activityText: [
    "Last 60 min (55 min active):",
    '- github.com: 35 min ("Fix checkout bug · shop-repo", "cart.js · shop-repo")',
    '- youtube.com: 20 min ("Lofi beats to code to")',
  ].join("\n"),
  contextPrompt: "Stated intent (today): Fix checkout bug; next: Write the failing test",
  topics: ["shop"],
  date,
});
const reply = await complete(messages, { maxTokens: 2048 });
const { entries, rejected } = parseEntries(reply, { date });
console.log(JSON.stringify({ entries, rejected }, null, 2));
if (!entries.length && !rejected.length) console.log("(model returned [] — nothing worth keeping)");
