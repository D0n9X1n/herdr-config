// H2: a fake watchFolder, a fake timer and a microtask/IO flush.
// Every returned function is a closure, so destructuring works:
//   const { watchFolder, fire } = fakeWatch();

export function fakeWatch() {
  let waiters = [];
  const watched = [];
  const watchFolder = (dir) => {
    watched.push(dir);
    return new Promise((resolve) => waiters.push(resolve));
  };
  const fire = (paths) => {
    const now = waiters;
    waiters = [];
    for (const resolve of now) resolve(paths);
  };
  return { watched, watchFolder, fire };
}

export function fakeTimer() {
  const fns = [];
  const every = (ms, fn) => {
    fns.push({ ms, fn });
    return { cancel() { const i = fns.findIndex((f) => f.fn === fn); if (i >= 0) fns.splice(i, 1); } };
  };
  const tick = (...args) => { for (const { fn } of [...fns]) fn(...args); };
  return { every, tick, get count() { return fns.length; }, intervals: () => fns.map((f) => f.ms) };
}

export const flush = () => new Promise((resolve) => setImmediate(resolve));
