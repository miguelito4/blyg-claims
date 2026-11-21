import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseContent } from '../extension/ui/core/parse.ts';
import { scoring, SOMETHING_ELSE } from '../extension/ui/core/shapes.ts';

const block = (o: Record<string, unknown>) =>
  parseContent(`\`\`\`claim\n${JSON.stringify({ claim: 'c', criteria: 'k', resolves_by: '2026-07-19', check: { oracle: 'judgment', by: 'author' }, ...o })}\n\`\`\``);
const errs = (r: ReturnType<typeof parseContent>) => r.issues.filter((i) => i.level === 'error').map((i) => i.message);
const teams = (...xs: string[]) => xs.map((label) => ({ label }));

test('a claim with no shape and a probability is binary, as before', () => {
  const r = block({ probability: 0.85 });
  assert.equal(r.claims.length, 1);
  assert.equal(scoring(r.claims[0].value), 'probability');
});

test('World Cup, pick the winner, with percentages adding to 100%', () => {
  const r = block({ shape: 'choice', pick: 'one', outcomes: [{ label: 'Brazil', probability: 0.3 }, { label: 'Germany', probability: 0.25 }, { label: 'England', probability: 0.2 }, { label: SOMETHING_ELSE, probability: 0.25 }] });
  assert.deepEqual(r.issues, []);
  assert.equal(scoring(r.claims[0].value), 'probability');
});

test('percentages that do not add up are caught, in words', () => {
  const r = block({ shape: 'choice', pick: 'one', outcomes: [{ label: 'Brazil', probability: 0.6 }, { label: 'Germany', probability: 0.6 }, { label: SOMETHING_ELSE, probability: 0.1 }] });
  assert.deepEqual(errs(r), ['the percentages add up to 130%, not 100%']);
});

test('pick the winner with no catch-all warns that it may not resolve', () => {
  const r = block({ shape: 'choice', pick: 'one', outcomes: teams('Brazil', 'Germany') });
  assert.equal(r.claims.length, 1);
  assert.match(r.issues[0].message, /Something else/);
});

test('World Cup, who makes the semifinals: a set of 4, chances adding to 400%', () => {
  const r = block({ shape: 'choice', pick: 'set', size: 4, outcomes: [
    { label: 'Germany', probability: 0.8 }, { label: 'England', probability: 0.7 }, { label: 'Brazil', probability: 0.9 },
    { label: 'France', probability: 0.6 }, { label: 'Argentina', probability: 0.5 }, { label: 'Spain', probability: 0.5 },
  ] });
  assert.deepEqual(errs(r), []);
  assert.equal(scoring(r.claims[0].value), 'probability');
  assert.match(errs(block({ shape: 'choice', pick: 'set', size: 4, outcomes: [{ label: 'A', probability: 0.9 }, { label: 'B', probability: 0.9 }, { label: 'C', probability: 0.9 }, { label: 'D', probability: 0.9 }, { label: 'E', probability: 0.9 }] }))[0], /should add up to 400%/);
});

test('World Cup, top three in order: a ranking, no percentages allowed', () => {
  const r = block({ shape: 'choice', pick: 'order', size: 3, outcomes: teams('Germany', 'England', 'Brazil', 'France', SOMETHING_ELSE) });
  assert.deepEqual(errs(r), []);
  assert.equal(scoring(r.claims[0].value), 'ranking');
  assert.match(errs(block({ shape: 'choice', pick: 'order', size: 2, outcomes: [{ label: 'A', probability: 0.5 }, { label: 'B', probability: 0.5 }, { label: 'C', probability: 0 }] }))[0], /ranking/);
});

test("Venkat's claim: four ranked outcomes, no probability, and what would void it", () => {
  const r = block({
    shape: 'choice', pick: 'one',
    outcomes: teams('AI proof holds, human proof flawed', 'Both hold', 'Both flawed', 'Human proof holds, AI proof flawed'),
    voids_if: 'Neither proof is assessed by the date, or the question becomes moot',
  });
  assert.equal(r.claims.length, 1);
  assert.equal(scoring(r.claims[0].value), 'ranking');
  assert.deepEqual(errs(r), []);
});

test('set and order need a size smaller than the list; labels must be distinct', () => {
  assert.match(errs(block({ shape: 'choice', pick: 'set', outcomes: teams('A', 'B') }))[0], /size/);
  assert.match(errs(block({ shape: 'choice', pick: 'one', outcomes: teams('A', 'a', SOMETHING_ELSE) }))[0], /same label/);
});

test('how much: a range and a confidence', () => {
  const r = block({ shape: 'quantity', range: [44, 50], confidence: 0.8, unit: 'USD trillion' });
  assert.deepEqual(errs(r), []);
  assert.equal(scoring(r.claims[0].value), 'interval');
  assert.match(errs(block({ shape: 'quantity', range: [50, 44], confidence: 0.8 }))[0], /low below high/);
});

test('just record it: no probability, no check, never scored, no nagging', () => {
  const r = parseContent('```claim\n{"shape": "record", "claim": "Something interesting happens", "resolves_by": "2027-01-01"}\n```');
  assert.equal(r.claims.length, 1);
  assert.equal(scoring(r.claims[0].value), 'none');
  assert.deepEqual(r.issues.filter((i) => /check|criteria/.test(i.message)), []);
});

test('a shaped claim in a json fence is recognized; an unknown shape is an error', () => {
  assert.equal(parseContent('```json\n{"shape": "record", "claim": "x", "resolves_by": "2027-01-01"}\n```').claims.length, 1);
  assert.match(errs(block({ shape: 'vibes' }))[0], /shape/);
});
