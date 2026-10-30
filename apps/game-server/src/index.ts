import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { readConfig } from './config.js';
import { createGameService } from './server.js';
import { openDatabase } from '@mamalik/database';
import { createContentAuthenticator } from './content-auth.js';

loadEnv({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
});
async function start() {
  const config = readConfig(process.env);
  const database = config.CONTENT_ADMIN_ENABLED
    ? openDatabase(config.DATABASE_URL!)
    : null;
  // Fail on unavailable/unmigrated content storage; do not serve an unprotected fallback.
  if (database) {
    try {
      await database.db.execute(
        'SELECT m.issuer, m.subject, m.role FROM content.memberships m CROSS JOIN content.requests r CROSS JOIN content.access_audit a LIMIT 0',
      );
    } catch {
      await database.close();
      throw new Error('CONTENT_START_FAILED');
    }
  }
  const service = createGameService(
    {},
    database
      ? {
          db: database.db,
          authenticate: createContentAuthenticator(
            config.SUPABASE_URL!,
            config.SUPABASE_PUBLISHABLE_KEY!,
          ),
        }
      : undefined,
  );
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    console.info(JSON.stringify({ event: 'service_stopping' }));
    await service.gracefullyShutdown(false);
    await database?.close();
  }
  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
  try {
    await service.listen(config.GAME_SERVER_PORT, config.GAME_SERVER_HOST);
    console.info(
      JSON.stringify({
        event: 'service_started',
        host: config.GAME_SERVER_HOST,
        port: config.GAME_SERVER_PORT,
        milestone: 'M4',
        contentAdminEnabled: Boolean(database),
      }),
    );
  } catch {
    console.error(JSON.stringify({ event: 'service_start_failed' }));
    await shutdown();
    process.exitCode = 1;
  }
}
start().catch(() => {
  console.error(JSON.stringify({ event: 'service_start_failed' }));
  process.exitCode = 1;
});
