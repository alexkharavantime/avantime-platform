import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';

import path from 'node:path';
import { NextResponse } from 'next/server';
import { authorizeApi } from '../../../../lib/authorization';

export const runtime = 'nodejs';

type HistorySource = {
  number: number;
  documentId: string;
  documentName: string;
  chunkId: string;
  score: number;
};

type HistoryItem = {
  id: string;
  question: string;
  answer: string;
  sources: HistorySource[];
  createdAt: string;
};

type CreateHistoryRequest = {
  question?: string;
  answer?: string;
  sources?: HistorySource[];
};

const dataDirectory = path.join(
  process.cwd(),
  '.data',
);

const historyFile = path.join(
  dataDirectory,
  'knowledge-history.json',
);

async function readHistory(): Promise<HistoryItem[]> {
  try {
    const content = await readFile(
      historyFile,
      'utf-8',
    );

    const parsed: unknown = JSON.parse(content);

    return Array.isArray(parsed)
      ? (parsed as HistoryItem[])
      : [];
  } catch {
    return [];
  }
}

async function saveHistory(
  history: HistoryItem[],
) {
  await mkdir(dataDirectory, {
    recursive: true,
  });

  await writeFile(
    historyFile,
    JSON.stringify(history, null, 2),
    'utf-8',
  );
}

export async function GET() {
  try {
    const authorization = await authorizeApi(['ADMIN']);
    if (authorization.response) return authorization.response;

    const history = await readHistory();

    return NextResponse.json({
      history,
    });
  } catch (error) {
    console.error(
      'Knowledge history read error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Не удалось получить историю вопросов.',
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeApi(['ADMIN']);
    if (authorization.response) return authorization.response;

    const body =
      (await request.json()) as CreateHistoryRequest;

    const question = body.question?.trim() ?? '';
    const answer = body.answer?.trim() ?? '';

    if (!question || !answer) {
      return NextResponse.json(
        {
          error:
            'Вопрос и ответ обязательны.',
        },
        {
          status: 400,
        },
      );
    }

    const history = await readHistory();

    const item: HistoryItem = {
      id: crypto.randomUUID(),
      question,
      answer,
      sources: Array.isArray(body.sources)
        ? body.sources
        : [],
      createdAt: new Date().toISOString(),
    };

    history.unshift(item);

    // Пока храним последние 100 вопросов.
    const limitedHistory = history.slice(0, 100);

    await saveHistory(limitedHistory);

    return NextResponse.json({
      item,
    });
  } catch (error) {
    console.error(
      'Knowledge history save error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Не удалось сохранить вопрос.',
      },
      {
        status: 500,
      },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authorization = await authorizeApi(['ADMIN']);
    if (authorization.response) return authorization.response;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    const history = await readHistory();

    if (!id) {
      await saveHistory([]);

      return NextResponse.json({
        success: true,
        cleared: true,
      });
    }

    const updatedHistory = history.filter(
      (item) => item.id !== id,
    );

    if (
      updatedHistory.length === history.length
    ) {
      return NextResponse.json(
        {
          error:
            'Запись истории не найдена.',
        },
        {
          status: 404,
        },
      );
    }

    await saveHistory(updatedHistory);

    return NextResponse.json({
      success: true,
      id,
    });
  } catch (error) {
    console.error(
      'Knowledge history delete error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Не удалось удалить запись истории.',
      },
      {
        status: 500,
      },
    );
  }
}
