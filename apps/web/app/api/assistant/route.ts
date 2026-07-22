import { NextResponse } from 'next/server';

function buildAnswer(message: string) {
  const text = message.toLowerCase();

  if (text.includes('jira') || text.includes('обращен')) {
    return 'Первый этап: единая форма обращения, автоматическое создание задачи в Jira и обратная синхронизация понятных клиенту статусов. Затем можно подключить базу знаний и AI-классификацию.';
  }
  if (text.includes('1с') || text.includes('заказ') || text.includes('склад')) {
    return 'Сначала стоит описать источник данных, точки повторного ввода и владельца каждого справочника. Для прототипа выберем один документ или обмен и измерим сокращение ручных операций.';
  }
  if (text.includes('ai') || text.includes('ии') || text.includes('помощник')) {
    return 'Для безопасного старта выберите одну контролируемую базу знаний и один тип вопросов. AI должен показывать источники, а важные действия оставлять на подтверждение сотруднику.';
  }
  if (text.includes('agent') || text.includes('торгов')) {
    return 'Для Agent+ начнем с маршрута торгового представителя, заказа и синхронизации цен и остатков. После пилота добавим задачи, оплаты и аналитику.';
  }

  return 'Предлагаю провести короткую диагностику: зафиксировать вход процесса, участников, ручные действия, используемые системы и измеримый результат. После этого можно сделать рабочий прототип одного сценария.';
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  return NextResponse.json({ answer: buildAnswer(message) });
}
