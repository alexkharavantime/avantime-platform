import { NextResponse } from 'next/server';
import { listRequests } from '../../../../../lib/requests-store';
import { getSession } from '../../../../../lib/session';

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const requests = await listRequests();
  const rows = [
    ['Номер', 'Тема', 'Компания', 'Клиент', 'Email', 'Категория', 'Приоритет', 'Статус', 'SLA', 'Jira'],
    ...requests.map((item) => [
      item.id,
      item.title,
      item.companyName ?? 'Demo Company',
      item.requesterName ?? 'Demo Client',
      item.requesterEmail ?? 'demo@avantime.lv',
      item.category,
      item.priority,
      item.status,
      item.dueAt,
      item.jiraKey ?? '',
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="avantime-requests.csv"',
    },
  });
}
