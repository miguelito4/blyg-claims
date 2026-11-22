// The parts of the Blygger protocol (0.4) the scorer reads. Members it doesn't
// use are left out; readers ignore unknown members (spec §13.1 rule 4).

export interface Manifest {
  blyg: string;
  site?: string;
  title?: string;
  generator?: string;
  /** Archive index location, origin-relative or absolute (§6.1). Default `items/index.json`. */
  items?: string;
  /** RFC 6570 level-1 templates (§6.1). Defaults `items/{id}.json` and `items/{id}/v{n}.json`. */
  item?: string;
  pin?: string;
  updated?: string;
  [extra: string]: unknown;
}

export interface IndexEntry {
  id: string;
  kind: string;
  created: string;
  updated: string;
  version: number;
}

export interface ArchiveIndex {
  updated: string;
  items: IndexEntry[];
}

export interface ChangelogEntry {
  version: number;
  at: string;
  note: string | null;
  pinned?: boolean;
}

/** `items/{id}.json` (§5): the latest version, with the whole changelog. */
export interface ItemDocument {
  blyg: string;
  id: string;
  /** `fragment`, `thread`, or `withdrawn` for an endcap (§9). */
  kind: string;
  origin: string;
  page?: string;
  created: string;
  updated: string;
  version: number;
  content_md: string;
  content_hash: string;
  changelog: ChangelogEntry[];
  stub_of?: unknown;
  forked_from?: unknown;
  links?: unknown[];
  [extra: string]: unknown;
}

/** `items/{id}/v{n}.json` (§8): one pinned version, available forever. */
export interface Pin {
  blyg: string;
  id: string;
  kind: string;
  version: number;
  at: string;
  note: string | null;
  pinned: true;
  origin: string;
  content_md: string;
  content_hash: string;
  [extra: string]: unknown;
}

/** `{origin}` ends in `/`. Templates expand per §6.1; relative values resolve against the origin. */
export function itemUrl(origin: string, manifest: Manifest, id: string): string {
  return new URL((manifest.item ?? 'items/{id}.json').replaceAll('{id}', encodeURIComponent(id)), origin).href;
}

export function pinUrl(origin: string, manifest: Manifest, id: string, n: number): string {
  const t = manifest.pin ?? 'items/{id}/v{n}.json';
  return new URL(t.replaceAll('{id}', encodeURIComponent(id)).replaceAll('{n}', String(n)), origin).href;
}

export function indexUrl(origin: string, manifest: Manifest): string {
  return new URL(manifest.items ?? 'items/index.json', origin).href;
}
