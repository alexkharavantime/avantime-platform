import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

const maximumProviderCalls = 12;

type JsonRecord = Record<string, unknown>;
type MockOpenAiTransport = {
  baseUrl: string;
  readonly providerCallCount: number;
  readonly operations: readonly string[];
  close: () => Promise<void>;
};

async function readJson(request: IncomingMessage): Promise<JsonRecord> {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.length;
    if (byteLength > 256 * 1024) throw new Error('Mock provider request exceeded its size limit.');
    chunks.push(buffer);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Mock provider request must be a JSON object.');
  }
  return value as JsonRecord;
}

function sendJson(response: ServerResponse, statusCode: number, body: JsonRecord, requestId: string) {
  response.writeHead(statusCode, {
    'content-type': 'application/json',
    'x-request-id': requestId,
  });
  response.end(JSON.stringify(body));
}

function tokenCount(value: string) {
  return Math.max(1, Math.ceil(Buffer.byteLength(value, 'utf8') / 4));
}

function generateAnswer(input: string) {
  const question = input.match(/<question language="[^"]+">\s*([\s\S]*?)\s*<\/question>/u)?.[1] ?? '';
  const sources = [...input.matchAll(/<source id="([^"]+)" document="[^"]+" chunk="[^"]+">\n([\s\S]*?)\n<\/source>/gu)].map(
    (match) => ({ id: match[1]!, excerpt: match[2]! }),
  );

  if (/powershell|cmdlet/iu.test(question)) {
    return 'В доступных источниках недостаточно данных для ответа.';
  }
  if (/3\.0/u.test(question)) {
    const source = sources.find((candidate) => /2\.5\.14/u.test(candidate.excerpt));
    return `Предоставленные документы относятся только к версии 2.5.14; применимость к версии 3.0 не подтверждена.${source ? ` [${source.id}]` : ''}`;
  }

  const timeSource = sources.find((source) => /\b\d{1,2}:\d{2}\b/u.test(source.excerpt));
  const retentionSource = sources.find((source) => /\b\d+\s+days?\b/iu.test(source.excerpt));
  if (/срок хранения|резервных копий/iu.test(question) && timeSource && retentionSource) {
    const time = timeSource.excerpt.match(/\b\d{1,2}:\d{2}\b/u)?.[0];
    const days = retentionSource.excerpt.match(/\b\d+\s+days?\b/iu)?.[0];
    return `Ночное обслуживание начинается в ${time}; резервные копии хранятся ${days}. [${timeSource.id}] [${retentionSource.id}]`;
  }
  if (timeSource) {
    const time = timeSource.excerpt.match(/\b\d{1,2}:\d{2}\b/u)?.[0];
    return `Ночное обслуживание начинается в ${time}. [${timeSource.id}]`;
  }
  return 'В доступных источниках недостаточно данных для ответа.';
}

function respondToEmbeddings(payload: JsonRecord) {
  const input = Array.isArray(payload.input) ? payload.input : [payload.input];
  const dimensions = payload.dimensions;
  if (
    typeof payload.model !== 'string' ||
    !Number.isSafeInteger(dimensions) ||
    Number(dimensions) < 1 ||
    input.length === 0 ||
    input.some((item) => typeof item !== 'string')
  ) {
    return {
      statusCode: 400,
      body: { error: { message: 'Invalid mock embeddings payload.', type: 'invalid_request_error' } },
    };
  }
  const inputTokens = input.reduce((total, item) => total + tokenCount(item as string), 0);
  return {
    statusCode: 200,
    body: {
      object: 'list',
      model: payload.model,
      data: input.map((_item, index) => ({
        object: 'embedding',
        index,
        embedding: Array.from({ length: Number(dimensions) }, (_unused, component) =>
          component === 0 ? 1 : 0,
        ),
      })),
      usage: { prompt_tokens: inputTokens, total_tokens: inputTokens },
    },
  };
}

function respondToGeneration(payload: JsonRecord, requestId: string) {
  if (typeof payload.model !== 'string' || typeof payload.input !== 'string') {
    return {
      statusCode: 400,
      body: { error: { message: 'Invalid mock Responses payload.', type: 'invalid_request_error' } },
    };
  }
  const answer = generateAnswer(payload.input);
  const inputTokens = tokenCount(`${String(payload.instructions ?? '')}\n${payload.input}`);
  const outputTokens = tokenCount(answer);
  return {
    statusCode: 200,
    body: {
      id: requestId,
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      model: payload.model,
      status: 'completed',
      output: [
        {
          id: `msg_${requestId}`,
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', annotations: [], text: answer }],
        },
      ],
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      },
    },
  };
}

export async function startMockOpenAiTransport(): Promise<MockOpenAiTransport> {
  let providerCallCount = 0;
  const operations: string[] = [];
  const server: Server = createServer((request, response) => {
    void (async () => {
      providerCallCount += 1;
      const requestId = `mock_${String(providerCallCount).padStart(4, '0')}`;
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      const operation =
        request.method === 'POST' && pathname === '/v1/embeddings'
          ? 'embedding'
          : request.method === 'POST' && pathname === '/v1/responses'
            ? 'answer'
            : 'unexpected';
      operations.push(operation);
      if (providerCallCount > maximumProviderCalls) {
        sendJson(
          response,
          429,
          { error: { message: 'Mock provider call cap exceeded.', type: 'rate_limit_error' } },
          requestId,
        );
        return;
      }
      if (operation === 'unexpected') {
        sendJson(response, 404, { error: { message: 'Unexpected mock provider path.' } }, requestId);
        return;
      }

      try {
        const payload = await readJson(request);
        const result =
          operation === 'embedding'
            ? respondToEmbeddings(payload)
            : respondToGeneration(payload, requestId);
        sendJson(response, result.statusCode, result.body, requestId);
      } catch {
        sendJson(
          response,
          400,
          { error: { message: 'Mock provider could not parse request.', type: 'invalid_request_error' } },
          requestId,
        );
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock provider did not bind a TCP port.');

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    get providerCallCount() {
      return providerCallCount;
    },
    get operations() {
      return [...operations];
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}