// Placeholder (İrem's area). Imports a brain folder into memory.
import { Memory } from "../../memory/index.js";

const status = (t) => (document.getElementById("status").textContent = t);

document.getElementById("pick").onclick = async () => {
  try {
    const dir = await showDirectoryPicker({ mode: "read" });
    status("Reading…");
    const memory = await Memory.open();
    const { entries, notes, skipped } = await memory.importBrain(dir);
    const loops = (await memory.openLoops()).length;
    status(`${entries} entries, ${notes} notes, ${loops} open loops` + (skipped.length ? `\n${skipped.length} files skipped` : ""));
  } catch (err) {
    status(`Failed: ${err.message}`);
  }
};
