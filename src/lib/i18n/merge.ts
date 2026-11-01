type Dict = { [k: string]: string | Dict };

/** Deep-merges dictionary layers; later layers override earlier ones key by key. */
export function mergeDict<A extends Dict, B extends Dict>(base: A, over: B): A & B {
  const out: Dict = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const cur = out[k];
    out[k] = typeof v === "object" && typeof cur === "object" ? mergeDict(cur, v) : v;
  }
  return out as A & B;
}
