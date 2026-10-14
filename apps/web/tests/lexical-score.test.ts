import assert from 'node:assert/strict';
import test from 'node:test';

import { lexicalScore } from '../lib/retrieval';

test('lexical term frequency does not flatten once a chunk contains several matches', () => {
  const repetitiveChunk = [
    'invoice',
    ...Array.from({ length: 70 }, () => 'context'),
    'invoice context invoice context invoice',
  ].join(' ');
  const focusedChunk =
    'Invoice details are recorded, and the invoice totals include the invoice amount.';

  assert.ok(lexicalScore(focusedChunk, 'invoice') > lexicalScore(repetitiveChunk, 'invoice'));
});
