#!/usr/bin/env node
// blyg-claims collect <blyg url>... [--cache dir] [--no-cache]
//   Prints, as JSON, every claim item on each blyg with its pinned versions.
//   Scoring (`blyg-claims score`) comes next.

import { BlygReader } from './fetch.ts';
import { collect } from './collect.ts';
import { parseContent } from '../extension/ui/core/parse.ts';

const USAGE = 'usage: blyg-claims collect <blyg url>... [--cache dir] [--no-cache]';

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command !== 'collect') {
    console.error(USAGE);
    return 2;
  }
  let cacheDir: string | null = '.cache';
  const urls: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--cache') cacheDir = rest[++i];
    else if (rest[i] === '--no-cache') cacheDir = null;
    else urls.push(rest[i]);
  }
  if (!urls.length) {
    console.error(USAGE);
    return 2;
  }
  const out = [];
  for (const url of urls) {
    const reader = await BlygReader.open(url, { cacheDir, log: (m) => console.error(m) });
    const journal = await collect(reader);
    out.push({
      origin: journal.origin,
      title: journal.title,
      fetchedAt: journal.fetchedAt,
      itemsScanned: journal.itemsScanned,
      failures: journal.failures,
      claims: journal.entries.map(({ item, pins }) => ({
        id: item.id,
        kind: item.kind,
        version: item.version,
        page: item.page ? new URL(item.page, journal.origin).href : null,
        current: parseContent(item.content_md),
        pins: pins.map((p) => ({ version: p.version, at: p.at, note: p.note, content_hash: p.content_hash })),
      })),
    });
  }
  console.log(JSON.stringify(out, null, 2));
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
