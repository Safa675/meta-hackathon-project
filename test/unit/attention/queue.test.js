import test from "node:test";
import assert from "node:assert/strict";
import { createSerialQueue } from "../../../src/attention/queue.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("jobs run one at a time, in call order", async () => {
  const enqueue = createSerialQueue();
  const log = [];
  const job = (name, ms) => async () => {
    log.push(`start ${name}`);
    await sleep(ms);
    log.push(`end ${name}`);
    return name;
  };
  const results = await Promise.all([enqueue(job("a", 30)), enqueue(job("b", 1)), enqueue(job("c", 10))]);
  assert.deepEqual(results, ["a", "b", "c"]);
  assert.deepEqual(log, ["start a", "end a", "start b", "end b", "start c", "end c"]);
});

test("a failing job reaches its caller and does not block the next", async () => {
  const enqueue = createSerialQueue();
  const failed = enqueue(async () => {
    throw new Error("boom");
  });
  const next = enqueue(async () => "ok");
  await assert.rejects(failed, /boom/);
  assert.equal(await next, "ok");
});
