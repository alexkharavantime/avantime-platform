import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const requirements: Record<string, string[]> = {
  'docs/tasks/TASK-013.md': [
    '../GOVERNANCE_BOOTSTRAP.md',
    '../GOVERNANCE_VALIDATION.md',
    '../GOVERNANCE_EVIDENCE.md',
  ],
  'docs/GOVERNANCE_BOOTSTRAP.md': [
    './runbooks/platform-owner-bootstrap.md',
    './runbooks/platform-owner-recovery.md',
  ],
  'docs/GOVERNANCE_VALIDATION.md': ['Managed staging', 'PENDING', 'screen reader'],
  'docs/GOVERNANCE_EVIDENCE.md': ['Password', 'raw session', 'reviewer sign-off'],
  'docs/APPROVAL_WORKFLOW.md': ['requester cannot approve', 'atomic executor'],
  'docs/runbooks/platform-owner-bootstrap.md': ['Prerequisites', 'Failure', 'Evidence'],
  'docs/runbooks/platform-owner-recovery.md': ['Prerequisites', 'Failure', 'Evidence'],
  'docs/runbooks/support-session.md': ['Prerequisites', 'Failure', 'Evidence'],
  'docs/runbooks/approval-operations.md': ['Prerequisites', 'Failure', 'Evidence'],
  'docs/runbooks/knowledge-publication.md': ['Prerequisites', 'Failure', 'Evidence'],
  'docs/runbooks/governance-incident-response.md': ['Prerequisites', 'Rollback', 'Evidence'],
};

async function main() {
  const findings: string[] = [];
  for (const [file, markers] of Object.entries(requirements)) {
    let content = '';
    try {
      content = await readFile(path.join(repositoryRoot, file), 'utf8');
    } catch {
      findings.push(`${file}: missing`);
      continue;
    }
    for (const marker of markers) {
      if (!content.toLowerCase().includes(marker.toLowerCase())) {
        findings.push(`${file}: missing ${marker}`);
      }
    }
  }
  console.log(JSON.stringify({ status: findings.length === 0 ? 'passed' : 'failed', findings }));
  if (findings.length > 0) process.exitCode = 1;
}

void main().catch(() => {
  console.error(JSON.stringify({ status: 'failed', errorCode: 'GOVERNANCE_DOCS_CHECK_FAILED' }));
  process.exitCode = 1;
});
