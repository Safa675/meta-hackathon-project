// What Tuck shows for an engine trigger or a goal event: its state and its bubble.
// Pure; background.js sends the result to the page (overlay.js draws it) and the
// popup shares the same words. Design §12.

const duration = (sec) => (sec < 90 ? `${sec} s` : `${Math.round(sec / 60)} min`);

const ANSWERS = {
  back: { choice: "back", label: "Take me back", primary: true },
  related: { choice: "related", label: "This is for my task" },
  break: { choice: "break", label: "5-min break" },
};

// Template words until the agent writes them (LLM#4, plan 2).
export function nudgeText(t) {
  const goal = t.intentTitle ?? "your goal";
  const e = t.evidence ?? {};
  switch (t.kind) {
    case "drift":
      return `You've been on ${e.host} for ${duration(e.dwellSec ?? 0)} — back to ${goal}?`;
    case "fragmentation":
      return "Lots of tab hopping — want to pick one thing?";
    case "return":
      return `Welcome back. You were on ${e.lastRelevant?.title ?? goal}.`;
    case "break_over":
      return `Break's over — ready for ${goal}?`;
    case "session_start":
      return "Hi! What are we working on today?";
    default:
      return "";
  }
}

const goalForm = (text, pickUp = []) => ({ kind: "goal", text, pickUp });

// input: {trigger, loops} for an engine trigger, or {event, intent} for
// "goal_set" | "goal_done" | "resolved" | "presence" | "card". Returns null when Tuck stays away.
export function present({ trigger, loops = [], event, intent }) {
  if (trigger) {
    if (trigger.level < 1) return null;
    const { kind, level, id } = trigger;
    if (kind === "session_start")
      return {
        tuck: "checkin",
        bubble: goalForm(
          nudgeText(trigger),
          loops.slice(0, 2).map((l) => l.title),
        ),
      };
    if (kind === "return" || kind === "break_over") {
      const buttons = kind === "return" ? [ANSWERS.back] : [ANSWERS.back, ANSWERS.break];
      return {
        tuck: "checkin",
        bubble: { kind: "nudge", text: nudgeText(trigger), buttons, dismissable: true },
        triggerId: id,
      };
    }
    // The first word: a visible wave and the message at once. On a page the model is
    // unsure about, Tuck asks instead, and the answer becomes a label.
    if (level === 1) {
      const e = trigger.evidence ?? {};
      const bubble = e.unsure
        ? {
            kind: "nudge",
            text: `Is ${e.host} part of ${trigger.intentTitle ?? "your goal"}?`,
            buttons: [
              { choice: "related", label: "Yes, it's for my task", primary: true },
              { choice: "back", label: "No, take me back" },
            ],
            dismissable: true,
          }
        : {
            kind: "nudge",
            text: nudgeText(trigger),
            buttons: [ANSWERS.back, ANSWERS.related, ANSWERS.break],
            dismissable: true,
          };
      return { tuck: "checkin", bubble, triggerId: id };
    }
    return {
      tuck: "thinking",
      bubble: {
        kind: "nudge",
        text: nudgeText(trigger),
        buttons: [ANSWERS.back, ANSWERS.related, ANSWERS.break],
        dismissable: true,
      },
      triggerId: id,
    };
  }
  switch (event) {
    case "goal_set":
      return {
        tuck: "welcome",
        settle: "resting",
        bubble: { kind: "note", text: "Got it — let's go." },
        closeBubbleAfterMs: 2000,
      };
    case "goal_done":
      return { tuck: "checkin", bubble: goalForm("Nice! What's next?") };
    case "resolved":
      return { tuck: "welcome", settle: "resting", bubble: null };
    case "presence":
      // Tuck rests on every page while there is a goal; quiet: no entrance if already there.
      return { tuck: "resting", bubble: null, quiet: true };
    case "card":
      return intent
        ? { tuck: "checkin", bubble: { kind: "card", text: intent.title, next: intent.steps?.[0] ?? "" } }
        : { tuck: "checkin", bubble: goalForm("What are we working on?") };
    default:
      return null;
  }
}
