import { GoogleGenAI } from '@google/genai';
import { authorizeApi } from '../../../lib/authorization';

export async function POST(req: Request) {
  try {
    const authorization = await authorizeApi();
    if (authorization.response) return authorization.response;

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          text: 'API-ключ Gemini не найден в .env.local.',
        },
        {
          status: 500,
        },
      );
    }

    const { prompt } = (await req.json()) as {
      prompt?: string;
    };

    if (!prompt?.trim()) {
      return Response.json(
        {
          text: 'Введите вопрос.',
        },
        {
          status: 400,
        },
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
    });

    return Response.json({
      text: response.text || 'AI не вернул текстовый ответ.',
    });
  } catch (error) {
    console.error('Gemini error:', error);

    return Response.json(
      {
        text: error instanceof Error ? error.message : 'Ошибка обращения к AI.',
      },
      {
        status: 500,
      },
    );
  }
}
