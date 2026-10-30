import { createServer } from 'node:http';
import {
  createAccessRepository,
  createQuestionRepository,
  migrateDatabase,
  openDatabase,
} from '@mamalik/database';
import { createGameService } from '../src/server.js';
import { createContentAuthenticator } from '../src/content-auth.js';
import { startAuthFixture } from './support/auth-server.js';
import { CONTENT_ACCOUNTS } from './support/content-accounts.js';
const url = process.env.DATABASE_URL;
if (!url || !/^\/mamalik_test_[0-9a-f]{32}$/.test(new URL(url).pathname))
  throw new Error('Use pnpm test:content-web');
const database = openDatabase(url);
await migrateDatabase(database.db);
const auth = await startAuthFixture({
  port: 49001,
  accounts: Object.values(CONTENT_ACCOUNTS),
});
const access = createAccessRepository(database.db);
for (const role of ['editor', 'reviewer', 'publisher'] as const)
  await access.grant(
    { issuer: auth.issuer, subject: CONTENT_ACCOUNTS[role].id },
    role,
    'browser-fixture',
  );
await access.grant(
  { issuer: auth.issuer, subject: CONTENT_ACCOUNTS.editor.id },
  'reviewer',
  'browser-fixture',
);
await createQuestionRepository(database.db).createDraft(
  {
    locale: 'ar',
    category: 'المكتبة التجريبية',
    text: 'سؤال تحرير خاص للاختبار: أي كوكب هو الأقرب إلى الشمس؟',
    choices: [
      { id: 'a', text: 'عطارد' },
      { id: 'b', text: 'الأرض' },
      { id: 'c', text: 'المريخ' },
      { id: 'd', text: 'زحل' },
    ],
    correctChoiceId: 'a',
    explanation: 'مرجع تجريبي للتحقق من سرية المراجعة قبل منح الصلاحية.',
    sources: [
      { label: 'NASA', url: 'https://science.nasa.gov/solar-system/planets/' },
    ],
  },
  'browser-fixture',
);
const controls = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/stats') {
    response.end(JSON.stringify({ refreshes: auth.refreshes() }));
    return;
  }
  if (request.url === '/grant-ordinary' && request.method === 'POST') {
    await access.grant(
      { issuer: auth.issuer, subject: CONTENT_ACCOUNTS.ordinary.id },
      'editor',
      'browser-fixture',
    );
    response.end('{}');
    return;
  }
  if (request.url === '/revoke-ordinary' && request.method === 'POST') {
    await access.revoke(
      { issuer: auth.issuer, subject: CONTENT_ACCOUNTS.ordinary.id },
      'editor',
      'browser-fixture',
    );
    response.end('{}');
    return;
  }
  response.statusCode = 404;
  response.end('{}');
});
await new Promise<void>((resolve) =>
  controls.listen(49002, '127.0.0.1', resolve),
);
const service = createGameService(
  {},
  {
    db: database.db,
    authenticate: createContentAuthenticator(auth.url, auth.key),
    requestsPerMinute: 1000,
  },
);
await service.listen(2574, '127.0.0.1');
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await service.gracefullyShutdown(false);
  await auth.close();
  await new Promise<void>((resolve) => {
    controls.close(() => resolve());
    controls.closeAllConnections();
  });
  await database.close();
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
