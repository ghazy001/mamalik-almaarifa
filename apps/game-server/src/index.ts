import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { readConfig } from './config.js';
import { createGameService } from './server.js';

loadEnv({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
});
const config = readConfig(process.env);
const service = createGameService();
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  console.info(JSON.stringify({ event: 'service_stopping' }));
  await service.gracefullyShutdown(false);
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
      milestone: 'M1',
    }),
  );
} catch {
  console.error(JSON.stringify({ event: 'service_start_failed' }));
  await shutdown();
  process.exitCode = 1;
}
