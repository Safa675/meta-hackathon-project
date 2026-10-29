import { loadBrain, openLoops } from "../src/brain.js";

const status = (t) => (document.getElementById("status").textContent = t);

// Depth-first walk of the picked folder, reading only .md files under inbox/ and notes/.
async function* walk(dir, prefix = "") {
  for await (const [name, handle] of dir.entries()) {
    const path = prefix + name;
    if (handle.kind === "directory") {
      if (prefix === "" && name !== "inbox" && name !== "notes") continue;
      yield* walk(handle, path + "/");
    } else if (name.endsWith(".md")) {
      yield { path, text: await (await handle.getFile()).text() };
    }
  }
}

document.getElementById("pick").onclick = async () => {
  try {
    const root = await showDirectoryPicker({ mode: "read" });
    status("Reading…");
    const files = [];
    for await (const f of walk(root)) files.push(f);
    const { entries, documents, skipped } = loadBrain(files);
    const loops = openLoops(entries);
    await chrome.storage.local.set({ brain: { loops, entryCount: entries.length, documentCount: documents.length } });
    status(
      `${entries.length} entries, ${documents.length} notes, ${loops.length} open loops` +
        (skipped.length ? `\n${skipped.length} files skipped` : ""),
    );
  } catch (err) {
    status(`Failed: ${err.message}`);
  }
};
