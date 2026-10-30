import { Memory } from "../../memory/index.js";
import { loadModelSettings } from "../../memory/model.js";

const $ = (id) => document.getElementById(id);
const memory = await Memory.open();

const LABEL = { on_track: "On track", drifting: "Drifting", break: "Break", unclear: "Unclear" };

function ago(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
}

async function renderIntent() {
  const intent = await memory.latestIntent();
  $("intent-view").hidden = !intent;
  $("intent-form").hidden = !!intent;
  if (intent) {
    $("intent-title").textContent = intent.title;
    $("intent-next").textContent = intent.next && intent.next !== "none" ? `Next: ${intent.next}` : "";
    $("done").onclick = async () => {
      await memory.completeIntent(intent.id);
      renderIntent();
    };
  }
}

function renderVerdict(a) {
  const pill = $("verdict-pill");
  if (!a) return;
  pill.className = `pill ${a.error ? "error" : a.verdict}`;
  pill.textContent = a.error ? "Error" : LABEL[a.verdict] ?? a.verdict;
  $("verdict-when").textContent = ago(a.at);
  $("verdict-reason").textContent = a.error ?? a.reason ?? "";
  $("verdict-nudge").textContent = a.nudge ?? "";
}

async function renderActivity() {
  $("activity").textContent = (await memory.activity({ minutes: 30 })).text;
}

async function renderSetup() {
  const settings = await loadModelSettings();
  const brain = await memory.brainState().catch(() => ({ connected: false }));
  const missing = [];
  if (!settings?.apiKey && settings?.provider !== "ollama") missing.push("add a model API key");
  if (!brain.connected) missing.push("connect your brain folder (optional)");
  $("setup").hidden = !missing.length;
  $("setup").innerHTML = missing.length ? `Set up: ${missing.join(", ")} in <a href="#" id="setup-link">Settings</a>.` : "";
  $("setup-link")?.addEventListener("click", openSettings);
}

function openSettings(e) {
  e?.preventDefault();
  chrome.runtime.openOptionsPage();
}

$("open-settings").onclick = openSettings;

$("intent-form").onsubmit = async (e) => {
  e.preventDefault();
  await memory.setIntent({ title: $("title").value.trim(), next: $("next").value.trim() || undefined });
  $("title").value = "";
  $("next").value = "";
  renderIntent();
};

$("change").onclick = () => {
  $("intent-view").hidden = true;
  $("intent-form").hidden = false;
  $("title").focus();
};

$("check").onclick = async () => {
  $("check").disabled = true;
  $("check").textContent = "Checking…";
  try {
    renderVerdict(await chrome.runtime.sendMessage({ type: "audit-now" }));
    renderActivity();
  } finally {
    $("check").disabled = false;
    $("check").textContent = "Check now";
  }
};

chrome.storage.onChanged.addListener((changes) => {
  if (changes.lastAudit) renderVerdict(changes.lastAudit.newValue);
});

// Count the popup's own opening as being on the current page.
chrome.runtime.sendMessage({ type: "record-active" }).catch(() => {});
renderIntent();
renderVerdict((await chrome.storage.local.get("lastAudit")).lastAudit);
renderActivity();
renderSetup();
