import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const allowedSecrets = [
  'SESSION_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'OBJECT_STORAGE_ACCESS_KEY',
  'OBJECT_STORAGE_SECRET_KEY',
  'BACKUP_ENCRYPTION_KEY',
  'AUDIT_INTEGRITY_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
];
const placeholder =
  /(?:change[-_ ]?me|placeholder|replace[-_ ]?me|example|todo|xxx+|^<.+>$)/i;

for (const name of allowedSecrets) {
  const file = process.env[`${name}_FILE`];
  if (!file) continue;
  if (process.env[name]) {
    throw new Error(`${name} and ${name}_FILE must not be configured together.`);
  }
  const metadata = statSync(file);
  if (!metadata.isFile()) throw new Error(`${name}_FILE does not reference a file.`);
  const value = readFileSync(file, 'utf8').trim();
  if (value.length < 12 || placeholder.test(value)) {
    throw new Error(`${name}_FILE contains an invalid or placeholder value.`);
  }
  process.env[name] = value;
}

const [command, ...arguments_] = process.argv.slice(2);
if (!command) throw new Error('A runtime command is required.');

const child = spawn(command, arguments_, {
  env: process.env,
  stdio: 'inherit',
  shell: false,
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.once('error', (error) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      errorCode: 'STAGING_RUNTIME_START_FAILED',
      message: error.name,
    }),
  );
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
