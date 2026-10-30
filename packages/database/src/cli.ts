import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { ZodError } from 'zod';
import { openDatabase } from './client.js';
import { ContentError } from './content.js';
import { migrateDatabase } from './migrate.js';
import { createQuestionRepository } from './repository.js';

config({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
});

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const sizes: Record<string, number> = {
    migrate: 0,
    'import-fixtures': 0,
    list: 0,
    draft: 2,
    revise: 4,
    approve: 4,
    publish: 3,
    retire: 4,
    history: 1,
    'bank-check': 0,
  };
  if (!command || sizes[command] !== args.length) throw new Error('USAGE');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_REQUIRED');
  const { db, close } = openDatabase(url);
  const repository = createQuestionRepository(db);
  try {
    if (command === 'migrate') {
      await migrateDatabase(db);
      console.log('Migrations applied');
    } else if (command === 'import-fixtures') {
      const { QUESTION_FIXTURES } = await import('@mamalik/question-fixtures');
      let created = 0;
      let skipped = 0;
      for (const fixture of QUESTION_FIXTURES) {
        if (!fixture.source) {
          skipped++;
          continue;
        }
        const result = await repository.createDraft(
          {
            locale: 'ar',
            category: fixture.category,
            text: fixture.question.text,
            choices: fixture.question.choices,
            correctChoiceId: fixture.question.correctChoiceId,
            explanation: fixture.explanation,
            sources: [fixture.source],
          },
          'development-import',
          `fixture:${fixture.question.id}`,
        );
        if (result.created) created++;
      }
      console.log(
        JSON.stringify({
          draftsCreated: created,
          skippedWithoutReference: skipped,
          publishedByImport: 0,
        }),
      );
    } else if (command === 'list')
      console.log(JSON.stringify(await repository.list(), null, 2));
    else if (command === 'history')
      console.log(JSON.stringify(await repository.history(args[0]!), null, 2));
    else if (command === 'draft')
      console.log(
        JSON.stringify(
          await repository.createDraft(
            JSON.parse(await readFile(args[0]!, 'utf8')),
            args[1]!,
          ),
        ),
      );
    else if (command === 'revise')
      console.log(
        JSON.stringify(
          await repository.revise(
            args[0]!,
            Number(args[1]),
            JSON.parse(await readFile(args[2]!, 'utf8')),
            args[3]!,
          ),
        ),
      );
    else if (command === 'approve') {
      await repository.approve(args[0]!, Number(args[1]), args[2]!, args[3]!);
      console.log('Revision approved');
    } else if (command === 'publish') {
      await repository.publish(args[0]!, Number(args[1]), args[2]!);
      console.log('Revision published');
    } else if (command === 'retire') {
      await repository.retire(args[0]!, Number(args[1]), args[2]!, args[3]!);
      console.log('Revision retired');
    } else if (command === 'bank-check') {
      const bank = await repository.loadPublished();
      console.log(
        JSON.stringify({
          publishedQuestions: bank.length,
          ids: bank.map((item) => item.id),
        }),
      );
    }
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  // Do not print database URLs, SQL parameters, question answers or driver errors.
  const code =
    error instanceof ContentError
      ? error.code
      : error instanceof ZodError
        ? 'INVALID_INPUT'
        : error instanceof Error &&
            ['USAGE', 'DATABASE_URL_REQUIRED'].includes(error.message)
          ? error.message
          : 'DATABASE_OPERATION_FAILED';
  console.error(code);
  if (code === 'USAGE')
    console.error(
      'Commands: migrate | import-fixtures | list | draft <json-file> <author> | revise <id> <expected-revision> <json-file> <author> | approve <id> <revision> <reviewer> <note> | publish <id> <revision> <actor> | retire <id> <revision> <actor> <note> | history <id> | bank-check',
    );
  process.exitCode = 1;
});
