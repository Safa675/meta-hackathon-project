// What Tuck reminds the person of, and when it has said enough. Pure: which item, never
// how often Tuck interrupts. It runs only at moments that already exist (a greeting, a
// return, a break's end, a finished goal), so it adds no trigger. Nothing in the notes
// marks a loop done, so "done" is kept here, by entry id, and survives a re-import.

// Close enough to say aloud: due today or tomorrow, or missed within the last week.
const SOONEST_MISSED = -7;
export const isClose = ({ daysLeft }) => daysLeft != null && daysLeft <= 1 && daysLeft >= SOONEST_MISSED;

// loops: { [entryId]: { saidOn, doneAt } } from chrome.storage.local.
export const stillOpen = (queue, loops = {}) => queue.filter((e) => !loops[e.id]?.doneAt);

// The tasks a drift line may name: not one already said today.
export function sayable(queue, loops = {}, today) {
  return stillOpen(queue, loops).filter((e) => isClose(e) && loops[e.id]?.saidOn !== today);
}

// The most urgent thing worth a word now. queue is ordered by time left (memory's
// taskQueue). Not the goal the person is on, and once a day at most.
export function pickReminder(queue, { goalTitle, loops = {}, today }) {
  return sayable(queue, loops, today).find((e) => e.id && e.title !== goalTitle) ?? null;
}

export const markSaid = (loops, id, today) => ({ ...loops, [id]: { ...loops[id], saidOn: today } });
export const markDone = (loops, id, ts) => ({ ...loops, [id]: { ...loops[id], doneAt: ts } });
