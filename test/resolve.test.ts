import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendResolution, checkAnswer, describeOutcome, status, toResolution } from '../extension/ui/core/resolve.ts';
import { parseContent } from '../extension/ui/core/parse.ts';
import { toClaim, toMarkdown } from '../extension/ui/core/compose.ts';

const pin = (id: string, v = 1) => JSON.parse(readFileSync(new URL(`./fixtures/live/caseyjr/items/${id}/v${v}.json`, import.meta.url), 'utf8')).content_md as string;
const today = '2026-11-28';

test('status: open before the date, due after, resolved once a resolution is appended', () => {
  const md = pin('08sexhmqfwe8w9tk7n47gndcdf');
  assert.equal(status(md, '2026-11-21').status, 'open');
  assert.equal(status(md, today).status, 'due');
  const { claim } = status(md, today);
  const resolved = appendResolution(md, toResolution({ kind: 'binary', outcome: false }, 'https://github.com/miguelito4/blyg-claims', today));
  assert.equal(status(resolved, today).status, 'resolved');
  assert.equal(claim!.probability, 0.85);
});

test('appending a resolution leaves the claim block and the prose exactly as they were', () => {
  const md = pin('08sexhmqfwe8w9tk7n47gndcdf');
  const next = appendResolution(md, toResolution({ kind: 'binary', outcome: true }, 'https://example.org/evidence', today));
  assert.ok(next.startsWith(md.replace(/\s+$/, '')));
  assert.deepEqual(parseContent(next).claims[0].value, parseContent(md).claims[0].value);
  assert.deepEqual(parseContent(next).resolutions[0].value, { outcome: true, resolved_at: today, evidence: ['https://example.org/evidence'] });
  assert.deepEqual(parseContent(next).issues.filter((i) => i.level === 'error'), []);
  assert.throws(() => appendResolution(next, { outcome: false }), /already resolved/);
});

test('answers are checked against the claim', () => {
  const binary = toClaim({ shape: 'binary', statement: 'x', resolvesBy: '2026-11-27', probability: 0.6 });
  assert.deepEqual(checkAnswer(binary, { kind: 'binary', outcome: true }, 'https://e.org'), []);
  assert.match(checkAnswer(binary, { kind: 'binary', outcome: true }, '')[0], /Link the evidence/);
  assert.match(checkAnswer(binary, { kind: 'void', note: '' }, '')[0], /why/);
  const semis = toClaim({ shape: 'choice', pick: 'set', size: 2, statement: 'x', resolvesBy: '2027-01-01', rankOnly: true, options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] });
  assert.deepEqual(checkAnswer(semis, { kind: 'choice', labels: ['A', 'C'] }, 'https://e.org'), []);
  assert.match(checkAnswer(semis, { kind: 'choice', labels: ['A'] }, 'https://e.org')[0], /Choose 2/);
  assert.match(checkAnswer(semis, { kind: 'choice', labels: ['A', 'Z'] }, 'https://e.org')[0], /from the list/);
});

test('a resolution for each shape parses back; the changelog note reads in words', () => {
  const md = toMarkdown(toClaim({ shape: 'choice', pick: 'one', statement: 'Who wins', resolvesBy: '2026-12-01', rankOnly: true, options: [{ label: 'Brazil' }, { label: 'Spain' }] }));
  for (const [a, words] of [
    [{ kind: 'choice', labels: ['Spain'] }, 'Spain'],
    [{ kind: 'void', note: 'The tournament was cancelled' }, "Can't be decided"],
  ] as const) {
    const r = toResolution(a, 'https://e.org', today);
    const back = parseContent(appendResolution(md, r));
    assert.equal(back.resolutions.length, 1);
    assert.equal(describeOutcome(r), words);
  }
  assert.equal(describeOutcome(toResolution({ kind: 'quantity', value: 46.2 }, 'https://e.org', today)), '46.2');
});
