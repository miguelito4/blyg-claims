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
  const lag = m.find((x) => /Data for/.test(x.message));
  assert.equal(lag?.level, 'warn', 'a suggestion, not a block');
  assert.match(lag!.message, /Data for 2028-01-01 is usually published around 2030-02-05, after your date/);
});

test('mistake: a number that has to be exactly equal', () => {
  const m = mistakes({ ...unemployment, check: { ...unemployment.check!, op: '==' } as Draft['check'] }, { today });
  assert.match(m.map((x) => x.message).join('\n'), /exactly 5/);
});

test('only what makes a claim meaningless stops publishing: no statement, past date, bad percentages', () => {
  const m = mistakes({ shape: 'choice', pick: 'one', statement: '', resolvesBy: '2025-01-01', options: [{ label: 'A', percent: 60 }, { label: 'B', percent: 60 }] }, { today });
  const stops = m.filter((x) => x.level === 'stop').map((x) => x.message);
  assert.ok(stops.some((s) => /Say what you think/.test(s)));
  assert.ok(stops.some((s) => /already passed/.test(s)));
  assert.ok(!stops.some((s) => /decided/.test(s)), 'no source is a suggestion, not a block');
  assert.ok(m.some((x) => x.level === 'warn' && /decide it yourself/.test(x.message)));
  assert.ok(stops.some((s) => /add up to 120%; they should add up to 100%/.test(s)));
});

test('vague words are flagged, not blocked', () => {
  const m = mistakes({ ...unemployment, statement: 'Unemployment rises significantly soon' }, { today });
  const w = m.find((x) => /means different things/.test(x.message));
  assert.equal(w?.level, 'warn');
});

test('every publisher and register the schema allows has a name, in the core and on the page', async () => {
  const { PROVIDERS, REGISTRIES } = await import('../extension/ui/core/check.ts');
  const { NAMED } = await import('../extension/ui/core/compose.ts');
  const { PUBLISHERS, REGISTERS } = await import('../extension/ui/core/sources.ts');
  assert.deepEqual([...PROVIDERS].sort(), [...NAMED.providers].sort());
  assert.deepEqual([...PROVIDERS].sort(), Object.keys(PUBLISHERS).sort());
  assert.deepEqual([...REGISTRIES].sort(), [...NAMED.registries].sort());
  assert.deepEqual([...REGISTRIES].sort(), Object.keys(REGISTERS).sort());
});

test('a claim block opens back into the answers that made it', async () => {
  const { fromClaim } = await import('../extension/ui/core/compose.ts');
  const drafts: Draft[] = [
    { shape: 'binary', statement: 'Alabama wins this year\'s Iron Bowl', resolvesBy: '2026-11-29', probability: 0.65, check: { oracle: 'judgment', by: 'author' } },
    { shape: 'choice', pick: 'one', statement: 'Who wins the 2027 Cricket World Cup?', resolvesBy: '2027-11-30', options: [{ label: 'India', percent: 30 }, { label: 'Australia', percent: 25 }, { label: 'Something else', percent: 45 }] },
    { shape: 'choice', pick: 'order', size: 2, statement: 'Top two', resolvesBy: '2027-05-31', options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
    { shape: 'quantity', statement: 'Polio cases in 2027', resolvesBy: '2028-03-31', low: 0, high: 60, unit: 'cases', confidence: 0.8,
      check: { oracle: 'data_series', provider: 'who', value: 'WPV1@2027-01-01', as_of: '2028-03-31' } },
    { shape: 'record', statement: 'Remote work will look like a mistake by 2035', resolvesBy: '2035-12-31', voidsIf: 'nothing' },
  ];
  for (const d of drafts) {
    const claim = toClaim(d);
    assert.deepEqual(toClaim(fromClaim(claim)), claim, d.statement);
  }
});
