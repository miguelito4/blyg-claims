// The `blyg` oracle: Blygger itself as the source of truth.
//
//   blygs_with_claims: how many blygs (from the blygger.com directory or a
//     given list, minus `exclude`) have at least one item carrying a valid
//     claim block, created on or before the cutoff.
//   item_exists: whether an item is published and not withdrawn.

import { BlygReader, normalize, type ReaderOptions } from '../fetch.ts';
import { collect } from '../collect.ts';
import { parseContent } from '../../extension/ui/core/parse.ts';
import type { BlygCheck } from '../../extension/ui/core/check.ts';

export const DIRECTORY_URL = 'https://blygger.com/blygs.json';

export interface OracleResult {
  value: number | boolean;
  /** What the value was computed from, for the report. */
  detail: Record<string, unknown>;
  /** Sources that could not be read. The value is computed without them. */
  unreadable: { source: string; error: string }[];
}

export interface BlygOracleOptions extends ReaderOptions {
  /** Count only claims created at or before this instant. */
  cutoff: Date;
  directoryUrl?: string;
}

async function directory(opts: BlygOracleOptions): Promise<string[]> {
  const f = opts.fetch ?? ((url: string) => fetch(url));
  const res = await f(opts.directoryUrl ?? DIRECTORY_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`directory: ${res.status}`);
  const json = (await res.json()) as { blygs?: { origin?: unknown }[] };
  if (!Array.isArray(json.blygs)) throw new Error('directory: no blygs array');
  return json.blygs.map((b) => b.origin).filter((o): o is string => typeof o === 'string');
}

export async function evaluateBlyg(check: BlygCheck, opts: BlygOracleOptions): Promise<OracleResult> {
  if (check.metric === 'item_exists') return itemExists(check, opts);

  const unreadable: OracleResult['unreadable'] = [];
  const pool = check.among === undefined || check.among === 'directory' ? await directory(opts) : check.among;
  const excluded = new Set((check.exclude ?? []).map(normalize));
  const origins = [...new Set(pool.map(normalize))].filter((o) => !excluded.has(o));

  const withClaims: { origin: string; items: string[] }[] = [];
  for (const origin of origins) {
    try {
      const reader = await BlygReader.open(origin, opts);
      const journal = await collect(reader, opts.cutoff);
      const items = journal.entries
        .filter(({ item, pins }) => {
          if (new Date(item.created) > opts.cutoff) return false;
          const texts = [item.content_md, ...pins.map((p) => p.content_md)];
          return texts.some((t) => parseContent(t).claims.length > 0);
        })
        .map(({ item }) => item.id);
      if (items.length) withClaims.push({ origin: reader.origin, items });
    } catch (e) {
      unreadable.push({ source: origin, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return {
    value: withClaims.length,
    detail: { metric: check.metric, considered: origins.length, excluded: [...excluded], withClaims },
    unreadable,
  };
}

async function itemExists(check: BlygCheck, opts: BlygOracleOptions): Promise<OracleResult> {
  const url = new URL(check.item!);
  const id = url.pathname.split('/').filter(Boolean).pop() ?? '';
  try {
    const reader = await BlygReader.open(url.href, opts);
    const item = await reader.item(id);
    const exists = item.kind !== 'withdrawn' && new Date(item.created) <= opts.cutoff;
    return { value: exists, detail: { metric: check.metric, id, kind: item.kind, created: item.created }, unreadable: [] };
  } catch (e) {
    return { value: false, detail: { metric: check.metric, id }, unreadable: [{ source: url.href, error: e instanceof Error ? e.message : String(e) }] };
  }
}
