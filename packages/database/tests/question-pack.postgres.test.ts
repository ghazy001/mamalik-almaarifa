import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.js';
import { migrateDatabase } from '../src/migrate.js';
import { importQuestionPack, readQuestionPack } from '../src/question-pack.js';
import { createQuestionRepository } from '../src/repository.js';
import { samplePack } from './pack-sample.js';

const url = process.env.DATABASE_URL;
if (!url || !/^\/mamalik_test_[0-9a-f]{32}$/.test(new URL(url).pathname))
  throw new Error('Use pnpm test:packs to create an isolated database');
const { db, close } = openDatabase(url);
const repository = createQuestionRepository(db);
beforeAll(() => migrateDatabase(db));
afterAll(close);

describe('transactional draft pack imports in PostgreSQL', () => {
  it('runs without superuser privilege and creates only audited drafts', async () => {
    const role = await db.execute<{ rolsuper: boolean }>(
      sql`SELECT rolsuper FROM pg_roles WHERE rolname = current_user`,
    );
    expect(role.rows[0]?.rolsuper).toBe(false);
    const result = await importQuestionPack(
      db,
      samplePack('draft-only'),
      'pack-author',
    );
    expect(result).toMatchObject({
      draftsCreated: 2,
      existingQuestions: 0,
      publishedByImport: 0,
    });
    for (const entry of result.entries) {
      expect(await repository.getRevision(entry.questionId, 1)).toMatchObject({
        status: 'DRAFT',
        author: 'pack-author',
        reviewer: null,
      });
      expect(
        (await repository.history(entry.questionId)).map((row) => row.action),
      ).toEqual(['DRAFT_CREATED']);
    }
    expect(await repository.loadPublished()).toHaveLength(0);
  });

  it('retries exact content without duplicate audit or overwriting editorial revisions', async () => {
    const pack = samplePack('retry');
    const first = await importQuestionPack(db, pack, 'original-author');
    const id = first.entries[0]!.questionId;
    await repository.revise(
      id,
      1,
      {
        ...pack.questions[0]!.content,
        explanation: 'تفسير معدل للمراجعة البشرية.',
      },
      'editor',
    );
    const retry = await importQuestionPack(db, pack, 'retry-operator');
    expect(retry).toMatchObject({
      draftsCreated: 0,
      existingQuestions: 2,
      publishedByImport: 0,
    });
    expect(retry.entries[0]).toMatchObject({
      questionId: id,
      revision: 2,
      created: false,
    });
    expect(await repository.getRevision(id, 2)).toMatchObject({
      author: 'editor',
      content: { explanation: 'تفسير معدل للمراجعة البشرية.' },
    });
    expect(await repository.history(id)).toHaveLength(2);
    expect(await repository.history(first.entries[1]!.questionId)).toHaveLength(
      1,
    );
  });

  it('rolls back earlier entries when the same key has changed content', async () => {
    const pack = samplePack('drift');
    const original = await importQuestionPack(db, pack, 'author');
    pack.questions.unshift({
      ...structuredClone(pack.questions[0]!),
      key: 'aaa-new',
      content: {
        ...structuredClone(pack.questions[0]!.content),
        text: 'سؤال جديد ينبغي التراجع عن إدراجه؟',
      },
    });
    pack.questions[1]!.content.explanation += ' changed';
    await expect(importQuestionPack(db, pack, 'author')).rejects.toMatchObject({
      code: 'PACK_CHANGED',
    });
    const stored = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM content.questions WHERE import_key LIKE 'pack:drift:%'`,
    );
    expect(stored.rows[0]?.count).toBe(2);
    expect(
      await repository.history(original.entries[0]!.questionId),
    ).toHaveLength(1);
  });

  it('serializes concurrent retries even when input orders differ', async () => {
    const pack = samplePack('concurrent');
    const reversed = structuredClone(pack);
    reversed.questions.reverse();
    const results = await Promise.all([
      importQuestionPack(db, pack, 'one'),
      importQuestionPack(db, reversed, 'two'),
    ]);
    expect(results.map((result) => result.draftsCreated).sort()).toEqual([
      0, 2,
    ]);
    expect(results[0]!.entries.map((entry) => entry.questionId)).toEqual(
      results[1]!.entries.map((entry) => entry.questionId),
    );
    for (const entry of results[0]!.entries)
      expect(await repository.history(entry.questionId)).toHaveLength(1);
  });

  it('keeps existing independent-review and publication guards', async () => {
    const result = await importQuestionPack(db, samplePack('guards'), 'author');
    const id = result.entries[0]!.questionId;
    await expect(repository.publish(id, 1, 'publisher')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    });
    await expect(
      repository.approve(id, 1, 'author', 'self'),
    ).rejects.toMatchObject({ code: 'SELF_REVIEW' });
    expect(await repository.history(id)).toHaveLength(1);
    expect(await repository.loadPublished()).toHaveLength(0);
  });

  it('validates the entire batch and author before mutation', async () => {
    const pack = samplePack('invalid');
    const invalid = structuredClone(pack);
    invalid.questions[1]!.content.sources = [];
    await expect(importQuestionPack(db, invalid, 'author')).rejects.toThrow();
    await expect(
      importQuestionPack(db, pack, 'invalid actor'),
    ).rejects.toThrow();
    const stored = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM content.questions WHERE import_key LIKE 'pack:invalid:%'`,
    );
    expect(stored.rows[0]?.count).toBe(0);
  });

  const privateFile = process.env.QUESTION_PACK_TEST_FILE;
  if (privateFile)
    it('locally verifies the private candidate pack without publishing or printing answers', async () => {
      const pack = await readQuestionPack(privateFile);
      expect(pack.questions.length).toBeGreaterThanOrEqual(36);
      const first = await importQuestionPack(
        db,
        pack,
        'machine-assisted-draft',
      );
      const retry = await importQuestionPack(db, pack, 'retry-operator');
      expect(first.draftsCreated).toBe(pack.questions.length);
      expect(retry.existingQuestions).toBe(pack.questions.length);
      for (const entry of first.entries)
        expect(await repository.getRevision(entry.questionId, 1)).toMatchObject(
          { status: 'DRAFT', reviewer: null },
        );
      expect(await repository.loadPublished()).toHaveLength(0);
    });
});
