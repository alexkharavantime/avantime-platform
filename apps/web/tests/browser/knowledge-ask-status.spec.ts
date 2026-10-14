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

    if (askCount === 3) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'AI budget exhausted.', code: 'AI_BUDGET_EXCEEDED' }),
      });
      return;
    }
    if (askCount === 4) {
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
  await expect(page.getByRole('alert').filter({ hasText: 'AI_BUDGET_EXCEEDED' })).toBeVisible();
  await expect(answerSection.getByText('Ответ подтверждён страницей 190.')).toHaveCount(0);
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
    'Вопрос при сетевой ошибке',
  ]);
});
