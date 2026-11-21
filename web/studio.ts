// Publish a claim to the connected blyg through Studio's REST API: create a
// fragment, publish it, pin the published version. Pinning is what lets a
// reader prove the claim wasn't edited later.

import type { Connection } from './oauth.ts';
import { appendResolution, describeOutcome, status, type Status } from '../extension/ui/core/resolve.ts';
import type { ClaimBlock, ResolutionBlock } from '../extension/ui/core/types.ts';

async function call(c: Connection, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${c.origin}api${path}`, {
    method,
    headers: { Authorization: `Bearer ${c.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* keep the text for the error */
  }
  if (!res.ok) {
    if (res.status === 401) throw new Error('Your access has expired. Connect again; your claim is kept.');
    if (res.status === 403) throw new Error('This connection is missing a permission. Disconnect, connect again and allow access.');
    throw new Error(`${method} ${path}: ${res.status} ${(json.message as string) ?? text}`);
  }
  return json;
}

export interface Published {
  id: string;
  version: number;
  url: string;
}

export async function publishClaim(c: Connection, contentMd: string): Promise<Published> {
  const created = await call(c, 'POST', '/items', { kind: 'fragment', contentMd });
  const id = created.id as string;
  const pub = await call(c, 'POST', `/items/${encodeURIComponent(id)}/publish`, {
    expectedRevision: created.revision,
    note: 'Claim published with Blyggi',
  });
  const version = pub.version as number;
  await call(c, 'PUT', `/items/${encodeURIComponent(id)}/versions/${version}/pin`, { expectedRevision: pub.revision });
  return { id, version, url: `${c.origin}f/${id}/` };
}

export interface MyClaim {
  id: string;
  url: string;
  status: Status;
  claim: ClaimBlock;
  resolution: ResolutionBlock | null;
  created: string;
}

/** Every claim on a blyg, read from its public files. */
export async function listClaims(origin: string, today: string): Promise<MyClaim[]> {
  const index = await (await fetch(`${origin}items/index.json`)).json();
  const entries = (index.items as { id: string; kind: string }[]).filter((e) => e.kind !== 'withdrawn');
  const out: MyClaim[] = [];
  let next = 0;
  const worker = async () => {
    while (next < entries.length) {
      const e = entries[next++];
      try {
        const doc = await (await fetch(`${origin}items/${encodeURIComponent(e.id)}.json`)).json();
        const s = status(doc.content_md ?? '', today);
        if (s.claim) out.push({ id: e.id, url: new URL(doc.page ?? `${e.kind === 'thread' ? 't' : 'f'}/${e.id}/`, origin).href, status: s.status, claim: s.claim, resolution: s.resolution, created: doc.created });
      } catch {
        /* skip an item that can't be read */
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out.sort((a, b) => a.claim.resolves_by.localeCompare(b.claim.resolves_by));
}

/** Append a resolution to the claim's item as a new version, and pin it. */
export async function resolveClaim(c: Connection, id: string, r: ResolutionBlock): Promise<Published> {
  const path = `/items/${encodeURIComponent(id)}`;
  const item = await call(c, 'GET', path);
  if (item.dirty) throw new Error('This claim has unpublished edits in Studio. Publish or discard them there first, so they are not published with your resolution.');
  const contentMd = appendResolution(item.contentMd as string, r);
  const patched = await call(c, 'PATCH', path, { contentMd, expectedRevision: item.revision });
  const pub = await call(c, 'POST', `${path}/publish`, { expectedRevision: patched.revision, note: `Resolved: ${describeOutcome(r)} (Blyggi)` });
  const version = pub.version as number;
  await call(c, 'PUT', `${path}/versions/${version}/pin`, { expectedRevision: pub.revision });
  return { id, version, url: `${c.origin}${item.kind === 'thread' ? 't' : 'f'}/${id}/` };
}
