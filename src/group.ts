// Forecasts on the same claim: a claim and every fork of it (protocol §5.6,
// `forked_from`), however deep the chain, share one group, keyed by the
// address of the claim the chain starts from. A root the scan never read
// still names the group, so two forks of an unread claim land together.
// Origins compare byte for byte (§5.9), so the key is plain concatenation.

export interface Lineage {
  origin: string;
  id: string;
  forkedFrom?: { origin: string; id: string } | null;
}

export const keyOf = (r: { origin: string; id: string }) => `${r.origin}${r.id}`;

/** Each item's group key, in input order. Cycles (which the protocol cannot produce) stop where they close. */
export function groupKeys(items: Lineage[]): string[] {
  const parent = new Map<string, string>();
  for (const it of items) if (it.forkedFrom?.origin && it.forkedFrom.id) parent.set(keyOf(it), keyOf(it.forkedFrom));
  return items.map((it) => {
    let key = keyOf(it);
    const seen = new Set([key]);
    for (let up = parent.get(key); up && !seen.has(up); up = parent.get(key)) {
      seen.add(up);
      key = up;
    }
    return key;
  });
}

/** A reference as the protocol writes it, or null for anything else. */
export function reference(value: unknown): { origin: string; id: string; version?: number } | null {
  if (!value || typeof value !== 'object') return null;
  const { origin, id, version } = value as Record<string, unknown>;
  if (typeof origin !== 'string' || typeof id !== 'string' || !origin || !id) return null;
  return { origin, id, ...(typeof version === 'number' ? { version } : {}) };
}
