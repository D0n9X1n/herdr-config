// Refresh helper shared by apollo-changes and apollo-specs as identical copies (mods never import
// each other; scripts/check.sh compares the two files).
// Local folders (on: null) reload on every watchFolder event; every space also polls on a timer.
// Remote folders never watch (watchFolder is local only) and rely on the poll.
// Reloads never overlap or queue: a tick or event during a reload only marks it dirty, and when the
// reload ends at most one more runs.

export const CHANGES_EVERY = 10000, SPECS_EVERY = 60000;

export function startRefresh({ folder, on = null, every, watchFolder, timer, reload }) {
  let stopped = false, running = null, dirty = false;
  const run = () => {
    if (stopped) return Promise.resolve();
    if (running) { dirty = true; return running; }
    running = (async () => {
      do {
        dirty = false;
        try { await reload(); } catch { /* the next tick or event retries */ }
      } while (dirty && !stopped);
      running = null;
    })();
    return running;
  };
  const handle = timer.every(every, () => { if (!stopped) run(); });
  async function watch() {
    while (!stopped) {
      try { await watchFolder(folder); } catch { return; }
      if (stopped) return;
      await run();
    }
  }
  const ready = (async () => {
    await run();
    if (on === null || on === undefined) watch();
  })();
  return {
    ready,
    reload: run,
    stop() {
      stopped = true;
      try { handle?.cancel?.(); } catch { /* already gone */ }
    },
  };
}

// Keeps exactly one refresh loop for the current target. follow(key, target) does nothing for the same
// key; for a new key it stops the old loop (its timer is cancelled and its watch ends at the next event
// without reloading) and starts one for the new target (none when target is null). Returns whether it changed.
export function refreshFollower({ start }) {
  let cur = null;
  const f = {
    key: undefined,
    follow(key, target) {
      if (key === f.key) return false;
      cur?.stop();
      cur = null;
      f.key = key;
      if (key !== null && key !== undefined && target) cur = start(target);
      return true;
    },
    stop() {
      cur?.stop();
      cur = null;
      f.key = undefined;
    },
  };
  return f;
}
