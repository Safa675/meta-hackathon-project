import test from "node:test";
import assert from "node:assert/strict";
import { modelClient, resolveConfig, PROVIDERS } from "../../../src/memory/model.js";

const fakeFetch =
  (status, body, seen = []) =>
  async (url, init) => {
    seen.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };

test("provider presets resolve to base URL and model", () => {
  assert.deepEqual(resolveConfig({ provider: "together", apiKey: "k" }), {
    baseUrl: "https://api.together.xyz/v1",
    model: "meta-models/muse-spark-open",
    apiKey: "k",
  });
  assert.equal(resolveConfig({ provider: "meta", apiKey: "k" }).model, "muse-spark-1.3");
  assert.equal(resolveConfig({ apiKey: "k" }).model, "muse-spark-1.3-contributor"); // default
  assert.equal(resolveConfig({ provider: "openrouter", apiKey: "k" }).model, "meta/muse-glimmer-30b");
  assert.equal(resolveConfig({ baseUrl: "https://x.test/v1/", model: "m", apiKey: "k" }).baseUrl, "https://x.test/v1");
  // Only the local Ollama server is plain http.
  for (const [name, p] of Object.entries(PROVIDERS)) {
    assert.ok(p.baseUrl.startsWith(name === "ollama" ? "http://localhost" : "https://"), name);
  }
});

test("missing key or unknown provider fails before any call; local Ollama needs no key", () => {
  assert.throws(() => resolveConfig({ provider: "together" }), /no API key/);
  assert.throws(() => resolveConfig({ provider: "nope", apiKey: "k" }), /unknown provider/);
  assert.equal(resolveConfig({ provider: "ollama" }).baseUrl, "http://localhost:11434/v1");
});

test("no Authorization header without a key (local Ollama)", async () => {
  const seen = [];
  await modelClient({ provider: "ollama" }, fakeFetch(200, { choices: [{ message: { content: "ok" } }] }, seen))([]);
  assert.equal(seen[0].init.headers.Authorization, undefined);
});

test("sends an OpenAI-style chat request and returns the text", async () => {
  const seen = [];
  const complete = modelClient(
    { provider: "together", apiKey: "secret" },
    fakeFetch(200, { choices: [{ message: { content: "pong" } }] }, seen),
  );
  assert.equal(await complete([{ role: "user", content: "ping" }], { maxTokens: 16 }), "pong");
  assert.equal(seen[0].url, "https://api.together.xyz/v1/chat/completions");
  assert.equal(seen[0].init.headers.Authorization, "Bearer secret");
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.model, "meta-models/muse-spark-open");
  assert.equal(body.max_tokens, 16);
});

test("HTTP errors surface with status; the key is not in the message", async () => {
  const complete = modelClient({ provider: "meta", apiKey: "secret" }, fakeFetch(401, { error: "bad key" }));
  await assert.rejects(complete([]), (err) => /HTTP 401/.test(err.message) && !err.message.includes("secret"));
});

test("a reply without message content is an error", async () => {
  const complete = modelClient({ provider: "meta", apiKey: "k" }, fakeFetch(200, { choices: [] }));
  await assert.rejects(complete([]), /no message content/);
});
