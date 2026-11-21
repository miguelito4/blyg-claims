import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fenced, findClaim, placeNew } from '../extension/ui/blocks.ts';
import type { ClaimBlock } from '../extension/ui/core/types.ts';

const claim: ClaimBlock = { claim: 'It rains tomorrow', resolves_by: '2026-12-01', probability: 0.6 };

test('finds the claim block and its exact span', () => {
  const text = `Some prose.\n\n${fenced(claim)}\n\nMore prose.`;
  const found = findClaim(text);
  assert.ok(found);
  assert.deepEqual(found.claim, claim);
  assert.equal(text.slice(found.start, found.end), fenced(claim));
});

test('a block at the very end, and none at all', () => {
  const text = `Prose\n\n${fenced(claim)}`;
  const found = findClaim(text)!;
  assert.equal(text.slice(found.start, found.end), fenced(claim));
  assert.equal(findClaim('no claim here'), null);
});

test('a new block goes after the paragraph holding the selection, never mid-sentence', () => {
  const text = 'I think it rains tomorrow. Then sun.\n\nNext paragraph.';
  const { start, end, insert } = placeNew(text, { start: 8, end: 25 }, claim, false);
  const out = text.slice(0, start) + insert + text.slice(end);
  assert.equal(out, `I think it rains tomorrow. Then sun.\n\n${fenced(claim)}\n\nNext paragraph.`);
  assert.deepEqual(findClaim(out)?.claim, claim);
});

test('in the last paragraph, the block goes at the end, after trailing spaces are dropped', () => {
  const text = 'It rains tomorrow. Roll Tide.  \n';
  const { start, end, insert } = placeNew(text, { start: 0, end: 17 }, claim, false);
  const out = text.slice(0, start) + insert + text.slice(end);
  assert.equal(out, `It rains tomorrow. Roll Tide.\n\n${fenced(claim)}\n`);
});

test('into an empty post, the statement comes first', () => {
  const { start, end, insert } = placeNew('', { start: 0, end: 0 }, claim, true);
  assert.deepEqual([start, end], [0, 0]);
  assert.equal(insert, `It rains tomorrow\n\n${fenced(claim)}\n`);
});

test('reads the claim and resolution back out of rendered HTML', async () => {
  const { fromHtml } = await import('../extension/ui/blocks.ts');
  const html = '<p>Alabama wins.</p>\n<pre><code class="language-claim">{\n  &quot;claim&quot;: &quot;Alabama wins &amp; &lt;b&gt;more&lt;/b&gt;&quot;,\n  &quot;resolves_by&quot;: &quot;2026-11-29&quot;,\n  &quot;probability&quot;: 0.65\n}\n</code></pre>\n<pre><code class="language-resolution">{&quot;outcome&quot;: true, &quot;resolved_at&quot;: &quot;2026-11-30&quot;}\n</code></pre>';
  const got = fromHtml(html)!;
  assert.equal(got.claim.claim, 'Alabama wins & <b>more</b>');
  assert.equal(got.claim.probability, 0.65);
  assert.equal(got.resolution?.outcome, true);
  assert.equal(fromHtml('<pre><code class="language-js">let x = 1</code></pre>'), null);
  assert.equal(fromHtml('<p>no code</p>'), null);
});
