import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseContent } from '../extension/ui/core/parse.ts';

// Pins captured from caseyjr.org/blyg: items/{id}/v{n}.json.
const fixture = (name: string) => {
  const [id, v] = name.split('.');
  return JSON.parse(readFileSync(new URL(`./fixtures/live/caseyjr/items/${id}/${v}.json`, import.meta.url), 'utf8'));
};
const errors = (r: ReturnType<typeof parseContent>) => r.issues.filter((i) => i.level === 'error');
const warnings = (r: ReturnType<typeof parseContent>) => r.issues.filter((i) => i.level === 'warning');

test('live claim in a json fence (open-weights, v1)', () => {
  const r = parseContent(fixture('12cq260vtzxtggp07nxdsp33m5.v1').content_md);
  assert.equal(r.claims.length, 1);
  assert.equal(r.claims[0].fence, 'json');
  assert.equal(r.claims[0].value.probability, 0.85);
  assert.equal(r.claims[0].value.resolves_by, '2027-06-19');
  assert.deepEqual(errors(r), []);
  assert.deepEqual(warnings(r).map((w) => w.message), ['no `check`: nothing says how the outcome is decided'], 'the prose restates 0.85, which agrees with the block');
});

test('live claim in an unlabeled fence (earnings)', () => {
  const r = parseContent(fixture('36ehyke3q9ztj5hp7kknyj9sdm.v1').content_md);
  assert.equal(r.claims.length, 1);
  assert.equal(r.claims[0].fence, '');
  assert.equal(r.claims[0].value.resolves_by, '2031-03-31');
  assert.deepEqual(r.issues.map((i) => i.message), ['no `check`: nothing says how the outcome is decided']);
});

test('v1 and v2 of the open-weights claim carry the same block', () => {
  const a = parseContent(fixture('12cq260vtzxtggp07nxdsp33m5.v1').content_md).claims[0].value;
  const b = parseContent(fixture('12cq260vtzxtggp07nxdsp33m5.v2').content_md).claims[0].value;
  assert.deepEqual(a, b);
});

test('a claim fence with bad JSON is an error', () => {
  const r = parseContent('```claim\n{probability: 0.5}\n```');
  assert.equal(r.claims.length, 0);
  assert.match(errors(r)[0].message, /invalid JSON/);
});

test('ordinary JSON code is left alone', () => {
  const r = parseContent('```json\n{"name": "blyg", "version": 3}\n```\n```\nnot json\n```');
  assert.deepEqual(r, { claims: [], resolutions: [], issues: [] });
});

test('other fences never count, even with claim-shaped JSON', () => {
  const r = parseContent('```js\n{"probability": 0.5, "resolves_by": "2027-01-01"}\n```');
  assert.equal(r.claims.length, 0);
});

test('an invalid claim is reported and dropped', () => {
  const r = parseContent('```claim\n{"probability": 1, "resolves_by": "2027-02-30", "criteria": "x", "claim": "y"}\n```');
  assert.equal(r.claims.length, 0);
  assert.deepEqual(errors(r).map((e) => e.message), [
    '`probability` must be strictly between 0 and 1',
    '`resolves_by` must be a date in YYYY-MM-DD form',
  ]);
});

test('missing claim and criteria are warnings, not errors', () => {
  const r = parseContent('```claim\n{"probability": 0.6, "resolves_by": "2027-01-01"}\n```');
  assert.equal(r.claims.length, 1);
  assert.equal(warnings(r).length, 3, 'no claim, no criteria, no check');
});

test('two claim blocks in one item is an error', () => {
  const block = '```claim\n{"probability": 0.6, "resolves_by": "2027-01-01", "claim": "a", "criteria": "b"}\n```\n';
  const r = parseContent(block + block);
  assert.match(errors(r)[0].message, /one claim per item/);
});

test('resolution blocks: true, false, void; json fence with outcome', () => {
  for (const outcome of ['true', 'false', '"void"']) {
    const r = parseContent(`\`\`\`resolution\n{"outcome": ${outcome}, "evidence": ["https://example.com"]}\n\`\`\``);
    assert.equal(r.resolutions.length, 1, outcome);
    assert.deepEqual(r.issues, []);
  }
  assert.equal(parseContent('```json\n{"outcome": false, "evidence": ["x"]}\n```').resolutions.length, 1);
  assert.match(errors(parseContent('```resolution\n{"outcome": "yes"}\n```'))[0].message, /outcome/);
});

test('prose that disagrees with the block is a warning', () => {
  const r = parseContent('Probability: 80%\n\n```claim\n{"probability": 0.85, "resolves_by": "2027-01-01", "claim": "a", "criteria": "b"}\n```');
  assert.equal(r.claims.length, 1);
  assert.ok(warnings(r).some((w) => /prose says probability 80%/.test(w.message)));
});

test('a claim block quoted inside a longer fence is an example, not a claim', () => {
  const r = parseContent('````markdown\n```claim\n{"probability": 0.6, "resolves_by": "2027-01-01"}\n```\n````');
  assert.equal(r.claims.length, 0);
});

