// H3: helpers over view-model nodes shaped {kind, attrs, children}.

export function* walk(node) {
  if (!node || typeof node !== "object") return;
  yield node;
  for (const child of node.children ?? []) yield* walk(child);
}

export const findAll = (node, pred) => [...walk(node)].filter(pred);

export const count = (node, kind) => findAll(node, (n) => n.kind === kind).length;
