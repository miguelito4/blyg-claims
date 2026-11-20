import { readFile } from 'node:fs/promises';
import type { FetchLike } from '../src/fetch.ts';

/**
 * A fetch that serves a fixture directory as if it were a blyg: a URL under
 * `base` maps to the same path under `dir`; anything else is a 404. Records
 * every URL requested.
 */
export function fixtureFetch(base: string, dir: URL): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    if (!url.startsWith(base)) return new Response('not found', { status: 404 });
    try {
      const body = await readFile(new URL(url.slice(base.length), dir));
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  };
  return Object.assign(f, { calls });
}

export const CASEYJR = 'https://caseyjr.org/blyg/';
export const caseyjrDir = new URL('./fixtures/live/caseyjr/', import.meta.url);
