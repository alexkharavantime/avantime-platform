import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  completeLocalFirstOwnerSetup,
  LocalFirstOwnerSetupError,
  prepareLocalFirstOwnerAccount,
  validateLocalFirstOwnerEnvironment,
} from '../lib/local-first-owner-bootstrap';
import { PlatformOwnerBootstrapError } from '../lib/platform-owner-bootstrap';

const email = process.argv[3] ?? '';

async function writeActivationFile(token: string, expiresAt: Date) {
  const { appOrigin } = validateLocalFirstOwnerEnvironment(process.env, 'prepare');
  const root = process.env.LOCALAPPDATA ?? path.join(homedir(), '.local', 'state');
  const directory = path.join(root, 'Avantime', `first-owner-${randomUUID()}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });

  try {
    if (process.platform === 'win32') {
      const account = process.env.USERNAME
        ? `${process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\` : ''}${process.env.USERNAME}`
        : '';
      if (!account) throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_FILE_ACL_FAILED');
      const acl = spawnSync(
        'icacls.exe',
        [directory, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)F`],
        { stdio: 'ignore' },
      );
      if (acl.status !== 0) {
        throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_FILE_ACL_FAILED');
      }
    } else {
      await chmod(directory, 0o700);
    }

    const activationUrl = new URL('/portal/reset-password', appOrigin);
    activationUrl.searchParams.set('token', token);
    const filePath = path.join(directory, 'activation-link.txt');
    await writeFile(
      filePath,
      `${activationUrl.toString()}\nExpires at ${expiresAt.toISOString()}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    return { directory, filePath };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function prepare() {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const activationFile = await writeActivationFile(token, expiresAt);
  try {
    const result = await prepareLocalFirstOwnerAccount({ email, token, expiresAt });
    console.log(
      JSON.stringify(
        {
          status: 'prepared',
          email,
          accountCreated: result.accountCreated,
          activationFile: activationFile.filePath,
          expiresAt: result.expiresAt,
          activationTokenPrinted: false,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await rm(activationFile.directory, { recursive: true, force: true });
    throw error;
  }
}

async function complete() {
  const result = await completeLocalFirstOwnerSetup({ email });
  console.log(JSON.stringify({ status: 'completed', ...result }, null, 2));
}

async function main() {
  const operation = process.argv[2];
  if (operation === 'prepare') await prepare();
  else if (operation === 'complete') await complete();
  else throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_COMMAND_INVALID');
}

main().catch((error: unknown) => {
  const code =
    error instanceof LocalFirstOwnerSetupError || error instanceof PlatformOwnerBootstrapError
      ? error.code
      : 'LOCAL_FIRST_OWNER_SETUP_FAILED';
  console.error(JSON.stringify({ status: 'failed', code }));
  process.exitCode = 1;
});