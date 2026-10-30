import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { Client } from 'pg';
import { databaseUrlSchema } from '../src/client.js';

config({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
});

async function main() {
  const target = process.argv[2] ?? 'database';
  if (!['database', 'server', 'web', 'rooms'].includes(target))
    throw new Error('INVALID_TEST_TARGET');
  const adminUrl = process.env.DATABASE_TEST_ADMIN_URL;
  if (!adminUrl) throw new Error('DATABASE_TEST_ADMIN_URL_REQUIRED');
  const admin = new Client({
    connectionString: databaseUrlSchema.parse(adminUrl),
    connectionTimeoutMillis: 5000,
  });
  const suffix = randomUUID().replaceAll('-', '');
  // Identifiers are generated internally, never from environment/input.
  const database = `mamalik_test_${suffix}`;
  const role = `mamalik_test_${suffix}`;
  const reader = `mamalik_reader_${suffix}`;
  const password = randomBytes(24).toString('hex');
  let roleCreated = false;
  let databaseCreated = false;
  let readerCreated = false;
  await admin.connect();
  try {
    await admin.query(
      `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
    );
    roleCreated = true;
    await admin.query(
      `CREATE ROLE "${reader}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    );
    readerCreated = true;
    await admin.query(`GRANT "${reader}" TO "${role}"`);
    await admin.query(`CREATE DATABASE "${database}" OWNER "${role}"`);
    databaseCreated = true;
    const url = new URL(adminUrl);
    url.username = role;
    url.password = password;
    url.pathname = `/${database}`;
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            target === 'web'
              ? '../../../apps/web/node_modules/@playwright/test/cli.js'
              : '../../../node_modules/vitest/vitest.mjs',
            import.meta.url,
          ),
        ),
        target === 'web' ? 'test' : 'run',
        target === 'database'
          ? 'tests/postgres.integration.test.ts'
          : target === 'server'
            ? 'tests/content-admin.postgres.test.ts'
            : target === 'rooms'
              ? 'tests/published-bank.postgres.test.ts'
              : '--config=playwright.content.config.ts',
      ],
      {
        cwd: fileURLToPath(
          new URL(
            target === 'database'
              ? '../'
              : target === 'server' || target === 'rooms'
                ? '../../../apps/game-server/'
                : '../../../apps/web/',
            import.meta.url,
          ),
        ),
        stdio: 'inherit',
        env: {
          ...process.env,
          DATABASE_URL: url.href,
          DATABASE_TEST_ADMIN_URL: '',
          DATABASE_TEST_READER_ROLE: reader,
        },
      },
    );
    const interrupt = () => child.kill('SIGTERM');
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', interrupt);
    try {
      const code = await new Promise<number>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => resolve(code ?? 1));
      });
      process.exitCode = code;
    } finally {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', interrupt);
    }
  } finally {
    try {
      if (databaseCreated)
        await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      if (roleCreated) await admin.query(`DROP ROLE "${role}"`);
      if (readerCreated) await admin.query(`DROP ROLE "${reader}"`);
    } finally {
      await admin.end();
    }
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error &&
      error.message === 'DATABASE_TEST_ADMIN_URL_REQUIRED'
      ? error.message
      : 'DATABASE_TEST_SETUP_OR_CLEANUP_FAILED',
  );
  process.exitCode = 1;
});
