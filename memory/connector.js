// Brain folder connector (File System Access API). Reads .md files under
// inbox/ and notes/, and writes new entries into inbox/ in the brain's format.
import { toInboxMarkdown } from "./entry.js";

export async function readBrainFolder(dir, prefix = "") {
  const files = [];
  for await (const [name, handle] of dir.entries()) {
    const path = prefix + name;
    if (handle.kind === "directory") {
      if (prefix === "" && name !== "inbox" && name !== "notes") continue;
      files.push(...(await readBrainFolder(handle, path + "/")));
    } else if (name.endsWith(".md")) {
      files.push({ path, text: await (await handle.getFile()).text() });
    }
  }
  return files;
}

// Same naming as the brain's inbox files: <UTC timestamp>-<host>-<source>-<id6>.md
export function inboxFileName(entry, host, now = new Date()) {
  const ts = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${ts}-${host}-${entry.source}-${entry.id.slice(0, 6)}.md`;
}

export async function writeInboxEntry(dir, entry, host = "browser") {
  if ((await dir.requestPermission({ mode: "readwrite" })) !== "granted") {
    throw new Error("no write permission on the brain folder");
  }
  const inbox = await dir.getDirectoryHandle("inbox", { create: true });
  const file = await inbox.getFileHandle(inboxFileName(entry, host), { create: true });
  const w = await file.createWritable();
  await w.write(toInboxMarkdown(entry, host));
  await w.close();
}
