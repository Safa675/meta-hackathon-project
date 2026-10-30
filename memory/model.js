// Model client for OpenAI-compatible chat completions. "meta" is Meta's Model
// API (Muse Spark 1.3). Muse Spark Open is not served there; the other entries
// are the hosted providers Meta's deploy docs list for it
// (dev.meta.ai/docs/muse-spark-open/deploy).

export const PROVIDERS = {
  meta: { baseUrl: "https://api.meta.ai/v1", model: "muse-spark-1.3" },
  together: { baseUrl: "https://api.together.xyz/v1", model: "meta-models/muse-spark-open" },
  fireworks: { baseUrl: "https://api.fireworks.ai/inference/v1", model: "accounts/fireworks/models/muse-spark-open" },
  baseten: { baseUrl: "https://inference.baseten.co/v1", model: "meta-models/muse-spark-open" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "meta-models/muse-spark-open" },
  nebius: { baseUrl: "https://api.tokenfactory.us-north1.nebius.com/v1", model: "meta-models/muse-spark-open" },
};

export function resolveConfig({ provider = "together", baseUrl, model, apiKey } = {}) {
  const p = PROVIDERS[provider] ?? {};
  const config = { baseUrl: (baseUrl ?? p.baseUrl ?? "").replace(/\/$/, ""), model: model ?? p.model, apiKey };
  if (!config.baseUrl || !config.model) throw new Error(`unknown provider "${provider}" and no baseUrl/model given`);
  if (!config.apiKey) throw new Error("no API key set");
  return config;
}

// Returns complete(messages, opts) -> reply text.
export function modelClient(settings, fetchImpl = globalThis.fetch) {
  const { baseUrl, model, apiKey } = resolveConfig(settings);
  return async function complete(messages, { maxTokens = 1024, temperature = 0.2 } = {}) {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    });
    if (!res.ok) throw new Error(`model call failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error("model reply has no message content");
    return text;
  };
}

// Settings live in chrome.storage.session (memory only, gone when the browser
// closes) unless the user asks to remember them on this device.
const KEY = "modelSettings";

export async function loadModelSettings() {
  const { [KEY]: session } = await chrome.storage.session.get(KEY);
  if (session) return session;
  const { [KEY]: local } = await chrome.storage.local.get(KEY);
  return local;
}

export async function saveModelSettings(settings, { remember = false } = {}) {
  await chrome.storage.session.set({ [KEY]: settings });
  if (remember) await chrome.storage.local.set({ [KEY]: settings });
  else await chrome.storage.local.remove(KEY);
}
