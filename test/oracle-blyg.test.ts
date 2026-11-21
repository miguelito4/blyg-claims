import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBlyg, DIRECTORY_URL } from '../src/oracles/blyg.ts';
import { compare, type BlygCheck } from '../extension/ui/core/check.ts';
import { CASEYJR, caseyjrDir, fixtureFetch } from './helpers.ts';

// A directory listing caseyjr.org/blyg and a blyg that doesn't answer.
function world() {
  const blygs = fixtureFetch(CASEYJR, caseyjrDir);
  const f = async (url: string, init?: { headers?: Record<string, string> }) => {
    if (url === DIRECTORY_URL) {
      return Response.json({ blygs: [{ origin: 'https://caseyjr.org/blyg/', listedAt: '2026-10-01' }, { origin: 'https://gone.example/', listedAt: '2026-10-01' }] });
    }
    return blygs(url, init);
  };
  return f;
}

const hackathon: BlygCheck = { oracle: 'blyg', metric: 'blygs_with_claims', among: 'directory', exclude: ['https://caseyjr.org/blyg/'], op: '>=', threshold: 2 };
const cutoff = new Date('2026-11-28T07:59:59Z'); // 23:59:59 Pacific on Nov 27

test('hackathon claim: caseyjr is excluded, the unreachable blyg is reported, the count is 0', async () => {
  const r = await evaluateBlyg(hackathon, { fetch: world(), cutoff });
  assert.equal(r.value, 0);
  assert.equal(compare(r.value, hackathon.op, hackathon.threshold), false);
  assert.deepEqual(r.unreadable.map((u) => u.source), ['https://gone.example/']);
  assert.equal(r.detail.considered, 1);
});

test('without the exclusion, caseyjr counts, with its three claim items', async () => {
  const r = await evaluateBlyg({ ...hackathon, exclude: [] }, { fetch: world(), cutoff });
  assert.equal(r.value, 1);
  const [only] = r.detail.withClaims as { origin: string; items: string[] }[];
  assert.equal(only.origin, CASEYJR);
  assert.equal(only.items.length, 3);
});

test('the cutoff is applied: before any claim existed, the count is 0', async () => {
  const r = await evaluateBlyg({ ...hackathon, exclude: [], among: [CASEYJR] }, { fetch: world(), cutoff: new Date('2026-10-01T00:00:00Z') });
  assert.equal(r.value, 0);
});

test('item_exists: a live item, and one that is not there', async () => {
  const yes = await evaluateBlyg({ oracle: 'blyg', metric: 'item_exists', item: 'https://caseyjr.org/blyg/t/08sexhmqfwe8w9tk7n47gndcdf/', op: '==', threshold: true }, { fetch: world(), cutoff });
  assert.equal(yes.value, true);
  const no = await evaluateBlyg({ oracle: 'blyg', metric: 'item_exists', item: 'https://caseyjr.org/blyg/t/doesnotexist0000000000000/', op: '==', threshold: true }, { fetch: world(), cutoff });
  assert.equal(no.value, false);
  assert.equal(no.unreadable.length, 1);
});
