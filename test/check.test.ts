import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCheck, compare, resolvesBy, type Check } from '../extension/ui/core/check.ts';
import { parseContent } from '../extension/ui/core/parse.ts';

// The hackathon-week claim, written as a check.
const hackathon: Check = {
  oracle: 'blyg',
  metric: 'blygs_with_claims',
  among: 'directory',
  exclude: ['https://caseyjr.org/blyg/'],
  op: '>=',
  threshold: 2,
};

// The earnings claim, written as a check, with its own fallback.
const earnings: Check = {
  oracle: 'data_series',
  provider: 'fred',
  value: 'LEU0254530200Q@2030-10-01 / mean(CPIAUCSL@2030-10-01..2030-12-01)',
  as_of: '2031-03-31',
  op: '<=',
  threshold: 4.3,
  fallback: { oracle: 'data_series', provider: 'fred', value: 'LEU0254530200Q@2030-07-01 / mean(CPIAUCSL@2030-07-01..2030-09-01)', as_of: '2031-03-31', op: '<=', threshold: 4.3 },
};

test('valid checks for each oracle', () => {
  assert.deepEqual(checkCheck(hackathon), []);
  assert.deepEqual(checkCheck(earnings), []);
  assert.deepEqual(checkCheck({ oracle: 'web_data', url: 'https://example.org/stats.json', pointer: '/data/0/value', op: '>', threshold: 100 }), []);
  assert.deepEqual(checkCheck({ oracle: 'judgment', by: 'author', evidence: 'https://lmarena.ai/leaderboard/text' }), []);
  assert.deepEqual(checkCheck({ oracle: 'judgment', by: ['https://venkateshrao.com/blyg/'] }), []);
});

test('oracle names are a closed list: no free text', () => {
  assert.match(checkCheck({ ...hackathon, oracle: 'Federal Reserve of St. Louis' })[0], /must be one of blyg, data_series, record, web_data, judgment/);
  assert.match(checkCheck({ ...hackathon, oracle: 'fred' })[0], /must be one of/, 'a provider is not a kind of source');
  assert.match(checkCheck({ ...earnings, provider: 'Federal Reserve of St. Louis' })[0], /provider/);
});

test('each oracle checks its own parameters', () => {
  assert.match(checkCheck({ ...hackathon, metric: 'vibes' })[0], /metric/);
  assert.match(checkCheck({ oracle: 'blyg', metric: 'item_exists', op: '==', threshold: true })[0], /item/);
  assert.match(checkCheck({ ...earnings, value: 'inflation went up' })[0], /SERIES@DATE/);
  assert.match(checkCheck({ ...earnings, as_of: 'soon' })[0], /as_of/);
  assert.match(checkCheck({ oracle: 'web_data', url: 'ftp://x', pointer: 'data', op: '>', threshold: 1 }).join(' '), /url.*pointer/s);
  assert.match(checkCheck({ oracle: 'judgment', by: 'everyone' })[0], /by/);
});

test('a comparison is optional ("how much" claims), but op and threshold come together; fallbacks are checked too', () => {
  assert.deepEqual(checkCheck({ oracle: 'web_data', url: 'https://example.org/x.json', pointer: '/n' }), []);
  assert.match(checkCheck({ oracle: 'web_data', url: 'https://example.org/x.json', pointer: '/n', op: '>' })[0], /threshold/);
  assert.match(checkCheck({ ...earnings, fallback: { oracle: 'data_series', provider: 'fred', value: 'X@2030-01-01', as_of: 'nope', op: '<=', threshold: 1 } })[0], /check\.fallback\.as_of/);
});

test('records', () => {
  assert.deepEqual(checkCheck({ oracle: 'record', registry: 'arxiv', id: '2511.00001', event: 'a revised version withdraws the proof' }), []);
  assert.match(checkCheck({ oracle: 'record', registry: 'twitter', id: 'x', event: 'y' })[0], /registry/);
  assert.equal(resolvesBy({ oracle: 'record', registry: 'congress', id: '119/hr/1', event: 'became law' }), 'record');
});

test('automatic versus judgment', () => {
  assert.equal(resolvesBy(hackathon), 'automatic');
  assert.equal(resolvesBy({ oracle: 'judgment', by: 'author' }), 'judgment');
});

test('compare', () => {
  assert.equal(compare(2, '>=', 2), true);
  assert.equal(compare(1, '>=', 2), false);
  assert.equal(compare(4.29, '<=', 4.3), true);
  assert.equal(compare(true, '==', true), true);
  assert.equal(compare('a', '!=', 'b'), true);
  assert.throws(() => compare('3', '>', 2), /needs numbers/);
});

test('a claim block with a check parses clean; a bad check is an error', () => {
  const block = (check: unknown) => `\`\`\`claim\n${JSON.stringify({ claim: 'a', criteria: 'b', probability: 0.85, resolves_by: '2026-11-27', check })}\n\`\`\``;
  assert.deepEqual(parseContent(block(hackathon)).issues, []);
  const bad = parseContent(block({ oracle: 'blyg', metric: 'blygs_with_claims', op: '>=' }));
  assert.equal(bad.claims.length, 0);
  assert.match(bad.issues[0].message, /threshold/);
});
