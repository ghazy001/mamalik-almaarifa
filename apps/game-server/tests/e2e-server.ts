/** Trusted browser-test fixture only. Production index.ts always uses normal rules. */
import { createGameService } from '../src/server.js';
import { readConfig } from '../src/config.js';
const config = readConfig(process.env);
const service = createGameService({ seed: 2026, rules: { maxTurns: 6 } });
let closing = false;
const close = () => {
  if (closing) return;
  closing = true;
  void service.gracefullyShutdown(false);
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
await service.listen(config.GAME_SERVER_PORT, config.GAME_SERVER_HOST);
