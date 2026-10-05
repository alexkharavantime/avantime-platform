import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export function getRealAiBudgetAllowance(repositoryRoot: string, now = new Date()) {
  const dailyLimitEur = 0.25;
  const monthlyLimitEur = 1;
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const artifactsRoot = path.join(repositoryRoot, '.artifacts');
  const priorSpend = { daily: 0, monthly: 0 };
  const runDirectories = (
    existsSync(artifactsRoot) ? readdirSync(artifactsRoot, { withFileTypes: true }) : []
  )
    .filter(
      (entry) => entry.isDirectory() && /^document-kb-real-ai-[a-f0-9]{32}$/u.test(entry.name),
    )
    .map((entry) => path.join(artifactsRoot, entry.name));

  for (const runDirectory of runDirectories) {
    const summaryPath = path.join(runDirectory, 'usage-summary.json');
    if (!existsSync(summaryPath)) {
      throw new Error('A prior real-AI run has no usage summary; refusing to reset its budget.');
    }
    let summary: {
      generatedAt?: unknown;
      budgetImpactEur?: unknown;
      providerOperationCount?: unknown;
    };
    try {
      summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as typeof summary;
    } catch {
      throw new Error('A prior real-AI usage summary is unreadable; refusing to reset its budget.');
    }
    if (
      typeof summary.generatedAt !== 'string' ||
      !Number.isFinite(Date.parse(summary.generatedAt)) ||
      !Number.isFinite(summary.budgetImpactEur) ||
      Number(summary.budgetImpactEur) < 0 ||
      !Number.isSafeInteger(summary.providerOperationCount) ||
      Number(summary.providerOperationCount) < 0
    ) {
      throw new Error('A prior real-AI usage summary is invalid; refusing to reset its budget.');
    }
    const generatedDay = summary.generatedAt.slice(0, 10);
    if (generatedDay === day) priorSpend.daily += Number(summary.budgetImpactEur);
    if (generatedDay.slice(0, 7) === month) priorSpend.monthly += Number(summary.budgetImpactEur);
  }

  const dailyRemainingEur = Number(Math.max(0, dailyLimitEur - priorSpend.daily).toFixed(6));
  const monthlyRemainingEur = Number(Math.max(0, monthlyLimitEur - priorSpend.monthly).toFixed(6));
  if (dailyRemainingEur <= 0 || monthlyRemainingEur <= 0) {
    throw new Error('The cumulative real-AI budget is exhausted; refusing another provider run.');
  }
  return { dailyRemainingEur, monthlyRemainingEur };
}
