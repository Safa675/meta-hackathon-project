import { listEntries, lastIntent } from "../src/store.js";
import { toInboxMarkdown } from "../src/entry.js";

const $ = (id) => document.getElementById(id);

async function render() {
  const e = await lastIntent();
  $("left").textContent = e ? `Where you left off: ${e.title} → next: ${e.next}` : "";
}

$("save").onclick = async () => {
  const res = await chrome.runtime.sendMessage({
    type: "intent",
    title: $("title").value,
    next: $("next").value,
  });
  if (res?.error) $("left").textContent = res.error;
  else { $("title").value = ""; $("next").value = ""; render(); }
};

// One .md file per entry (the brain's inbox is one file per entry), named like its inbox files.
$("export").onclick = async () => {
  for (const e of await listEntries()) {
    const name = `${new Date(e.ts).toISOString().replace(/[-:]/g, "").slice(0, 15)}Z-meta-hackathon-${e.ts}.md`;
    const url = URL.createObjectURL(new Blob([toInboxMarkdown(e)], { type: "text/markdown" }));
    await chrome.downloads.download({ url, filename: `inbox-export/${name}` });
  }
};

render();
