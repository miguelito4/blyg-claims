import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupKeys, reference } from '../src/group.ts';

const A = 'https://a.example/blyg/';
const B = 'https://b.example/';
const C = 'https://c.example/blyg/';

test('a claim and its forks, at any depth, share the root claim\'s key', () => {
  const keys = groupKeys([
    { origin: A, id: 'root' },
    { origin: B, id: 'fork1', forkedFrom: { origin: A, id: 'root' } },
    { origin: C, id: 'fork2', forkedFrom: { origin: B, id: 'fork1' } },
    { origin: C, id: 'other' },
  ]);
  assert.deepEqual(keys, [`${A}root`, `${A}root`, `${A}root`, `${C}other`]);
});

test('forks of a claim the scan never read still group, under that claim\'s address', () => {
  const keys = groupKeys([
    { origin: B, id: 'x', forkedFrom: { origin: 'https://unread.example/', id: 'gone' } },
    { origin: C, id: 'y', forkedFrom: { origin: 'https://unread.example/', id: 'gone' } },
  ]);
  assert.equal(keys[0], 'https://unread.example/gone');
  assert.equal(keys[1], keys[0]);
});

test('a cycle stops instead of looping', () => {
  const keys = groupKeys([
    { origin: A, id: '1', forkedFrom: { origin: B, id: '2' } },
    { origin: B, id: '2', forkedFrom: { origin: A, id: '1' } },
  ]);
  assert.equal(keys.length, 2);
});

test('only a well-formed reference counts', () => {
  assert.deepEqual(reference({ origin: A, id: 'r', version: 2, cited: {} }), { origin: A, id: 'r', version: 2 });
  assert.equal(reference({ origin: A }), null);
  assert.equal(reference('x'), null);
  assert.equal(reference(null), null);
});
