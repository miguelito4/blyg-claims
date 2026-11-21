// Publish a claim to the connected blyg through Studio's REST API: create a
// fragment, publish it, pin the published version. Pinning is what lets a
// reader prove the claim wasn't edited later.

import type { Connection } from './oauth.ts';

async function call(c: Connection, method: string, path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${c.origin}api${path}`, {
    method,
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
    note: 'Claim published with blyg-claims',
  });
  const version = pub.version as number;
  await call(c, 'PUT', `/items/${encodeURIComponent(id)}/versions/${version}/pin`, { expectedRevision: pub.revision });
  return { id, version, url: `${c.origin}f/${id}/` };
}
