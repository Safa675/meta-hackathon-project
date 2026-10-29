// Placeholder (İrem's area).
import { Memory } from "../../memory/index.js";

const $ = (id) => document.getElementById(id);
const memory = Memory.open();

async function render() {
  const e = await (await memory).latestIntent();
  $("left").textContent = e ? `Where you left off: ${e.title} → next: ${e.next}` : "";
}

$("save").onclick = async () => {
  const res = await chrome.runtime.sendMessage({
    type: "intent",
    title: $("title").value,
    next: $("next").value,
  });
  if (res?.error) $("left").textContent = res.error;
  else {
    $("title").value = "";
    $("next").value = "";
    render();
  }
};

render();
