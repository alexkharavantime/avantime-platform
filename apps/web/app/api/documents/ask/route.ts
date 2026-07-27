import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { authorizeDocumentApi } from '../../../../lib/document-authorization';
import { getDocumentTenantContext } from '../../../../lib/document-model';
import {
  resolveDocumentSources,
  type DocumentSourceReference,
} from '../../../../lib/document-sources';

export const runtime = 'nodejs';

type AskRequest = {
  question?: string;
  sources?: DocumentSourceReference[];
};

export async function POST(request: Request) {
  try {
    const authorization = await authorizeDocumentApi();
    if (authorization.response) return authorization.response;

    const tenant = getDocumentTenantContext(authorization.session);

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: 'Не задан OPENAI_API_KEY.',
        },
        {
          status: 500,
        },
      );
    }

    const body = (await request.json()) as AskRequest;

    const question = body.question?.trim() ?? '';

    if (question.length < 3 || question.length > 4_000) {
      return NextResponse.json(
        {
          error: 'Вопрос должен содержать от 3 до 4000 символов.',
        },
        {
          status: 400,
        },
      );
    }

    const sources = await resolveDocumentSources(
      tenant,
      Array.isArray(body.sources) ? body.sources : [],
    );

    if (sources.length === 0) {
      return NextResponse.json(
        {
          error:
            'В базе знаний не найдены подходящие фрагменты.',
        },
        {
          status: 400,
        },
      );
    }

    const context = sources
      .map((source, index) => {
        return [
          `[Источник ${index + 1}]`,
          `Документ: ${source.documentName}`,
          `Фрагмент: ${source.snippet}`,
        ].join('\n');
      })
      .join('\n\n');

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.responses.create({
      model:
        process.env.OPENAI_MODEL || 'gpt-5',

      store: false,

      instructions: [
        'Ты AI-консультант Avantime.',
        'Отвечай только на основании переданных источников.',
        'Если информации недостаточно, прямо сообщи об этом.',
        'Не придумывай факты.',
        'В ответе ставь ссылки вида [Источник 1], [Источник 2].',
        'Отвечай на русском языке.',
      ].join(' '),

      input: [
        `Вопрос пользователя:\n${question}`,
        `\nИсточники:\n${context}`,
      ].join('\n'),
    });

    const answer = response.output_text?.trim();

    if (!answer) {
      throw new Error(
        'AI не вернул текст ответа.',
      );
    }

    return NextResponse.json({
      answer,
      sources: sources.map((source, index) => ({
        number: index + 1,
        documentId: source.documentId,
        documentName: source.documentName,
        chunkId: source.chunkId,
        score: 0,
      })),
    });
  } catch (error) {
    console.error('Knowledge AI error:', error);

    return NextResponse.json(
      {
        error: 'Не удалось получить ответ AI.',
      },
      {
        status: 500,
      },
    );
  }
}
