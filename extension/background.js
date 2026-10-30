// Placeholder (İrem's area). Shows how the extension writes into memory.
import { Memory } from "../memory/index.js";

const memory = Memory.open();

// Memory upkeep every 15 minutes: consolidate, prune old activity, export to the brain.
chrome.alarms.create("memory-maintain", { periodInMinutes: 15 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "memory-maintain") memory.then((m) => m.maintain());
});

const entryFor = (msg) =>
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

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const fields = entryFor(msg);
  const work = fields
    ? (m) => m.add(fields)
    : msg.type === "maintain"
      ? (m) => m.maintain()
      : msg.type === "sync-brain"
        ? (m) => m.syncBrain()
        : null;
  if (!work) return;
  memory.then(work).then(reply, (err) => reply({ error: String(err) }));
  return true; // async reply
});
