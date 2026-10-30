// Model client for OpenAI-compatible chat completions.
// "meta-contributor" (the default) and "meta" are Meta's Model API: same model;
// Contributor costs far less, Meta may train on its inputs and outputs, and it is
// only offered in some countries. Muse Spark Open and Muse Glimmer are not
// served on the Model API: the Spark Open entries are the hosts Meta's deploy
// docs list; Glimmer is on OpenRouter or runs locally through Ollama.

export const DEFAULT_PROVIDER = "meta-contributor";

export const PROVIDERS = {
  "meta-contributor": { baseUrl: "https://api.meta.ai/v1", model: "muse-spark-1.3-contributor" },
  meta: { baseUrl: "https://api.meta.ai/v1", model: "muse-spark-1.3" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "meta/muse-glimmer-30b" },
  ollama: { baseUrl: "http://localhost:11434/v1", model: "muse-glimmer" },
  together: { baseUrl: "https://api.together.xyz/v1", model: "meta-models/muse-spark-open" },
  fireworks: { baseUrl: "https://api.fireworks.ai/inference/v1", model: "accounts/fireworks/models/muse-spark-open" },
  baseten: { baseUrl: "https://inference.baseten.co/v1", model: "meta-models/muse-spark-open" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "meta-models/muse-spark-open" },
  nebius: { baseUrl: "https://api.tokenfactory.us-north1.nebius.com/v1", model: "meta-models/muse-spark-open" },
};

export function resolveConfig({ provider = DEFAULT_PROVIDER, baseUrl, model, apiKey } = {}) {
  const p = PROVIDERS[provider] ?? {};
  const config = { baseUrl: (baseUrl ?? p.baseUrl ?? "").replace(/\/$/, ""), model: model ?? p.model, apiKey };
  if (!config.baseUrl || !config.model) throw new Error(`unknown provider "${provider}" and no baseUrl/model given`);
  // A local Ollama server needs no key.
  if (!config.apiKey && provider !== "ollama") throw new Error("no API key set");
  return config;
}

// Returns complete(messages, opts) -> reply text.
export function modelClient(settings, fetchImpl = globalThis.fetch) {
  const { baseUrl, model, apiKey } = resolveConfig(settings);
  return async function complete(messages, { maxTokens = 4000, temperature = 0.2 } = {}) {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey && { Authorization: `Bearer ${apiKey}` }) },
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
