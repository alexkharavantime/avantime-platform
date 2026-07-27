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

    const normalizedPrompt = prompt?.trim() ?? '';

    if (!normalizedPrompt || normalizedPrompt.length > 4_000) {
      return Response.json(
        {
          text: 'Введите вопрос длиной до 4000 символов.',
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
      contents: normalizedPrompt,
    });

    return Response.json({
      text: response.text || 'AI не вернул текстовый ответ.',
    });
  } catch (error) {
    console.error('Gemini error:', error);

    return Response.json(
      {
        text: 'Ошибка обращения к AI.',
      },
      {
        status: 500,
      },
    );
  }
}
