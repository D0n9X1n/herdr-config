// H1: recording stubs for run/openOverlay/notify/setShared (and any other host function).
// Every call lands in `calls` in order as {fn, name, args}.

function nameOf(fn, a) {
  if (typeof a === "string") return a;
  if (fn === "openOverlay") return a?.mod;
  if (fn === "notify") return a?.title;
  return undefined;
}

export function recorder() {
  const calls = [];
  const record = (fn, ...a) => {
    const named = typeof a[0] === "string" || fn === "openOverlay" || fn === "notify";
    const name = named ? nameOf(fn, a[0]) : undefined;
    const args = typeof a[0] === "string" ? a[1] : a[0];
    calls.push({ fn, name, args });
    return calls.length;
  };
  return {
    calls,
    record,
    run: (name, args) => (record("run", name, args), null),
    openOverlay: (spec) => `overlay-${record("openOverlay", spec)}`,
    notify: (n) => (record("notify", n), null),
    setShared: (key, value) => (record("setShared", key, value), null),
  };
}
