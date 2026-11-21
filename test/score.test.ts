import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brierWords, scoreClaim, summarize } from '../extension/ui/core/score.ts';
import type { ClaimBlock } from '../extension/ui/core/types.ts';

const c = (o: Partial<ClaimBlock>) => ({ claim: 'x', resolves_by: '2026-11-27', ...o }) as ClaimBlock;
const near = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('yes/no: Brier is (p − outcome)²', () => {
  near(summarize([scoreClaim(c({ probability: 0.85 }), { outcome: false })]).brier, 0.7225);
  near(summarize([scoreClaim(c({ probability: 0.65 }), { outcome: true })]).brier, 0.1225);
});

test('void and record claims are not scored', () => {
  assert.equal(summarize([scoreClaim(c({ probability: 0.9 }), { outcome: 'void' })]).forecasts, 0);
  assert.equal(summarize([scoreClaim(c({ shape: 'record' }), { outcome: true })]).forecasts, 0);
});

test('a list with percentages is a bundle of yes/no forecasts, one per outcome', () => {
  const winner = c({ shape: 'choice', pick: 'one', outcomes: [{ label: 'Brazil', probability: 0.5 }, { label: 'Spain', probability: 0.3 }, { label: 'Something else', probability: 0.2 }] });
  const s = summarize([scoreClaim(winner, { outcome: 'Spain' })]);
  assert.equal(s.forecasts, 3);
  near(s.brier, (0.25 + 0.49 + 0.04) / 3);
  const semis = c({ shape: 'choice', pick: 'set', size: 2, outcomes: [{ label: 'A', probability: 0.9 }, { label: 'B', probability: 0.6 }, { label: 'C', probability: 0.5 }] });
  near(summarize([scoreClaim(semis, { outcome: ['A', 'C'] })]).brier, (0.01 + 0.36 + 0.25) / 3);
});

test('rankings are scored separately: share of the predicted top places that came true', () => {
  const ranked = c({ shape: 'choice', pick: 'one', outcomes: [{ label: 'AI right' }, { label: 'Both right' }, { label: 'Both wrong' }] });
  assert.equal(summarize([scoreClaim(ranked, { outcome: 'AI right' })]).rankingAccuracy, 1);
  assert.equal(summarize([scoreClaim(ranked, { outcome: 'Both wrong' })]).rankingAccuracy, 0);
  const top3 = c({ shape: 'choice', pick: 'order', size: 3, outcomes: [{ label: 'GER' }, { label: 'ENG' }, { label: 'BRA' }, { label: 'FRA' }] });
  near(summarize([scoreClaim(top3, { outcome: ['GER', 'BRA', 'ENG'] })]).rankingAccuracy, 1 / 3);
  const s = summarize([scoreClaim(top3, { outcome: ['GER', 'BRA', 'ENG'] })]);
  assert.equal(s.forecasts, 0, 'a ranking never enters the Brier score');
});

test('ranges: hits against the stated confidence', () => {
  const q = c({ shape: 'quantity', range: [44, 50], confidence: 0.8 });
  const s = summarize([scoreClaim(q, { outcome: 46.2 }), scoreClaim(q, { outcome: 51 })]);
  assert.equal(s.rangeHits, 0.5);
  assert.equal(s.rangeConfidence, 0.8);
});

test('calibration bins: stated against observed', () => {
  const parts = [0.8, 0.8, 0.85, 0.2].map((p, i) => scoreClaim(c({ probability: p }), { outcome: i !== 1 }));
  const s = summarize(parts);
  assert.deepEqual(s.calibration.map((b) => [b.bin, b.n]), [[2, 1], [8, 3]]);
  near(s.calibration[1].observed, 2 / 3);
  assert.equal(brierWords(0.05), 'sharp and well calibrated');
  assert.equal(brierWords(0.25), 'about as good as always saying 50%');
});
