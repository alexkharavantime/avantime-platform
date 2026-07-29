import { getAiCostSummary } from '../lib/ai-cost-report';

async function main() {
  const companyArgument = process.argv.find((argument) => argument.startsWith('--company='));
  const companyId = companyArgument?.slice('--company='.length).trim() || undefined;
  try {
    const summary = await getAiCostSummary({ companyId });
    console.log(JSON.stringify({ status: 'ready', currency: 'EUR', summary }, null, 2));
  } catch {
    console.error(
      JSON.stringify({
        status: 'unavailable',
        errorCode: 'AI_COST_LEDGER_UNAVAILABLE',
      }),
    );
    process.exitCode = 1;
  }
}

void main();
