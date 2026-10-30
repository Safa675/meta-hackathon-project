import { Memory } from "../../memory/index.js";
import { PROVIDERS, DEFAULT_PROVIDER, modelClient, loadModelSettings, saveModelSettings } from "../../memory/model.js";

const $ = (id) => document.getElementById(id);
const memory = await Memory.open();

const NAMES = {
  "meta-contributor": "Meta · Muse Spark 1.3 Contributor",
  meta: "Meta · Muse Spark 1.3",
  openrouter: "OpenRouter · Muse Glimmer",
  ollama: "Local Ollama · Muse Glimmer",
  together: "Together · Muse Spark Open",
  fireworks: "Fireworks · Muse Spark Open",
  baseten: "Baseten · Muse Spark Open",
  groq: "Groq · Muse Spark Open",
  nebius: "Nebius · Muse Spark Open",
};

for (const id of Object.keys(PROVIDERS)) $("provider").append(new Option(NAMES[id] ?? id, id));

function showProvider() {
  const p = $("provider").value;
  $("contributor-note").hidden = p !== "meta-contributor";
  $("key-row").hidden = p === "ollama";
}

function current() {
  const provider = $("provider").value;
  const model = $("model").value.trim();
  return {
    provider,
    model: model && model !== PROVIDERS[provider].model ? model : undefined,
    apiKey: $("key").value.trim() || undefined,
  };
}

const saved = await loadModelSettings();
$("provider").value = saved?.provider ?? DEFAULT_PROVIDER;
$("model").value = saved?.model ?? PROVIDERS[$("provider").value].model;
$("key").value = saved?.apiKey ?? "";
$("remember").checked = !!(await chrome.storage.local.get("modelSettings")).modelSettings;
showProvider();

$("provider").onchange = () => {
  $("model").value = PROVIDERS[$("provider").value].model;
  showProvider();
};

$("save").onclick = async () => {
  await saveModelSettings(current(), { remember: $("remember").checked });
  $("model-status").textContent = $("remember").checked ? "Saved on this device." : "Saved until Chrome closes.";
};

$("test").onclick = async () => {
  $("model-status").textContent = "Testing…";
  const t = performance.now();
  try {
    const reply = await modelClient(current())([{ role: "user", content: "Reply with exactly: pong" }], { maxTokens: 64 });
    $("model-status").textContent = `Connected in ${((performance.now() - t) / 1000).toFixed(1)} s. Reply: ${reply.trim().slice(0, 60)}`;
  } catch (err) {
    $("model-status").textContent = `Failed: ${err.message}`;
  }
};

async function brainStatus(r = {}) {
  if (r.needsPermission || r.permission === "prompt") return "Chrome needs your permission again: press Sync now.";
  if (!r.connected) return "Not connected.";
  const s = await memory.stats();
  return (
    `${r.name ? `Folder: ${r.name}\n` : ""}${s.entries} entries, ${s.notes} notes, ${s.openLoops} open loops` +
    (r.skipped?.length ? `\n${r.skipped.length} files skipped` : "")
  );
}

$("connect").onclick = async () => {
  try {
    const dir = await showDirectoryPicker({ mode: "readwrite" });
    $("brain-status").textContent = "Reading…";
    const r = await memory.connectBrain(dir);
    $("brain-status").textContent = await brainStatus({ connected: true, name: dir.name, ...r });
  } catch (err) {
    if (err.name !== "AbortError") $("brain-status").textContent = `Failed: ${err.message}`;
  }
};

$("sync").onclick = async () => {
  $("brain-status").textContent = "Syncing…";
  try {
    const r = await memory.syncBrain({ prompt: true });
    const exported = r.connected && !r.needsPermission ? await memory.exportPending({ prompt: true }) : null;
    $("brain-status").textContent =
      (await brainStatus(r)) + (exported?.exported ? `\n${exported.exported} new entries written to inbox/` : "");
  } catch (err) {
    $("brain-status").textContent = `Failed: ${err.message}`;
  }
};

$("brain-status").textContent = await brainStatus(await memory.brainState().catch(() => ({ connected: false })));
