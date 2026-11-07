import assert from 'node:assert/strict';
import test from 'node:test';

import { checkAnswerGrounding, extractDocumentNames, type GroundingSource } from '../lib/answer-grounding';

// Short quotes from the local knowledge base: the book describes processing a customer's
// materials (customer-materials), the UPP manual section 31.2 sending own materials to an
// external processor (external-processor).
const quotes = {
  book70:
    'Тем, что принятые в переработку материалы не являются нашими. Они не становятся нашими, приезжая к нам на предприятие, они у нас числятся за балансом, они продолжают оставаться материалами давальца. Не происходит передача прав собственности.',
  upp10Return:
    'товаров (главное меню Производство – Возврат переданных товаров) с видом операции материалы из переработки. В реквизитах шапки документа указывается контрагент-переработчик и договор с переработчиком, в рамках которого возвращаются материалы.',
  upp9Materials:
    'Перечень сырья, которое передается переработчику, указывается на закладке Материалы. Для каждого материала указывается залоговая цена, по которой переработчик отвечает перед предприятием.',
  upp9Transfer:
    'пециализированным документом Передача товаров (главное меню Запасы – Передача товаров) с видом операции Передача материалов переработчику.',
  upp12Services:
    'Для регистрации факта получения услуг по переработке используется специализированный документ Получение услуг по переработке (главное меню Производство).',
  upp8Order:
    'необходимо зарегистрировать заказ на переработку путем ввода документа универсального назначения Заказ поставщику (интерфейс Управление заказами).',
  upp14Balances:
    'Оприходование товаров с видом операции Ввод начальных остатков. Затем регистрируется факт передачи материалов в переработку документом Передача товаров с видом операции Передача материалов переработчику.',
};
const documentNames = extractDocumentNames(Object.values(quotes));

test('document names are extracted from how the sources introduce documents', () => {
  for (const name of ['Передача товаров', 'Получение услуг по переработке', 'Заказ поставщику']) {
    assert.ok(documentNames.includes(name), name);
  }
});

test('the 2026-10-25 ownership answer is flagged for mixed scenarios and an uncited name', () => {
  const sources: GroundingSource[] = [
    { sourceId: 'S1', text: quotes.book70, scenario: 'customer-materials' },
    { sourceId: 'S3', text: quotes.upp10Return, scenario: 'external-processor' },
    { sourceId: 'S6', text: quotes.upp9Materials, scenario: 'external-processor' },
    { sourceId: 'S8', text: quotes.upp12Services, scenario: 'external-processor' },
    { sourceId: 'S9', text: quotes.upp9Transfer, scenario: 'external-processor' },
  ];
  const answer = [
    'Материалы, принятые в переработку, остаются собственностью давальца (они не становятся собственностью переработчика). Роль переработчика — оказание услуги по переработке и возвращение результата давальцу; права собственности на материалы и на результаты переработки не переходят к переработчику. [S1]',
    '',
    'В учетных документах возврат оформляется на контрагента‑переработчика / по договору переработки с указанием склада, на который возвращаются материалы (перечисляются возвращаемые материалы и ссылки на документы передачи). То есть в системе результат/материалы возвращаются собственнику (давальцу) в рамках соответствующих документов (Возврат переданных товаров, Получение услуг по переработке и т.д.). [S3][S6][S9]',
  ].join('\n');

  const issues = checkAnswerGrounding({
    answer,
    sources,
    documentNames,
    expectedScenario: 'customer-materials',
  });

  assert.deepEqual(
    issues.map((issue) => (issue.kind === 'unsupported_name' ? `${issue.kind}:${issue.name}` : issue.kind)),
    ['unsupported_name:Получение услуг по переработке', 'scenario_mismatch'],
  );
  assert.ok(issues.every((issue) => issue.statement.startsWith('В учетных документах')));
});

test('the narrow raw-material transfer answer passes both checks', () => {
  const sources: GroundingSource[] = [
    { sourceId: 'S2', text: quotes.upp9Materials, scenario: 'external-processor' },
    { sourceId: 'S3', text: quotes.upp9Transfer, scenario: 'external-processor' },
    { sourceId: 'S4', text: quotes.upp14Balances, scenario: 'external-processor' },
    { sourceId: 'S5', text: quotes.upp8Order, scenario: 'external-processor' },
  ];
  const answer = [
    'Основной документ — специализированный документ Передача товаров с видом операции «Передача материалов переработчику». Материалы передаются по залоговой цене [S2][S3].',
    'Если ведение взаиморасчетов выполняется «по заказам», предварительно оформляется Заказ поставщику с видом операции «Переработка» [S5][S2].',
    'При вводе начальных остатков сначала оформляется Оприходование товаров, а затем Передача товаров [S4].',
  ].join('\n');

  assert.deepEqual(
    checkAnswerGrounding({ answer, sources, documentNames, expectedScenario: 'external-processor' }),
    [],
  );
});
