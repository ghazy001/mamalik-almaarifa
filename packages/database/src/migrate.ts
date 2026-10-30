import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { ContentDatabase } from './client.js';

export async function migrateDatabase(db: ContentDatabase) {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../migrations/', import.meta.url)),
  });
}
