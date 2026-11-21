// Read any blyg's track record from its public files. The claim that counts
// is the one in the earliest pinned version that carried it; the pin's
// content hash is checked, and later edits to the claim are reported.

import { findBlyg } from './oauth.ts';
import { parseContent } from '../extension/ui/core/parse.ts';
import { resolvesBy } from '../extension/ui/core/check.ts';
import { scoreClaim, summarize, type Summary } from '../extension/ui/core/score.ts';
import type { ClaimBlock, ResolutionBlock } from '../extension/ui/core/types.ts';

export type RecordStatus = 'open' | 'due' | 'resolved' | 'void' | 'record' | 'withdrawn';

export interface RecordedClaim {
  id: string;
  url: string;
  claim: ClaimBlock;
  resolution: ResolutionBlock | null;
  status: RecordStatus;
  decidedBy: 'automatic' | 'record' | 'judgment' | 'author';
  /** The version whose claim counts, if pinned; null when nothing is pinned. */
  pinnedVersion: number | null;
  hashOk: boolean | null;
  pinnedAt: string | null;
  /** The current claim block differs from the pinned one. */
  changed: boolean;
}

export interface TrackRecord {
  origin: string;
  title: string;
  claims: RecordedClaim[];
  summary: Summary;
}

const KEYS = ['claim', 'shape', 'probability', 'pick', 'outcomes', 'size', 'range', 'confidence', 'resolves_by', 'check', 'voids_if'] as const;
const same = (a: ClaimBlock, b: ClaimBlock) => KEYS.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

async function sha256(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return 'sha256:' + [...d].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function json(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export async function loadRecord(input: string, today: string, onProgress?: (done: number, total: number) => void): Promise<TrackRecord> {
  const origin = await findBlyg(input);
  const manifest = await json(`${origin}blyg.json`);
  const index = await json(`${origin}items/index.json`);
  const entries = index.items as { id: string; kind: string }[];
  const claims: RecordedClaim[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < entries.length) {
      const e = entries[next++];
      try {
        const doc = await json(`${origin}items/${encodeURIComponent(e.id)}.json`);
        const current = parseContent(doc.content_md ?? '');
        const pinned = (doc.changelog ?? []).filter((c: { pinned?: boolean }) => c.pinned).map((c: { version: number }) => c.version).sort((a: number, b: number) => a - b);
        if (!current.claims.length && !(doc.kind === 'withdrawn' && pinned.length)) continue;
        // The earliest pinned version that carries a claim is the one that counts.
        let base: { claim: ClaimBlock; version: number; at: string; hashOk: boolean } | null = null;
        for (const v of pinned) {
          const pin = await json(`${origin}items/${encodeURIComponent(e.id)}/v${v}.json`).catch(() => null);
          const c = pin && parseContent(pin.content_md ?? '').claims[0]?.value;
          if (c) {
            base = { claim: c, version: v, at: pin.at, hashOk: (await sha256(pin.content_md)) === pin.content_hash };
            break;
          }
        }
        const claim = base?.claim ?? current.claims[0]?.value;
        if (!claim) continue;
        const resolution = current.resolutions[0]?.value ?? null;
        const shape = claim.shape ?? 'binary';
        const status: RecordStatus = doc.kind === 'withdrawn' ? 'withdrawn'
          : resolution ? (resolution.outcome === 'void' ? 'void' : 'resolved')
          : shape === 'record' ? 'record'
          : claim.resolves_by <= today ? 'due' : 'open';
        const check = claim.check;
        claims.push({
          id: e.id,
          url: new URL(doc.page ?? `${doc.kind === 'thread' ? 't' : 'f'}/${e.id}/`, origin).href,
          claim,
          resolution,
          status,
          decidedBy: !check || (check.oracle === 'judgment' && check.by === 'author') ? 'author' : resolvesBy(check),
          pinnedVersion: base?.version ?? null,
          hashOk: base ? base.hashOk : null,
          pinnedAt: base?.at ?? null,
          changed: Boolean(base && current.claims[0] && !same(base.claim, current.claims[0].value)),
        });
      } catch {
        /* an item that can't be read is skipped */
      } finally {
        onProgress?.(++done, entries.length);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  claims.sort((a, b) => a.claim.resolves_by.localeCompare(b.claim.resolves_by));
  const summary = summarize(claims.filter((c) => c.status === 'resolved' && c.resolution).map((c) => scoreClaim(c.claim, c.resolution!)));
  return { origin, title: typeof manifest.title === 'string' ? manifest.title : origin, claims, summary };
}
