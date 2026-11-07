import assert from 'node:assert/strict';
import test from 'node:test';

import { assembleProviderContext } from '../lib/ai-gateway';
import { sectionLabelsForChunks } from '../lib/document-sections';

const tenant = { companyId: 'sections-tenant', userId: 'sections-user' };

test('numbered headings carry over to the chunks that follow them', () => {
  const labels = sectionLabelsForChunks([
    { id: 'a', index: 0, text: '4.1.2. Отгрузка продукции заказчику Продукция отгружается по договору.' },
    { id: 'b', index: 1, text: 'Документ проводится после отгрузки. 4.2 ВНЕШНЯЯ ПЕРЕРАБОТКА Описание раздела.' },
    { id: 'c', index: 2, text: 'и продолжение текста. 4.2.3. Передача материалов исполнителю Передача оформляется документом.' },
    { id: 'd', index: 3, text: 'материалы передаются по залоговой цене.' },
  ]);

  assert.equal(labels.get('a'), '4.1.2 Отгрузка продукции заказчику');
  assert.equal(labels.get('b'), '4.1.2 Отгрузка продукции заказчику › 4.2 ВНЕШНЯЯ ПЕРЕРАБОТКА');
  assert.equal(labels.get('c'), '4.2 ВНЕШНЯЯ ПЕРЕРАБОТКА › 4.2.3 Передача материалов исполнителю');
  assert.equal(labels.get('d'), '4.2 ВНЕШНЯЯ ПЕРЕРАБОТКА › 4.2.3 Передача материалов исполнителю');
});

test('account codes with leading zeros are not treated as sections', () => {
  const labels = sectionLabelsForChunks([
    { id: 'a', index: 0, text: 'Счет 10.01 Сырье и материалы используется для учета. 20.01 Основное производство.' },
  ]);
  assert.equal(labels.size, 0);
});

test('version numbers in running headers are not treated as sections', () => {
  const labels = sectionLabelsForChunks([
    { id: 'a', index: 0, text: '4.2 ВНЕШНЯЯ ПЕРЕРАБОТКА Описание раздела.' },
    { id: 'b', index: 1, text: 'Конфигурация «Пример». Редакция 1.3 В этом случае в документе Задание указывается заказ.' },
  ]);
  assert.equal(labels.get('b'), '4.2 ВНЕШНЯЯ ПЕРЕРАБОТКА');
});

test('provider context names the section only when the source has one', () => {
  const context = assembleProviderContext({
    tenant,
    question: 'Какой документ?',
    language: 'ru',
    model: 'test-model',
    maximumOutputTokens: 100,
    systemInstructions: 'Answer from sources.',
    correlationId: 'sections',
    sources: [
      {
        sourceId: 'S1',
        sourceType: 'DOCUMENT',
        documentId: 'doc',
        chunkId: '1',
        title: 'doc.pdf',
        section: '4.2 ВНЕШНЯЯ ПЕРЕРАБОТКА',
        pageStart: 1,
        pageEnd: 1,
        text: 'Текст',
      },
      {
        sourceId: 'S2',
        sourceType: 'DOCUMENT',
        documentId: 'doc',
        chunkId: '2',
        title: 'doc.pdf',
        pageStart: 2,
        pageEnd: 2,
        text: 'Текст',
      },
    ],
  });

  assert.match(context, /chunk="1" section="4\.2 ВНЕШНЯЯ ПЕРЕРАБОТКА" page_start="1"/u);
  assert.match(context, /chunk="2" page_start="2"/u);
});
