import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRagSystemInstructions } from '../lib/rag-answer';

test('RAG instructions require supported partial answers and prohibit invented examples', () => {
  const instructions = buildRagSystemInstructions('ru');

  assert.match(instructions, /identify which requested detail is not specified/);
  assert.match(instructions, /Do not fill evidence gaps with plausible examples/);
});
