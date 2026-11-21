// Writes _site/claims.json: real claims from public blygs, for the ticker on
// the home page. Runs at deploy time. Any blyg that fails is skipped; if the
// whole run fails, nothing is written and the page keeps its built-in list.

import { writeFile } from 'node:fs/promises';
import { BlygReader } from '../src/fetch.ts';
import { collect } from '../src/collect.ts';
import { parseContent } from '../extension/ui/core/parse.ts';
import { shapeOf } from '../extension/ui/core/shapes.ts';

const DIRECTORY = 'https://blygger.com/blygs.json';
const KNOWN = ['https://caseyjr.org/blyg/', 'https://venkateshrao.com/blyg/', 'https://blyg.aneeshsathe.com/'];
const OUT = process.argv[2] ?? '_site/claims.json';
const MAX = 30;
const PER_BLYG_MS = 100_000;

const within = <T>(ms: number, p: Promise<T>): Promise<T> =>
  Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error(`gave up after ${ms / 1000}s`)), ms).unref())]);

export interface TickerClaim {
  claim: string;
  sure: string;
  by: string;
  shape: string;
  pinned: boolean;
  resolved: boolean;
  blyg: string;
  page: string;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function sure(v: Record<string, any>): string {
  const shape = shapeOf(v);
  if (shape === 'binary') return pct(v.probability);
  if (shape === 'record') return 'On record';
  if (shape === 'quantity' && Array.isArray(v.range)) return `${v.range[0]}–${v.range[1]}${v.unit ? ` ${v.unit}` : ''} · ${pct(v.confidence ?? 0.8)}`;
  if (shape === 'choice' && Array.isArray(v.outcomes) && v.outcomes.length) {
    if (v.pick === 'order' || v.outcomes.every((o: any) => o.probability === undefined)) return v.outcomes.slice(0, 3).map((o: any, i: number) => `${i + 1} ${o.label}`).join(' · ');
    const top = [...v.outcomes].sort((a: any, b: any) => (b.probability ?? 0) - (a.probability ?? 0))[0];
    return `${top.label} ${pct(top.probability ?? 0)}`;
  }
  return '';
}

async function origins(): Promise<string[]> {
  const list = new Set(KNOWN);
  try {
    const res = await fetch(DIRECTORY, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const json = (await res.json()) as { blygs?: { origin?: unknown }[] };
    for (const b of json.blygs ?? []) if (typeof b.origin === 'string') list.add(b.origin.endsWith('/') ? b.origin : `${b.origin}/`);
  } catch (e) {
    console.error(`directory: ${e instanceof Error ? e.message : e}`);
  }
  return [...list];
}

async function read(origin: string): Promise<TickerClaim[]> {
  const reader = await BlygReader.open(origin, { cacheDir: null });
  const journal = await collect(reader);
  const out: TickerClaim[] = [];
  for (const { item, pins } of journal.entries) {
    const parsed = parseContent(item.content_md);
    const c = parsed.claims[0]?.value as Record<string, any> | undefined;
    if (!c?.claim || !item.page) continue;
    out.push({
      claim: String(c.claim),
      sure: sure(c),
      by: String(c.resolves_by ?? ''),
      shape: shapeOf(c) ?? 'binary',
      pinned: pins.length > 0,
      resolved: parsed.resolutions.length > 0,
      blyg: journal.title ?? new URL(journal.origin).host,
      page: new URL(item.page, journal.origin).href,
    });
  }
  return out;
}

async function main() {
  const list = await origins();
  const results = await Promise.allSettled(list.map((o) => within(PER_BLYG_MS, read(o))));
  const out: TickerClaim[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(...r.value);
    else console.error(`${list[i]}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
  });
  out.sort((a, b) => Number(a.resolved) - Number(b.resolved) || a.by.localeCompare(b.by));
  if (!out.length) throw new Error('no claims found');
  await writeFile(OUT, JSON.stringify({ at: new Date().toISOString(), claims: out.slice(0, MAX) }, null, 1));
  console.log(`${OUT}: ${Math.min(out.length, MAX)} claims from ${list.length} blygs`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(0);
});
