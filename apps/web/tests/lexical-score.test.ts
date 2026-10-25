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

test('Russian inflected query words match other forms of the same word', () => {
  const chunk = 'Передача материалов переработчику оформляется документом «Передача товаров».';

  assert.ok(lexicalScore(chunk, 'Кто такой переработчик?') > 0);
  assert.ok(
    lexicalScore(chunk, 'Как оформить передачу?') >
      lexicalScore('Документ выпуска продукции.', 'Как оформить передачу?'),
  );
});

test('raw-material wording matches chunks that describe materials', () => {
  const materials = 'Передача материалов переработчику оформляется документом «Передача товаров».';
  const unrelated = 'Отчет производства за смену фиксирует выпуск продукции.';

  assert.ok(
    lexicalScore(materials, 'передача сырья переработчику') >
      lexicalScore(unrelated, 'передача сырья переработчику'),
  );
  assert.equal(lexicalScore('Сыр и молочная продукция.', 'передача сырья'), 0);
});

test('stemming leaves Latin and short words unchanged', () => {
  assert.ok(lexicalScore('Invoice totals include tax.', 'invoices') === 0);
  assert.ok(lexicalScore('Склад и цех.', 'цех') > 0);
});
