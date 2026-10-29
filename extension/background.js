// Placeholder (İrem's area). Shows how the extension writes into memory.
import { Memory } from "../memory/index.js";

const memory = Memory.open();

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const fields =
    msg.type === "intent"
      ? {
          kind: "todo",
          topic: "focus",
          title: msg.title,
          context: msg.context ?? "User stated what they are about to do.",
          result: msg.title,
          next: msg.next,
        }
      : msg.type === "agent-status"
        ? {
            kind: "event",
            topic: "focus",
            title: `Agent ${msg.status}`,
            context: `claude.ai/code session status changed to ${msg.status}.`,
            result: msg.status,
            evidence: msg.url,
          }
        : null;
  if (!fields) return;
  memory
    .then((m) => m.add(fields))
    .then(reply, (err) => reply({ error: String(err) }));
  return true; // async reply
});
