import { addEntry } from "./store.js";

// Popup and content script talk to the worker through messages.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "intent") {
    addEntry({
      kind: "todo",
      topic: "meta-hackathon",
      title: msg.title,
      context: msg.context ?? "User stated what they are about to do.",
      result: msg.title,
      next: msg.next,
    }).then(reply, (err) => reply({ error: String(err) }));
    return true; // async reply
  }
  if (msg.type === "agent-status") {
    addEntry({
      kind: "event",
      topic: "meta-hackathon",
      title: `Agent ${msg.status}`,
      context: `claude.ai/code session status changed to ${msg.status}.`,
      result: msg.status,
      evidence: msg.url,
    }).then(reply, (err) => reply({ error: String(err) }));
    return true;
  }
});
