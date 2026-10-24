import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeAnswerCitations } from '../lib/rag-answer';

const allowed = new Set(['S1', 'S2', 'S3']);

test('grouped bracket citations are split into individual markers', () => {
  assert.equal(
    sanitizeAnswerCitations('Регистр хранит нормативы [S1, S3] и [S2; S1].', allowed),
    'Регистр хранит нормативы [S1][S3] и [S2][S1].',
  );
});

test('parenthesized server source IDs become bracket markers', () => {
  assert.equal(
    sanitizeAnswerCitations('Сырьё остаётся у давальца (S1). Документ передачи (S2, S3).', allowed),
    'Сырьё остаётся у давальца [S1]. Документ передачи [S2][S3].',
  );
});

test('ordinary parenthesized text and unknown IDs are not turned into citations', () => {
  assert.equal(
    sanitizeAnswerCitations('Интеграция с (SAP) и (S1, S9) остаётся текстом.', allowed),
    'Интеграция с (SAP) и (S1, S9) остаётся текстом.',
  );
  assert.equal(sanitizeAnswerCitations('Факт [S1, S9].', allowed), 'Факт [S1].');
});

test('existing single markers and forged IDs keep their behaviour', () => {
  assert.equal(
    sanitizeAnswerCitations('Valid [S1], forged [S999] and [ADMIN].', new Set(['S1'])),
    'Valid [S1], forged and .',
  );
});
