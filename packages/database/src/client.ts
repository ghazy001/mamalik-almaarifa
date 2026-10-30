import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';

export const databaseUrlSchema = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
    url.pathname.length > 1
  );
}, 'A PostgreSQL connection URL with a database name is required');

export function openDatabase(url: string) {
  const pool = new Pool({
    connectionString: databaseUrlSchema.parse(url),
    max: 4,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    application_name: 'mamalik-content',
  });
  return { db: drizzle(pool), close: () => pool.end() };
}
export type ContentDatabase = ReturnType<typeof openDatabase>['db'];
