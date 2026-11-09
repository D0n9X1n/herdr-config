// H7 (test-only, loaded with --import): maps the mod runtime modules to host.js.
import { registerHooks } from "node:module";

const HOST = new URL("./host.js", import.meta.url).href;
const MAPPED = new Set(["gpui-kit", "gpui", "gpui-base", "gpui-shell", "herdr"]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (MAPPED.has(specifier)) return { url: HOST, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
