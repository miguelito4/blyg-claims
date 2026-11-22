// Writes _site/claims.json: every claim on every public blyg we can read, for
// the home-page ticker and the explorer. Runs at deploy time and every few
// hours. The claim that counts is the one in the earliest pinned version that
// carried it (as on the track-record page); its content hash is checked.
// A blyg that is slow or broken is skipped; if nothing at all can be read,
// nothing is written and the site keeps working without the file.
//
//   node scripts/claims.ts [out.json] [--cache dir]

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { BlygReader } from '../src/fetch.ts';
import { groupKeys, reference } from '../src/group.ts';
import { collect } from '../src/collect.ts';
import { parseContent } from '../extension/ui/core/parse.ts';
import { shapeOf } from '../extension/ui/core/shapes.ts';
import { resolvesBy } from '../extension/ui/core/check.ts';
import { describeCheck, sureOf } from '../extension/ui/core/compose.ts';
import { describeOutcome } from '../extension/ui/core/resolve.ts';
import { scoreClaim, summarize } from '../extension/ui/core/score.ts';
import type { ClaimBlock, ResolutionBlock } from '../extension/ui/core/types.ts';

const DIRECTORY = 'https://blygger.com/blygs.json';
const KNOWN = ['https://caseyjr.org/blyg/', 'https://venkateshrao.com/blyg/', 'https://blyg.aneeshsathe.com/'];
const PER_BLYG_MS = 100_000;

const args = process.argv.slice(2);
const cacheAt = args.indexOf('--cache');
const CACHE = cacheAt >= 0 ? args.splice(cacheAt, 2)[1] : null;
const OUT = args[0] ?? '_site/claims.json';
const today = new Date().toISOString().slice(0, 10);

const within = <T>(ms: number, p: Promise<T>): Promise<T> =>
  Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error(`gave up after ${ms / 1000}s`)), ms).unref())]);

export type Status = 'open' | 'due' | 'resolved' | 'void' | 'record' | 'withdrawn';

export interface ExploreClaim {
  id: string;
  page: string;
  origin: string;
  blyg: string;
  claim: string;
  shape: string;
  pick?: string;
  sure: string;
  by: string;
  status: Status;
  resolved: boolean;
  check: string;
  decidedBy: 'automatic' | 'record' | 'judgment' | 'author';
  pinned: boolean;
  pinnedVersion: number | null;
  pinnedAt: string | null;
  hashOk: boolean | null;
  changed: boolean;
  outcome: string | null;
  brier: number | null;
  topics: string[];
  /** The claim this one forked (§5.6), when it is a forecast on someone else's claim. */
  forkedFrom: { origin: string; id: string; version?: number } | null;
  /** The claim that counts (the earliest pinned version that carried it), so a forecast on it can copy it exactly. */
  block: ClaimBlock;
  /** Shared by a claim and all its forks: the address of the claim the chain starts from. */
  group: string;
}

export interface ExploreBlyg {
  origin: string;
  blyg: string;
  claims: number;
  pinned: number;
  resolved: number;
  forecasts: number;
  brier: number | null;
  rankingAccuracy: number | null;
  rangeHits: number | null;
}

export const sure = (v: Record<string, any>) => sureOf(v as ClaimBlock);

// Topics are a rough first pass from the words of the claim, so the explorer
// can be browsed by subject before writers tag anything themselves.
const TOPICS: [string, RegExp][] = [
  ['Sports', /\b(bowl|league|cup|championship|nfl|nba|mlb|nhl|premier|cricket|football|soccer|rugby|tennis|olympics?|playoffs?|world series|grand prix|formula 1|f1|ashes|wimbledon|super bowl)\b/i],
  ['AI', /\b(ai|a\.i\.|llms?|gpt[-\w]*|claude|gemini|open[- ]weights?|agi|lmarena|machine learning|neural|frontier models?|language models?)\b/i],
  ['Markets', /\b(stocks?|market caps?|nasdaq|s&p|dow|bitcoin|btc|ether(eum)?|crypto|ipo|valuation|share price|bond yields?|treasur(y|ies)|oil price)\b/i],
  ['Economy', /\b(inflation|cpi|gdp|recession|unemployment|wages?|earnings|jobs|poverty|interest rates?|fed|central bank|tariffs?|trade deficit|productivity)\b/i],
  ['Science', /\b(proofs?|hypothesis|theorem|conjecture|physics|fusion|moon|mars|space|nasa|spacex|quantum|telescope|particle|genome)\b/i],
  ['Health', /\b(vaccines?|disease|polio|malaria|cancer|clinical trials?|fda|ema|who|life expectancy|pandemic|drugs?|health|measles|obesity|glp-1)\b/i],
  ['Climate & energy', /\b(renewables?|solar|wind power|emissions|co2|carbon|climate|temperatures?|electricity|coal|natural gas|nuclear power|batter(y|ies)|evs?|warming)\b/i],
  ['Politics', /\b(elections?|president|prime minister|parliament|congress|senate|votes?|referendum|bill|legislation|supreme court|war|ceasefire|treaty|sanctions)\b/i],
  ['Blygger', /\b(blygs?|blygger|hackathon|protocol institute)\b/i],
];

export function topics(text: string): string[] {
  const t = TOPICS.filter(([, re]) => re.test(text)).map(([name]) => name);
  return t.length ? t : ['Other'];
}

const hash = (s: string) => 'sha256:' + createHash('sha256').update(s).digest('hex');
const KEYS = ['claim', 'shape', 'probability', 'pick', 'outcomes', 'size', 'range', 'confidence', 'resolves_by', 'check', 'voids_if'] as const;
const same = (a: ClaimBlock, b: ClaimBlock) => KEYS.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

async function read(origin: string): Promise<{ blyg: ExploreBlyg; claims: ExploreClaim[] }> {
  const reader = await BlygReader.open(origin, { cacheDir: CACHE });
  const journal = await collect(reader);
  const title = journal.title ?? new URL(journal.origin).host;
  const claims: ExploreClaim[] = [];
  const parts = [];
  for (const { item, pins } of journal.entries) {
    const current = parseContent(item.content_md);
    const sorted = [...pins].sort((a, b) => a.version - b.version);
    let base: { claim: ClaimBlock; version: number; at: string; hashOk: boolean } | null = null;
    for (const pin of sorted) {
      const c = parseContent(pin.content_md).claims[0]?.value;
      if (c) {
        base = { claim: c, version: pin.version, at: pin.at, hashOk: hash(pin.content_md) === pin.content_hash };
        break;
      }
    }
    const claim = base?.claim ?? current.claims[0]?.value;
    if (!claim?.claim) continue;
    const resolution: ResolutionBlock | null = current.resolutions[0]?.value ?? null;
    const shape = shapeOf(claim as Record<string, unknown>) ?? 'binary';
    const status: Status = item.kind === 'withdrawn' ? 'withdrawn'
      : resolution ? (resolution.outcome === 'void' ? 'void' : 'resolved')
      : shape === 'record' ? 'record'
      : String(claim.resolves_by) <= today ? 'due' : 'open';
    const check = claim.check;
    let brier: number | null = null;
    if (status === 'resolved' && resolution) {
      const s = scoreClaim(claim, resolution);
      parts.push(s);
      if (s.forecasts.length) brier = s.forecasts.reduce((t, f) => t + (f.p - (f.hit ? 1 : 0)) ** 2, 0) / s.forecasts.length;
    }
    claims.push({
      id: item.id,
      page: new URL(item.page ?? `${item.kind === 'thread' ? 't' : 'f'}/${item.id}/`, journal.origin).href,
      origin: journal.origin,
      blyg: title,
      claim: String(claim.claim),
      shape,
      ...(claim.pick ? { pick: String(claim.pick) } : {}),
      sure: sure(claim as Record<string, any>),
      by: String(claim.resolves_by ?? ''),
      status,
      resolved: status === 'resolved' || status === 'void',
      check: check ? describeCheck(check) : typeof claim.criteria === 'string' ? claim.criteria : 'The author decides.',
      decidedBy: !check || (check.oracle === 'judgment' && (check as { by?: unknown }).by === 'author') ? 'author' : resolvesBy(check),
      pinned: base !== null,
      pinnedVersion: base?.version ?? null,
      pinnedAt: base?.at ?? null,
      hashOk: base ? base.hashOk : null,
      changed: Boolean(base && current.claims[0] && !same(base.claim, current.claims[0].value)),
      outcome: resolution ? describeOutcome(resolution) : null,
      brier,
      topics: topics(String(claim.claim)),
      forkedFrom: reference(item.forked_from),
      block: claim,
      group: '',
    });
  }
  const sum = summarize(parts);
  return {
    claims,
    blyg: {
      origin: journal.origin,
      blyg: title,
      claims: claims.length,
      pinned: claims.filter((c) => c.pinned).length,
      resolved: claims.filter((c) => c.resolved).length,
      forecasts: sum.forecasts,
      brier: sum.brier,
      rankingAccuracy: sum.rankingAccuracy,
      rangeHits: sum.rangeHits,
    },
  };
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

async function main() {
  const list = await origins();
  const results = await Promise.allSettled(list.map((o) => within(PER_BLYG_MS, read(o))));
  const claims: ExploreClaim[] = [];
  const blygs: ExploreBlyg[] = [];
  const skipped: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      claims.push(...r.value.claims);
      if (r.value.claims.length) blygs.push(r.value.blyg);
    } else {
      skipped.push(list[i]);
      console.error(`${list[i]}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
    }
  });
  if (!claims.length) throw new Error('no claims found');
  const keys = groupKeys(claims.map((c) => ({ origin: c.origin, id: c.id, forkedFrom: c.forkedFrom })));
  claims.forEach((c, i) => (c.group = keys[i]));
  const rank = { due: 0, open: 1, record: 2, resolved: 3, void: 4, withdrawn: 5 };
  claims.sort((a, b) => rank[a.status] - rank[b.status] || a.by.localeCompare(b.by));
  await writeFile(OUT, JSON.stringify({ at: new Date().toISOString(), scanned: list.length - skipped.length, skipped, blygs, claims }));
  console.log(`${OUT}: ${claims.length} claims on ${blygs.length} of ${list.length} blygs${skipped.length ? `, ${skipped.length} skipped` : ''}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(0);
});
