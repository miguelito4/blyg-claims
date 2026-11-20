// Read a blyg's public surface: manifest, archive index, item documents and
// pins. Polite (spec §12.3): identifying User-Agent, limited concurrency,
// Retry-After honored on 429/503, exponential backoff on failure.
//
// The optional cache mirrors the protocol's own layout under
// <cacheDir>/<host><path>/, so a cache directory doubles as a fixture. Pins are
// immutable (§8) and cached forever; an item document is reused while the
// index still lists the cached version; the manifest and index are always
// fetched.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  indexUrl, itemUrl, pinUrl,
  type ArchiveIndex, type IndexEntry, type ItemDocument, type Manifest, type Pin,
} from '../extension/ui/core/protocol.ts';

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export interface ReaderOptions {
  fetch?: FetchLike;
  cacheDir?: string | null;
  concurrency?: number;
  userAgent?: string;
  retries?: number;
  /** Milliseconds; tests set 0. */
  backoff?: number;
  log?: (message: string) => void;
}

export class FetchError extends Error {
  url: string;
  status: number;
  constructor(url: string, status: number, message: string) {
    super(message);
    this.url = url;
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** §12.1 step 1: strip query and fragment, end the path in `/`. */
export function normalize(input: string): string {
  const u = new URL(input);
  u.search = '';
  u.hash = '';
  if (u.pathname.endsWith('/blyg.json')) u.pathname = u.pathname.slice(0, -'blyg.json'.length);
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  return u.href;
}

export class BlygReader {
  readonly origin: string;
  readonly manifest: Manifest;
  private opts: Required<Omit<ReaderOptions, 'cacheDir'>> & { cacheDir: string | null };

  private constructor(origin: string, manifest: Manifest, opts: BlygReader['opts']) {
    this.origin = origin;
    this.manifest = manifest;
    this.opts = opts;
  }

  /**
   * Resolve a URL to a blyg (§12.1 steps 1, 2 and 5): `{candidate}blyg.json`,
   * then `/blyg/blyg.json` and `/blyg.json` at the host root. Feed and HTML
   * discovery are not implemented; pass the blyg's own address.
   */
  static async open(input: string, options: ReaderOptions = {}): Promise<BlygReader> {
    const opts = {
      fetch: options.fetch ?? ((url, init) => fetch(url, init)),
      cacheDir: options.cacheDir ?? null,
      concurrency: options.concurrency ?? 4,
      userAgent: options.userAgent ?? 'blyg-claims/0.0 (+https://github.com/miguelito4/blyg-claims)',
      retries: options.retries ?? 3,
      backoff: options.backoff ?? 500,
      log: options.log ?? (() => {}),
    };
    const candidate = normalize(input);
    const root = new URL('/', candidate).href;
    const probes = [...new Set([candidate, `${root}blyg/`, root])];
    for (const origin of probes) {
      const manifest = await getJson<Manifest>(opts, `${origin}blyg.json`, true).catch(() => null);
      if (manifest && typeof manifest === 'object' && typeof manifest.blyg === 'string') {
        return new BlygReader(origin, manifest, opts);
      }
    }
    throw new Error(`no blyg manifest found for ${input} (tried ${probes.map((p) => `${p}blyg.json`).join(', ')})`);
  }

  async index(): Promise<IndexEntry[]> {
    const doc = await getJson<ArchiveIndex>(this.opts, indexUrl(this.origin, this.manifest));
    if (!doc || !Array.isArray(doc.items)) throw new Error(`${this.origin}: archive index has no items array`);
    return doc.items;
  }

  /** The item document, from cache when it is at `version`. */
  async item(id: string, version?: number): Promise<ItemDocument> {
    const url = itemUrl(this.origin, this.manifest, id);
    if (version !== undefined) {
      const cached = await this.readCache<ItemDocument>(url);
      if (cached?.version === version) return cached;
    }
    const doc = await getJson<ItemDocument>(this.opts, url);
    await this.writeCache(url, doc);
    return doc;
  }

  /** A pinned version, or null when the origin answers 404 (not pinned). */
  async pin(id: string, n: number): Promise<Pin | null> {
    const url = pinUrl(this.origin, this.manifest, id, n);
    const cached = await this.readCache<Pin>(url);
    if (cached) return cached;
    try {
      const doc = await getJson<Pin>(this.opts, url);
      await this.writeCache(url, doc);
      return doc;
    } catch (e) {
      if (e instanceof FetchError && e.status === 404) return null;
      throw e;
    }
  }

  /** Run `task` over `items`, at most `concurrency` at a time, in input order. */
  async map<T, R>(items: T[], task: (item: T) => Promise<R>): Promise<R[]> {
    const out = new Array<R>(items.length);
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await task(items[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.opts.concurrency, items.length) }, worker));
    return out;
  }

  private cachePath(url: string): string | null {
    if (!this.opts.cacheDir) return null;
    const u = new URL(url);
    if (u.search) return null;
    return join(this.opts.cacheDir, u.host, decodeURIComponent(u.pathname));
  }

  private async readCache<T>(url: string): Promise<T | null> {
    const path = this.cachePath(url);
    if (!path) return null;
    try {
      return JSON.parse(await readFile(path, 'utf8')) as T;
    } catch {
      return null;
    }
  }

  private async writeCache(url: string, doc: unknown): Promise<void> {
    const path = this.cachePath(url);
    if (!path) return;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`);
  }
}

async function getJson<T>(opts: BlygReader['opts'], url: string, quiet = false): Promise<T> {
  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await opts.fetch(url, { headers: { 'User-Agent': opts.userAgent, Accept: 'application/json' } });
    } catch (e) {
      if (attempt++ >= opts.retries) throw e;
      await sleep(opts.backoff * 2 ** (attempt - 1));
      continue;
    }
    if ((res.status === 429 || res.status === 503) && attempt < opts.retries) {
      attempt++;
      const after = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(after) && after > 0 ? after * 1000 : opts.backoff * 2 ** (attempt - 1);
      opts.log(`${res.status} from ${url}; retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      if (!quiet) opts.log(`${res.status} ${url}`);
      throw new FetchError(url, res.status, `${res.status} for ${url}`);
    }
    // Parse-success is the test, not Content-Type (§12.1 step 2).
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new FetchError(url, res.status, `not JSON: ${url}`);
    }
  }
}
