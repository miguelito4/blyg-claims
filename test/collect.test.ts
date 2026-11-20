import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlygReader } from '../src/fetch.ts';
import { collect } from '../src/collect.ts';
import { CASEYJR, caseyjrDir, fixtureFetch } from './helpers.ts';

test('collect finds both live claims and their pins, and reports items it could not fetch', async () => {
  // The snapshot holds only the two claim items' documents, so the other 90
  // are 404s here: they become failures, not crashes.
  const r = await BlygReader.open(CASEYJR, { fetch: fixtureFetch(CASEYJR, caseyjrDir) });
  const j = await collect(r, new Date('2026-11-20T21:00:00Z'));
  assert.equal(j.title, 'The Foxden 🦊');
  assert.equal(j.itemsScanned, 92);
  assert.deepEqual(
    j.entries.map((e) => [e.item.id, e.pins.map((p) => p.version)]).sort(),
    [['12cq260vtzxtggp07nxdsp33m5', [1, 2]], ['36ehyke3q9ztj5hp7kknyj9sdm', [1]]],
  );
  assert.equal(j.failures.length, 90);
});
