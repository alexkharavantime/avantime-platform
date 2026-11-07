import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import scenarios from '../tests/fixtures/knowledge-answer-scenarios.json';
import { checkAnswerGrounding, extractDocumentNames } from '../lib/answer-grounding';
import { resolveDocumentDataDirectory } from '../lib/document-data-directory';

// Offline check of saved knowledge answers (no AI calls): every named document must appear in
// the cited sources, and statements must not cite sources from another scenario.

type SavedSource = {
  number: number;
  documentId?: string;
  sourceTitle?: string;
  chunkId: string;
};
type SavedAnswer = {
  question: string;
  answer: string;
  createdAt: string;
  sources: SavedSource[];
};

function scenarioFor(originalName: string | undefined, chunkId: string) {
  const document = scenarios.documents.find((entry) => entry.originalName === originalName);
  const index = Number(chunkId);
  if (!document || !Number.isInteger(index)) return undefined;
  return document.chunks.find((range) => index >= range.from && index <= range.to)?.scenario;
}

async function main() {
  const since = process.argv.find((argument) => argument.startsWith('--since='))?.slice(8);
  const tenantDirectory = path.join(
    resolveDocumentDataDirectory(process.env),
    'document-tenants',
    process.env.EVALUATION_TENANT_ID ?? 'avantime',
    'objects',
  );
  const historyFiles = (await readdir(path.join(tenantDirectory, 'history'))).filter((file) =>
    file.endsWith('.json'),
  );
  const chunkCache = new Map<string, Array<{ id: string; text: string }>>();
  const chunksFor = async (documentId: string) => {
    if (!chunkCache.has(documentId)) {
      chunkCache.set(
        documentId,
        JSON.parse(await readFile(path.join(tenantDirectory, 'chunks', `${documentId}.json`), 'utf8')),
      );
    }
    return chunkCache.get(documentId)!;
  };

  let checked = 0;
  let flagged = 0;
  for (const file of historyFiles) {
    const answers = JSON.parse(
      await readFile(path.join(tenantDirectory, 'history', file), 'utf8'),
    ) as SavedAnswer[];
    for (const saved of answers) {
      if (since && saved.createdAt < since) continue;
      const sources = [];
      for (const source of saved.sources) {
        if (!source.documentId) continue;
        const chunk = (await chunksFor(source.documentId)).find((item) => item.id === source.chunkId);
        if (!chunk) continue;
        sources.push({
          sourceId: `S${source.number}`,
          text: chunk.text,
          scenario: scenarioFor(source.sourceTitle, source.chunkId),
        });
      }
      const expectedScenario = scenarios.questions.find((entry) =>
        new RegExp(entry.pattern, 'iu').test(saved.question),
      )?.scenario;
      const issues = checkAnswerGrounding({
        answer: saved.answer,
        sources,
        documentNames: extractDocumentNames(sources.map((source) => source.text)),
        expectedScenario,
      });
      checked += 1;
      if (issues.length > 0) flagged += 1;
      console.log(
        JSON.stringify({
          createdAt: saved.createdAt,
          question: saved.question,
          expectedScenario: expectedScenario ?? null,
          issues: issues.map((issue) =>
            issue.kind === 'unsupported_name'
              ? { kind: issue.kind, name: issue.name, cited: issue.citedSourceIds }
              : { kind: issue.kind, cited: issue.citedSourceIds, scenarios: issue.citedScenarios },
          ),
        }),
      );
    }
  }
  console.log(JSON.stringify({ checked, flagged }));
  if (process.argv.includes('--fail-on-issues') && flagged > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
