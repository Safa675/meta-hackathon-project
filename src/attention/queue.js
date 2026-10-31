// Runs async jobs strictly one after another. Chrome fires bursts of tab events
// for one navigation; the engine must see them in order, one at a time.
export function createSerialQueue() {
  let tail = Promise.resolve();
  return (fn) => {
    const run = tail.then(fn);
    tail = run.catch(() => {});
    return run;
  };
}
