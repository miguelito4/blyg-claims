import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlygReader, normalize } from '../src/fetch.ts';
import { CASEYJR, caseyjrDir, fixtureFetch } from './helpers.ts';

const OW = '12cq260vtzxtggp07nxdsp33m5';

test('normalize: strips query, fragment and a trailing blyg.json; ends in /', () => {
  assert.equal(normalize('https://caseyjr.org/blyg'), CASEYJR);
  assert.equal(normalize('https://caseyjr.org/blyg/?x=1#y'), CASEYJR);
  assert.equal(normalize('https://caseyjr.org/blyg/blyg.json'), CASEYJR);
});

test('open: resolves the blyg from its own address', async () => {
  const r = await BlygReader.open('https://caseyjr.org/blyg', { fetch: fixtureFetch(CASEYJR, caseyjrDir) });
  assert.equal(r.origin, CASEYJR);
  assert.equal(r.manifest.title, 'The Foxden 🦊');
});

test('open: finds a /blyg/ mount from the host root (§12.1 step 5)', async () => {
  const f = fixtureFetch(CASEYJR, caseyjrDir);
  const r = await BlygReader.open('https://caseyjr.org/', { fetch: f });
  assert.equal(r.origin, CASEYJR);
  assert.deepEqual(f.calls, ['https://caseyjr.org/blyg.json', 'https://caseyjr.org/blyg/blyg.json']);
});

test('open: no manifest anywhere is an error naming what was tried', async () => {
  await assert.rejects(BlygReader.open('https://example.com/x', { fetch: fixtureFetch(CASEYJR, caseyjrDir) }), /no blyg manifest found/);
});

test('index, item and pins', async () => {
  const r = await BlygReader.open(CASEYJR, { fetch: fixtureFetch(CASEYJR, caseyjrDir) });
  const index = await r.index();
  assert.equal(index.length, 93);
  const item = await r.item(OW);
  assert.equal(item.version, 2);
  assert.equal(item.kind, 'thread');
  assert.equal((await r.pin(OW, 1))?.at, '2026-10-13T15:04:27Z');
  assert.equal(await r.pin(OW, 3), null, 'an unpinned version is a 404, not an error');
});

test('cache: pins are fetched once; items are reused while the version matches', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'blyg-claims-'));
  try {
    const f = fixtureFetch(CASEYJR, caseyjrDir);
    const r = await BlygReader.open(CASEYJR, { fetch: f, cacheDir });
    await r.pin(OW, 1);
    await r.item(OW);
    const before = f.calls.length;
    await r.pin(OW, 1);
    await r.item(OW, 2);
    assert.equal(f.calls.length, before, 'served from cache');
    await r.item(OW, 3);
    assert.equal(f.calls.length, before + 1, 'a newer version in the index refetches');
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test('429 with Retry-After is retried, then succeeds', async () => {
  const inner = fixtureFetch(CASEYJR, caseyjrDir);
  let refused = 0;
  const f = async (url: string, init?: { headers?: Record<string, string> }) => {
    if (url.endsWith('index.json') && refused++ < 2) return new Response('slow down', { status: 429, headers: { 'retry-after': '0' } });
    return inner(url, init);
  };
  const r = await BlygReader.open(CASEYJR, { fetch: f, backoff: 0 });
  assert.equal((await r.index()).length, 93);
  assert.equal(refused, 3);
});

test('requests carry an identifying User-Agent (§12.3)', async () => {
  const seen: string[] = [];
  const inner = fixtureFetch(CASEYJR, caseyjrDir);
  const f = async (url: string, init?: { headers?: Record<string, string> }) => {
    seen.push(init?.headers?.['User-Agent'] ?? '');
    return inner(url, init);
  };
  await BlygReader.open(CASEYJR, { fetch: f });
  assert.match(seen[0], /^blyg-claims\//);
});

test('map: bounded concurrency, results in input order', async () => {
  const r = await BlygReader.open(CASEYJR, { fetch: fixtureFetch(CASEYJR, caseyjrDir), concurrency: 2 });
  let live = 0;
  let peak = 0;
  const out = await r.map([5, 1, 3, 2], async (n) => {
    peak = Math.max(peak, ++live);
    await new Promise((res) => setTimeout(res, n));
    live--;
    return n * 10;
  });
  assert.deepEqual(out, [50, 10, 30, 20]);
  assert.equal(peak, 2);
});
