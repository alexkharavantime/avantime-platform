import path from 'node:path';
import { spawn } from 'node:child_process';

import { getPrisma } from '@avantime/database';

import {
  resolveDocumentWorkspaceRoot,
} from '../lib/document-data-directory';
import { loadDocumentConfiguration } from '../lib/document-configuration';
import { configureLocalRagProfile, type LocalRagProfile, type LocalRagTarget } from '../lib/local-rag-profile';
import { PostgreSQLVectorRepository } from '../lib/vector-repository';
import { loadRagConfiguration } from '../lib/rag-configuration';

type Profile = LocalRagProfile;
type Target = LocalRagTarget;

function databaseTarget(databaseUrl: string | undefined) {
  if (!databaseUrl) return 'not configured';
  try {
    const url = new URL(databaseUrl);
    return `${url.hostname}${url.port ? `:${url.port}` : ''}/${url.pathname.replace(/^\/+/, '')}`;
  } catch {
    return 'configured; target hidden';
  }
}

function isBudgetPolicy(
  value: unknown,
): value is { dailyLimitEur: number; monthlyLimitEur: number } {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'dailyLimitEur' in value &&
    typeof value.dailyLimitEur === 'number' &&
    'monthlyLimitEur' in value &&
    typeof value.monthlyLimitEur === 'number'
  );
}

async function inspectRealProfile() {
  const documentConfiguration = loadDocumentConfiguration();
  const ragConfiguration = loadRagConfiguration();
  let database: Awaited<ReturnType<typeof getPrisma>> | undefined;

  try {
    database = await getPrisma();
    const rawPolicies: unknown = await database.$queryRawUnsafe(
      `SELECT "dailyLimitEur"::float8 AS "dailyLimitEur",
              "monthlyLimitEur"::float8 AS "monthlyLimitEur"
       FROM "AiBudgetPolicy" WHERE "companyId" = $1`,
      'avantime',
    );
    if (!Array.isArray(rawPolicies)) {
      throw new Error('The Avantime budget policy query returned an invalid result.');
    }
    const firstPolicy = rawPolicies[0];
    if (firstPolicy !== undefined && !isBudgetPolicy(firstPolicy)) {
      throw new Error('The Avantime budget policy query returned an invalid result.');
    }
    const policy = firstPolicy;
    const dailyLimitEur = policy?.dailyLimitEur ?? ragConfiguration.limits.dailyBudgetEur;
    const monthlyLimitEur = policy?.monthlyLimitEur ?? ragConfiguration.limits.monthlyBudgetEur;
    const vectorReadiness = await new PostgreSQLVectorRepository(
      async () => database ?? null,
    ).checkReadiness({
      dimensions: ragConfiguration.embedding.dimensions,
      embeddingModel: ragConfiguration.embedding.model,
      embeddingVersion: ragConfiguration.embedding.version,
    });

    console.info(
      JSON.stringify({
        profile: 'real',
        tenant: 'avantime',
        providers: {
          embeddings: ragConfiguration.embedding.driver,
          answers: ragConfiguration.answer.driver,
        },
        vectorStore: ragConfiguration.vector.driver,
        ledger: 'postgresql',
        dataDirectory: documentConfiguration.dataDirectory,
        database: databaseTarget(process.env.DATABASE_URL),
        embedding: {
          model: ragConfiguration.embedding.model,
          version: ragConfiguration.embedding.version,
          dimensions: ragConfiguration.embedding.dimensions,
        },
        answerModel: ragConfiguration.answer.model,
        attempts: {
          provider: ragConfiguration.limits.providerMaxAttempts,
          documentProcessing: documentConfiguration.retryPolicy.maxAttempts,
          documentEmbedding: ragConfiguration.embedding.maxAttempts,
        },
        budget: {
          source: policy ? 'AiBudgetPolicy' : 'environment',
          dailyLimitEur,
          monthlyLimitEur,
        },
        vectorReadiness,
      }),
    );

    const blockers: string[] = [];
    if (dailyLimitEur <= 0 || monthlyLimitEur <= 0) {
      const source = policy ? 'AiBudgetPolicy for tenant avantime' : 'AI budget environment';
      blockers.push(
        `${source} must define positive daily and monthly limits; current effective limits are €${dailyLimitEur} and €${monthlyLimitEur}.`,
      );
    }
    if (!vectorReadiness.ready) {
      blockers.push(
        `PostgreSQL pgvector is not ready for ${ragConfiguration.embedding.model}/${ragConfiguration.embedding.version}/${ragConfiguration.embedding.dimensions}.`,
      );
    }
    if (blockers.length > 0) {
      throw new Error(
        `Real RAG startup is blocked: ${blockers.join(' ')} No provider request or worker job was started.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Real RAG startup is blocked:')) {
      throw error;
    }
    const code =
      typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
        ? ` (${error.code})`
        : '';
    throw new Error(
      `Real RAG startup could not verify PostgreSQL configuration${code}. Check DATABASE_URL, the Avantime budget policy, and pgvector readiness. No provider request or worker job was started.`,
    );
  } finally {
    await database?.$disconnect();
  }
}

function startTarget(target: Target, forwardedArguments: string[]) {
  const workspaceRoot = resolveDocumentWorkspaceRoot();
  const webDirectory = path.join(workspaceRoot, 'apps', 'web');
  const commandArguments = target === 'web'
    ? [
        path.join(workspaceRoot, 'node_modules', 'next', 'dist', 'bin', 'next'),
        'dev',
        ...forwardedArguments,
      ]
    : [
        '--import',
        'tsx',
        path.join(
          webDirectory,
          'scripts',
          target === 'document-worker'
            ? 'run-document-worker.ts'
            : 'run-document-embedding-worker.ts',
        ),
        ...forwardedArguments,
      ];
  const child = spawn(process.execPath, commandArguments, {
    cwd: webDirectory,
    env: process.env,
    stdio: 'inherit',
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => child.kill(signal));
  }
  child.on('error', (error: NodeJS.ErrnoException) => {
    console.error(`Unable to start the local ${target} process (${error.code ?? 'unknown'}).`);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

async function main() {
  const [profileArgument, targetArgument, ...forwardedArguments] = process.argv.slice(2);
  const profile: Profile | undefined =
    profileArgument === 'real' || profileArgument === 'fake' ? profileArgument : undefined;
  const target: Target | undefined =
    targetArgument === 'web' ||
    targetArgument === 'document-worker' ||
    targetArgument === 'embedding-worker'
      ? targetArgument
      : undefined;

  if (
    (profile !== 'real' && profile !== 'fake') ||
    (target !== 'web' && target !== 'document-worker' && target !== 'embedding-worker')
  ) {
    throw new Error(
      'Usage: start-local-rag.ts <real|fake> <web|document-worker|embedding-worker> [arguments]',
    );
  }

  configureLocalRagProfile(process.env, profile, target);
  const documentConfiguration = loadDocumentConfiguration();
  const ragConfiguration = loadRagConfiguration();

  if (profile === 'real') {
    await inspectRealProfile();
  } else {
    console.info(
      JSON.stringify({
        profile: 'fake',
        providers: {
          embeddings: ragConfiguration.embedding.driver,
          answers: ragConfiguration.answer.driver,
        },
        vectorStore: ragConfiguration.vector.driver,
        ledger: 'memory',
        dataDirectory: documentConfiguration.dataDirectory,
      }),
    );
  }

  startTarget(target, forwardedArguments);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Local RAG startup failed.');
  process.exitCode = 1;
});
