import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mistakes, toClaim, toMarkdown, withCatchAll, type Draft } from '../extension/ui/core/compose.ts';
import { parseContent } from '../extension/ui/core/parse.ts';

const today = '2026-11-21';

const unemployment: Draft = {
  shape: 'binary',
  statement: 'US unemployment rises above 5% by the end of 2027',
  resolvesBy: '2028-03-01',
  probability: 0.3,
  check: { oracle: 'data_series', provider: 'fred', value: 'UNRATE@2027-12-01', as_of: '2028-03-01', op: '>', threshold: 5 },
};

test('a draft becomes a claim that parses cleanly, with criteria written in words', () => {
  const claim = toClaim(unemployment);
  assert.equal(claim.probability, 0.3);
  assert.equal(claim.shape, undefined, 'binary stays implicit, like the claims written before shapes');
  assert.equal(claim.criteria, 'UNRATE@2027-12-01 on FRED, as published on 2028-03-01, is above 5.');
  const r = parseContent(toMarkdown(claim));
  assert.equal(r.claims.length, 1);
  assert.deepEqual(r.issues, []);
});

test('choice drafts: percentages become probabilities; rank-only and order drop them', () => {
  const winner = toClaim({ shape: 'choice', pick: 'one', statement: 'Who wins the 2030 World Cup', resolvesBy: '2030-07-22',
    options: withCatchAll([{ label: 'Brazil', percent: 30 }, { label: 'Spain', percent: 25 }]).map((o) => (o.percent === undefined ? { ...o, percent: 45 } : o)),
    check: { oracle: 'judgment', by: 'author' } });
  assert.deepEqual(winner.outcomes, [{ label: 'Brazil', probability: 0.3 }, { label: 'Spain', probability: 0.25 }, { label: 'Something else', probability: 0.45 }]);
  assert.deepEqual(parseContent(toMarkdown(winner)).issues, []);
  const ranked = toClaim({ shape: 'choice', pick: 'one', rankOnly: true, statement: 'x', resolvesBy: '2027-06-30', options: [{ label: 'A', percent: 50 }, { label: 'B', percent: 50 }] });
  assert.deepEqual(ranked.outcomes, [{ label: 'A' }, { label: 'B' }]);
});

test('just record it needs no check and no probability', () => {
  const claim = toClaim({ shape: 'record', statement: 'Something interesting happens at the hackathon', resolvesBy: '2026-11-27' });
  assert.deepEqual(Object.keys(claim).sort(), ['claim', 'resolves_by', 'shape']);
  assert.deepEqual(mistakes({ shape: 'record', statement: 'x', resolvesBy: '2026-11-27' }, { today }), []);
});

test('mistake: it is already true', () => {
  const m = mistakes({ ...unemployment, check: { ...unemployment.check!, threshold: 4 } as Draft['check'] }, { today, latest: { value: 4.4, period: 'Oct 2026' }, frequency: 'monthly' });
  assert.match(m.map((x) => x.message).join('\n'), /already true: the latest reading is 4.4 \(Oct 2026\)/);
});

test('mistake: the data will not exist by the date', () => {
  const annual: Draft = {
    shape: 'binary', statement: 'World extreme poverty falls below 8% in 2028', resolvesBy: '2028-12-31', probability: 0.4,
    check: { oracle: 'data_series', provider: 'worldbank', value: 'SI.POV.DDAY@2028-01-01', as_of: '2028-12-31', op: '<', threshold: 8 },
  };
  const m = mistakes(annual, { today, latest: { value: 9.9, period: '2022' }, frequency: 'annual' });
  const stop = m.find((x) => x.level === 'stop');
  assert.match(stop!.message, /Data for 2028-01-01 is usually published around 2030-02-05, after your date/);
});

test('mistake: a number that has to be exactly equal', () => {
  const m = mistakes({ ...unemployment, check: { ...unemployment.check!, op: '==' } as Draft['check'] }, { today });
  assert.match(m.map((x) => x.message).join('\n'), /exactly 5/);
});

test('the obvious ones stop publishing: past date, no statement, no way to know, bad percentages', () => {
  const m = mistakes({ shape: 'choice', pick: 'one', statement: '', resolvesBy: '2025-01-01', options: [{ label: 'A', percent: 60 }, { label: 'B', percent: 60 }] }, { today });
  const stops = m.filter((x) => x.level === 'stop').map((x) => x.message);
  assert.ok(stops.some((s) => /Say what you think/.test(s)));
  assert.ok(stops.some((s) => /already passed/.test(s)));
  assert.ok(stops.some((s) => /how we will know/.test(s)));
  assert.ok(stops.some((s) => /add up to 120%; they should add up to 100%/.test(s)));
});

test('vague words are flagged, not blocked', () => {
  const m = mistakes({ ...unemployment, statement: 'Unemployment rises significantly soon' }, { today });
  const w = m.find((x) => /means different things/.test(x.message));
  assert.equal(w?.level, 'warn');
});
