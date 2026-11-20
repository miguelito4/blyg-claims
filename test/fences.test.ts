import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFences } from '../extension/ui/core/fences.ts';

test('backtick and tilde fences, with and without info strings', () => {
  const f = findFences('```json\n{}\n```\n\n~~~\nplain\n~~~');
  assert.deepEqual(f.map((x) => [x.info, x.body, x.startLine, x.endLine]), [
    ['json', '{}', 1, 3],
    ['', 'plain', 5, 7],
  ]);
});

test('a longer outer fence contains a shorter inner one', () => {
  const f = findFences('````markdown\n```claim\n{}\n```\n````');
  assert.equal(f.length, 1);
  assert.equal(f[0].info, 'markdown');
  assert.equal(f[0].body, '```claim\n{}\n```');
});

test('a fence closes only on the same character', () => {
  const f = findFences('~~~\n```\n~~~');
  assert.equal(f.length, 1);
  assert.equal(f[0].body, '```');
});

test('an unclosed fence runs to the end', () => {
  const [f] = findFences('```claim\n{"probability": 0.5');
  assert.equal(f.closed, false);
  assert.equal(f.body, '{"probability": 0.5');
});

test('the info string is its first word, lowercased', () => {
  assert.equal(findFences('```Claim title="x"\n{}\n```')[0].info, 'claim');
});

test('four-space indented fences are not fences', () => {
  assert.equal(findFences('    ```\n    code\n    ```').length, 0);
});

test('CRLF line endings', () => {
  assert.equal(findFences('```json\r\n{}\r\n```\r\n')[0].body, '{}');
});
