// Walk a blyg and gather everything the scorer needs: each item that carries a
// claim or resolution block now, plus every withdrawn item (its endcap is
// empty, but its pins are forever, §8–9, so a withdrawn claim can still be
// found). For each of these, every pinned version listed in its changelog.

import type { BlygReader } from './fetch.ts';
import { parseContent } from '../extension/ui/core/parse.ts';
import type { ItemDocument, Pin } from '../extension/ui/core/protocol.ts';

export interface Collected {
  item: ItemDocument;
  pins: Pin[];
}

export interface Journal {
  origin: string;
  title: string | null;
  fetchedAt: string;
  itemsScanned: number;
  entries: Collected[];
  /** Items that could not be fetched, and why. */
  failures: { id: string; error: string }[];
}

export async function collect(reader: BlygReader, now = new Date()): Promise<Journal> {
  const index = await reader.index();
  const failures: Journal['failures'] = [];
  const docs = await reader.map(index, async (entry) => {
    try {
      return await reader.item(entry.id, entry.version);
    } catch (e) {
      failures.push({ id: entry.id, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  });
  const candidates = docs.filter((d): d is ItemDocument => {
    if (!d) return false;
    if (d.kind === 'withdrawn') return d.changelog.some((c) => c.pinned);
    const p = parseContent(d.content_md);
    return p.claims.length > 0 || p.resolutions.length > 0;
  });
  const entries = await reader.map(candidates, async (item) => {
    const pinned = item.changelog.filter((c) => c.pinned).map((c) => c.version);
    const pins = (await reader.map(pinned, (n) => reader.pin(item.id, n))).filter((p): p is Pin => p !== null);
    return { item, pins };
  });
  // A withdrawn item stays only if one of its pins ever carried a claim.
  const kept = entries.filter((e) => e.item.kind !== 'withdrawn' || e.pins.some((p) => parseContent(p.content_md).claims.length > 0));
  return {
    origin: reader.origin,
    title: typeof reader.manifest.title === 'string' ? reader.manifest.title : null,
    fetchedAt: now.toISOString(),
    itemsScanned: index.length,
    entries: kept,
    failures,
  };
}
