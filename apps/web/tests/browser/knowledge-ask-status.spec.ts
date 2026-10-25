import { expect, test } from './fixtures';

test('shows distinct test-provider and request-failure states without persisting failures', async ({
  page,
  loginAs,
}) => {
  await loginAs('tenantA');

  const submittedQuestions: string[] = [];
  const savedHistory: Array<{ question: string; answer: string }> = [];
  let askCount = 0;

  await page.route('**/api/documents/history', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ history: [] }),
      });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { question: string; answer: string };
      savedHistory.push({ question: body.question, answer: body.answer });
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          item: {
            id: `test-history-${savedHistory.length}`,
            ...body,
            sources: [],
            createdAt: new Date().toISOString(),
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/documents/ask', async (route) => {
    const body = route.request().postDataJSON() as { question: string };
    submittedQuestions.push(body.question);
    askCount += 1;

    const budgetReasons: Record<number, string> = {
      3: 'not_configured',
      4: 'daily_limit_reached',
      5: 'monthly_limit_reached',
      6: 'insufficient_reservation',
    };
    if (askCount in budgetReasons) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'AI budget reservation was denied.',
          code: 'AI_BUDGET_EXCEEDED',
          budgetReason: budgetReasons[askCount],
        }),
      });
      return;
    }
    if (askCount === 7) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'AI budget check is unavailable.',
          code: 'AI_BUDGET_UNAVAILABLE',
        }),
      });
      return;
    }
    if (askCount === 8) {
      await route.abort('failed');
      return;
    }

    const pageNumber = askCount === 1 ? 146 : 190;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'answered',
        answer: `Ответ подтверждён страницей ${pageNumber}.`,
        citations: [
          {
            number: 1,
            sourceType: 'DOCUMENT',
            sourceId: 'S1',
            sourceTitle: '5s2c_BookFull.pdf',
            documentId: 'saved-book-id',
            chunkId: `saved-book-chunk-${pageNumber}`,
            pageStart: pageNumber,
            pageEnd: pageNumber,
            excerpt: `Фрагмент со страницы ${pageNumber}.`,
            link: `/portal/documents/saved-book-id?chunk=saved-book-chunk-${pageNumber}`,
          },
        ],
        providerMode:
          askCount === 1
            ? { embedding: 'fake', answer: 'fake' }
            : { embedding: 'openai', answer: 'openai' },
      }),
    });
  });

  await page.goto('/ru/portal/knowledge');
  const question = page.getByRole('textbox', { name: 'Вопрос AI-консультанту' });
  const askButton = page.getByRole('button', { name: 'Получить ответ AI' });
  const answerSection = page.locator('section').filter({ has: question });

  await question.fill('Какими документами оформляется выпуск продукции?');
  await askButton.click();
  await expect(answerSection.getByText('Ответ подтверждён страницей 146.')).toBeVisible();
  await expect(page.getByText('Активен тестовый AI-провайдер; результат не сгенерирован реальной моделью.')).toBeVisible();
  await expect(answerSection.getByText('Страница 146')).toBeVisible();
  expect(savedHistory).toHaveLength(1);

  await question.fill('Чем отличаются нормативная и плановая себестоимость?');
  await askButton.click();
  await expect(answerSection.getByText('Ответ подтверждён страницей 190.')).toBeVisible();
  await expect(answerSection.getByText('Страница 190')).toBeVisible();
  await expect(answerSection.getByText('Страница 146')).toHaveCount(0);
  await expect(page.getByText(/тестовый AI-провайдер/u)).toHaveCount(0);
  expect(savedHistory).toHaveLength(2);

  await question.fill('Вопрос, заблокированный бюджетом');
  await askButton.click();
  const budgetAlert = page.getByRole('alert').filter({ hasText: 'Бюджет AI не настроен.' });
  await expect(budgetAlert).toBeVisible();
  await expect(budgetAlert).not.toContainText('Новые запросы не отправлялись');
  await expect(answerSection.getByText('Ответ подтверждён страницей 190.')).toHaveCount(0);
  expect(savedHistory).toHaveLength(2);

  const budgetErrors = [
    ['Достигнут дневной лимит бюджета AI', 'Вопрос при дневном лимите'],
    ['Достигнут месячный лимит бюджета AI', 'Вопрос при месячном лимите'],
    ['Остатка бюджета AI недостаточно', 'Вопрос при недостаточном остатке'],
    ['Проверка бюджета AI временно недоступна', 'Вопрос при недоступности бюджета'],
  ] as const;
  for (const [message, submittedQuestion] of budgetErrors) {
    await question.fill(submittedQuestion);
    await askButton.click();
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
  }
  expect(savedHistory).toHaveLength(2);

  await question.fill('Вопрос при сетевой ошибке');
  await askButton.click();
  await expect(
    page.getByRole('alert').filter({
      hasText: 'Поиск в базе знаний или генерация временно недоступны.',
    }),
  ).toBeVisible();
  expect(savedHistory).toHaveLength(2);
  expect(submittedQuestions).toEqual([
    'Какими документами оформляется выпуск продукции?',
    'Чем отличаются нормативная и плановая себестоимость?',
    'Вопрос, заблокированный бюджетом',
    'Вопрос при дневном лимите',
    'Вопрос при месячном лимите',
    'Вопрос при недостаточном остатке',
    'Вопрос при недоступности бюджета',
    'Вопрос при сетевой ошибке',
  ]);
});
