import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRagSystemInstructions } from '../lib/rag-answer';

test('RAG instructions require supported partial answers and prohibit invented examples', () => {
  const instructions = buildRagSystemInstructions('ru');

  assert.match(instructions, /identify which requested detail is not specified/);
  assert.match(instructions, /Do not fill evidence gaps with plausible examples/);
});

test('RAG instructions forbid closing offers and require one marker per source', () => {
  const instructions = buildRagSystemInstructions('ru');

  assert.match(instructions, /Do not end with offers of further help/);
  assert.match(instructions, /never place several IDs or comments inside one marker/);
});

test('RAG instructions keep parties and scenarios apart and require supported citations', () => {
  const instructions = buildRagSystemInstructions('ru');

  assert.match(instructions, /never combine statements about different parties or scenarios/);
  assert.match(instructions, /Cite each statement only with sources that state it/);
});
