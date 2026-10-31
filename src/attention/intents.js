// Shadow intents: the goal record attention owns (stable id, steps, topic), linked
// to memory's todo entry. A goal not finished by the end of the day becomes an open
// loop for the next morning. Design §9.1 and §9.4.

const H = 3600 * 1000;

// The local date, with the day turning at cfg.dayBoundaryHour rather than midnight.
export function dayKey(ts, cfg, tzOffsetMin = cfg.tzOffsetMin ?? new Date(ts).getTimezoneOffset()) {
  return new Date(ts - tzOffsetMin * 60 * 1000 - cfg.dayBoundaryHour * H).toISOString().slice(0, 10);
}

function slug(title) {
  return (
    title
      .replace(/[İIı]/g, "i")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .match(/[a-z0-9]+/g)
      ?.join("-")
      .slice(0, 40)
      .replace(/-$/, "") ?? "focus"
  );
}

export function makeIntent(
  { title, steps = [], estMin = null, topic, memoryEntryId = null, fromLoopId = null },
  ts,
  id = crypto.randomUUID(),
) {
  return {
    id,
    title,
    steps,
    estMin,
    topic: topic ?? slug(title),
    createdAt: ts,
    doneAt: null,
    expiredAt: null,
    memoryEntryId,
    fromLoopId,
  };
}

export function isExpired(intent, nowTs, lastActiveTs, cfg, tzOffsetMin) {
  if (dayKey(nowTs, cfg, tzOffsetMin) !== dayKey(intent.createdAt, cfg, tzOffsetMin)) return true;
  return nowTs - lastActiveTs >= cfg.expireAwayHours * H;
}
