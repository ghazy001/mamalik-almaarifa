import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.js';
import { migrateDatabase } from '../src/migrate.js';
import { createQuestionRepository } from '../src/repository.js';
import { audit, revisions } from '../src/schema.js';
import { sampleContent } from './sample.js';

const url = process.env.DATABASE_URL;
// Never run this file directly against a developer's content database.
if (!url || !/^\/mamalik_test_[0-9a-f]{32}$/.test(new URL(url).pathname))
  throw new Error('Use pnpm test:database to create an isolated database');
const { db, close } = openDatabase(url);
const repository = createQuestionRepository(db);

beforeAll(async () => {
  await migrateDatabase(db);
  await migrateDatabase(db);
});
afterAll(close);

describe('real PostgreSQL content workflow', () => {
  it('migrates idempotently under a non-superuser and keeps the content schema private', async () => {
    const role = await db.execute<{
      rolsuper: boolean;
      rolcreaterole: boolean;
    }>(
      sql`SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname = current_user`,
    );
    expect(role.rows[0]).toEqual({ rolsuper: false, rolcreaterole: false });
    const privileges = await db.execute<{ granted: boolean }>(
      sql`SELECT EXISTS (SELECT 1 FROM pg_namespace n, aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a WHERE n.nspname = 'content' AND a.grantee = 0) AS granted`,
    );
    expect(privileges.rows[0]?.granted).toBe(false);
  });

  it('imports drafts idempotently without publishing or replacing existing content', async () => {
    const first = await repository.createDraft(
      sampleContent,
      'author',
      'fixture:example',
    );
    const retry = await repository.createDraft(
      { ...sampleContent, text: 'نص مختلف' },
      'other-author',
      'fixture:example',
    );
    expect(retry).toEqual({ ...first, created: false });
    expect(await repository.history(first.questionId)).toHaveLength(1);
    expect(await repository.loadPublished()).toEqual([]);
  });

  it('rejects publication without review, self-review, blank notes and unknown IDs without audit changes', async () => {
    const { questionId: id } = await repository.createDraft(
      sampleContent,
      'author',
    );
    await expect(repository.publish(id, 1, 'publisher')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    });
    await expect(
      repository.approve(id, 1, 'author', 'checked'),
    ).rejects.toMatchObject({ code: 'SELF_REVIEW' });
    await expect(repository.approve(id, 1, 'reviewer', ' ')).rejects.toThrow();
    await expect(
      repository.approve(randomUUID(), 1, 'reviewer', 'checked'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(
      (await repository.list()).find((row) => row.questionId === id)?.status,
    ).toBe('DRAFT');
    expect(await repository.history(id)).toHaveLength(1);
  });

  it('publishes reviewed content, snapshots revisions, and atomically replaces only after new review', async () => {
    const { questionId: id } = await repository.createDraft(
      sampleContent,
      'author',
    );
    await repository.approve(
      id,
      1,
      'reviewer',
      'Checked source, Arabic and answer',
    );
    await repository.publish(id, 1, 'publisher');
    const snapshot = (await repository.loadPublished()).find(
      (row) => row.questionId === id,
    )!;
    expect(snapshot.id).toBe(`${id}_v1`);
    await repository.revise(
      id,
      1,
      { ...sampleContent, explanation: 'تفسير مُراجع جديد.' },
      'editor',
    );
    expect(
      (await repository.loadPublished()).find((row) => row.questionId === id)
        ?.revision,
    ).toBe(1);
    await expect(repository.publish(id, 2, 'publisher')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    });
    await repository.approve(
      id,
      2,
      'reviewer',
      'Rechecked changed explanation',
    );
    await repository.publish(id, 2, 'publisher');
    expect(
      (await repository.loadPublished())
        .filter((row) => row.questionId === id)
        .map((row) => row.revision),
    ).toEqual([2]);
    expect(snapshot.content.explanation).toBe(sampleContent.explanation);
    expect(
      (await repository.list())
        .filter((row) => row.questionId === id)
        .map((row) => row.status),
    ).toEqual(['RETIRED', 'PUBLISHED']);
    expect((await repository.history(id)).map((row) => row.action)).toEqual([
      'DRAFT_CREATED',
      'APPROVED',
      'PUBLISHED',
      'DRAFT_CREATED',
      'APPROVED',
      'RETIRED',
      'PUBLISHED',
    ]);
    await repository.retire(
      id,
      2,
      'publisher',
      'Removed pending factual recheck',
    );
    expect(
      (await repository.loadPublished()).some((row) => row.questionId === id),
    ).toBe(false);
    await expect(repository.publish(id, 2, 'publisher')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    });
  });

  it('serializes competing edits and rejects stale approvals', async () => {
    const { questionId: id } = await repository.createDraft(
      sampleContent,
      'author',
    );
    const results = await Promise.allSettled([
      repository.revise(id, 1, sampleContent, 'editor-one'),
      repository.revise(id, 1, sampleContent, 'editor-two'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { code: 'STALE_REVISION' } });
    await expect(
      repository.approve(id, 1, 'reviewer', 'checked'),
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
    expect(await repository.history(id)).toHaveLength(2);
  });

  it('serializes duplicate publication with one winner and one audit record', async () => {
    const { questionId: id } = await repository.createDraft(
      sampleContent,
      'author',
    );
    await repository.approve(id, 1, 'reviewer', 'checked');
    const results = await Promise.allSettled([
      repository.publish(id, 1, 'publisher'),
      repository.publish(id, 1, 'publisher'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { code: 'INVALID_STATUS' } });
    expect(
      (await repository.history(id)).filter(
        (row) => row.action === 'PUBLISHED',
      ),
    ).toHaveLength(1);
  });

  it('rolls back status changes when writing the audit fails', async () => {
    const { questionId: id } = await repository.createDraft(
      sampleContent,
      'author',
    );
    await repository.approve(id, 1, 'reviewer', 'checked');
    await repository.publish(id, 1, 'publisher');
    await repository.revise(
      id,
      1,
      { ...sampleContent, explanation: 'مراجعة ثانية.' },
      'editor',
    );
    await repository.approve(id, 2, 'reviewer', 'checked again');
    await db.execute(
      sql`CREATE FUNCTION content.test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'PUBLISHED' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$`,
    );
    await db.execute(
      sql`CREATE TRIGGER test_reject_audit BEFORE INSERT ON content.question_audit FOR EACH ROW EXECUTE FUNCTION content.test_reject_audit()`,
    );
    try {
      await expect(repository.publish(id, 2, 'publisher')).rejects.toThrow();
      expect(
        (await repository.list())
          .filter((row) => row.questionId === id)
          .map((row) => row.status),
      ).toEqual(['PUBLISHED', 'APPROVED']);
      expect(
        (await repository.loadPublished()).find((row) => row.questionId === id)
          ?.revision,
      ).toBe(1);
      expect(await repository.history(id)).toHaveLength(5);
    } finally {
      await db.execute(
        sql`DROP TRIGGER test_reject_audit ON content.question_audit`,
      );
      await db.execute(sql`DROP FUNCTION content.test_reject_audit()`);
    }
  });

  it('enforces immutable content, audit entries and legal transitions even for direct SQL', async () => {
    const { questionId: id } = await repository.createDraft(
      sampleContent,
      'author',
    );
    await expect(
      db
        .update(revisions)
        .set({ content: { ...sampleContent, correctChoiceId: 'b' } })
        .where(eq(revisions.questionId, id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(revisions)
        .set({ status: 'PUBLISHED' })
        .where(eq(revisions.questionId, id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(audit)
        .set({ actor: 'rewritten' })
        .where(eq(audit.questionId, id)),
    ).rejects.toThrow();
    expect(await repository.history(id)).toHaveLength(1);
  });

  it('rejects invalid content before any row is inserted', async () => {
    const before = await repository.list();
    await expect(
      repository.createDraft({ ...sampleContent, sources: [] }, 'author'),
    ).rejects.toThrow();
    expect(await repository.list()).toEqual(before);
  });
});
