import assert from 'node:assert/strict';
import test from 'node:test';

import {
  citationExcerptBoundaryContext,
  formatCitationExcerpt,
} from '../lib/citation-excerpt';

function sourceChunk(fullText: string, start: number, end: number) {
  return { text: fullText.slice(start, end), start, end };
}

function assertVerbatim(excerpt: string, source: string) {
  const normalizedSource = source.replace(/\s+/gu, ' ');
  for (const part of excerpt.split('…').filter(Boolean)) {
    assert.ok(normalizedSource.includes(part.trim()), `not verbatim: ${part}`);
  }
}

test('excerpt skips a word cut at the chunk start and marks the omission', () => {
  const fullText =
    'Материалы передавал, в течение всего производственного процесса оставались в ' +
    'собственности давальца. Соответственно, эти материалы не формируют себестоимость.';
  const start = fullText.indexOf('нного процесса');
  const chunk = sourceChunk(fullText, start, fullText.length);

  const excerpt = formatCitationExcerpt(
    chunk.text,
    480,
    citationExcerptBoundaryContext(fullText, chunk),
  );

  assert.equal(excerpt, '…Соответственно, эти материалы не формируют себестоимость.');
  assertVerbatim(excerpt, fullText);
});

test('excerpt without a reliable offset drops the partial leading word', () => {
  const excerpt = formatCitationExcerpt(
    'ание материалов из производства выполняется документом без отдельного предложения',
    480,
  );

  assert.equal(
    excerpt,
    '…материалов из производства выполняется документом без отдельного предложения…',
  );
});

test('excerpt ends at the last complete sentence when the limit falls inside a word', () => {
  const text =
    'Первое предложение закончено. Второе предложение тоже закончено. ' +
    'Третье предложение обрывается внутри слова собственности и дальше.';
  const limit = text.indexOf('собственности') + 5;

  const excerpt = formatCitationExcerpt(text, limit, { before: '', after: '' });

  assert.equal(excerpt, 'Первое предложение закончено. Второе предложение тоже закончено.');
  assert.ok(excerpt.length <= limit);
});

test('a sentence longer than the limit is shortened at a word boundary', () => {
  const sentence =
    'Документ оформляет передачу материалов в переработку с указанием склада, ' +
    'контрагента, договора, номенклатуры, количества и характеристик партии сырья.';

  const excerpt = formatCitationExcerpt(sentence, 60, { before: '', after: '' });

  assert.ok(excerpt.length <= 60);
  assert.ok(excerpt.endsWith('…'));
  assert.equal(excerpt, 'Документ оформляет передачу материалов в переработку с…');
  assertVerbatim(excerpt, sentence);
});

test('abbreviations, initials, lists and versions are not sentence ends', () => {
  const text =
    'В версии 8.3. Платформа описана подробно, см. рис. 5 и табл. 2, т.е. в разделе ' +
    'автора А. С. Иванова. 1. Первый пункт списка. Последнее полное предложение здесь.';
  const limit = text.indexOf('Последнее') + 12;

  const excerpt = formatCitationExcerpt(text, limit, { before: '', after: '' });

  assert.equal(
    excerpt,
    'В версии 8.3. Платформа описана подробно, см. рис. 5 и табл. 2, т.е. в разделе ' +
      'автора А. С. Иванова. 1. Первый пункт списка.',
  );
});

test('a short complete quote is returned without ellipses', () => {
  const fullText = 'Предыдущий абзац закончен.\n\nКороткая   полная цитата.\nСледующий текст.';
  const start = fullText.indexOf('Короткая');
  const chunk = sourceChunk(fullText, start, fullText.indexOf('Следующий') - 1);

  assert.equal(
    formatCitationExcerpt(chunk.text, 480, citationExcerptBoundaryContext(fullText, chunk)),
    'Короткая полная цитата.',
  );
});

test('excerpt is never empty and respects the limit', () => {
  for (const text of ['слово', 'нного', 'Одно.', 'а'.repeat(1_000), ' \n x \n ']) {
    const excerpt = formatCitationExcerpt(text, 40);
    assert.ok(excerpt.length > 0, `empty for ${text.slice(0, 10)}`);
    assert.ok(excerpt.length <= 40);
  }
  assert.equal(formatCitationExcerpt('   ', 40), '');
});

test('mismatched offsets fall back to text-only boundary detection', () => {
  assert.deepEqual(
    citationExcerptBoundaryContext('Полный текст документа.', { text: 'другой', start: 0, end: 6 }),
    {},
  );
});
