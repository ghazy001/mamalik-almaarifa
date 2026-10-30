import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.js';
import { migrateDatabase } from '../src/migrate.js';
import { createQuestionRepository } from '../src/repository.js';
import { audit, revisions } from '../src/schema.js';
import { sampleContent } from './sample.js';
import { createAccessRepository } from '../src/access.js';
import { contentActor } from '../src/permissions.js';

const url = process.env.DATABASE_URL;
// Never run this file directly against a developer's content database.
if (!url || !/^\/mamalik_test_[0-9a-f]{32}$/.test(new URL(url).pathname))
  throw new Error('Use pnpm test:database to create an isolated database');
const { db, close } = openDatabase(url);
const repository = createQuestionRepository(db);
const access = createAccessRepository(db);

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

describe('database content authorization', () => {
  const identity = {
    issuer: 'https://project.example/auth/v1',
    subject: randomUUID(),
  };
  it('defaults to no roles, scopes roles by project, and audits retry-safe operator changes', async () => {
    expect(await access.roles(identity)).toEqual([]);
    await expect(
      access.authorize(identity, 'read', (questions) => questions.list()),
    ).rejects.toThrow('FORBIDDEN');
    expect(await access.grant(identity, 'editor', 'operator')).toBe(true);
    expect(await access.grant(identity, 'editor', 'operator')).toBe(false);
    expect(
      await access.roles({
        ...identity,
        issuer: 'https://other.example/auth/v1',
      }),
    ).toEqual([]);
    await expect(
      access.authorize(identity, 'publish', async () => true),
    ).rejects.toThrow('FORBIDDEN');
    const events = await db.execute<{ action: string }>(
      sql`SELECT action FROM content.access_audit WHERE subject = ${identity.subject} ORDER BY id`,
    );
    expect(events.rows.map((row) => row.action)).toEqual(['GRANT']);
    await expect(
      db.execute(
        sql`UPDATE content.access_audit SET actor = 'changed' WHERE subject = ${identity.subject}`,
      ),
    ).rejects.toThrow();
  });
  it('holds a membership lock through the content transaction and makes revocation effective afterward', async () => {
    await access.authorize(identity, 'edit', async () => {
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL lock_timeout = '50ms'`);
          await createAccessRepository(tx).revoke(
            identity,
            'editor',
            'operator',
          );
        }),
      ).rejects.toMatchObject({ cause: { code: '55P03' } });
      return true;
    });
    expect(await access.revoke(identity, 'editor', 'operator')).toBe(true);
    expect(await access.revoke(identity, 'editor', 'operator')).toBe(false);
    expect(await access.roles(identity)).toEqual([]);
  });
  it('rolls back a failed command, ledger row and draft together, then permits a clean retry', async () => {
    await access.grant(identity, 'editor', 'operator');
    const key = randomUUID(),
      input = { type: 'CREATE_DRAFT', content: sampleContent };
    const before = await repository.list();
    await expect(
      access.command(identity, 'edit', key, input, async (questions, actor) => {
        await questions.createDraft(sampleContent, actor);
        throw new Error('test failure');
      }),
    ).rejects.toThrow('test failure');
    expect(await repository.list()).toEqual(before);
    const count = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM content.requests WHERE key = ${key}`,
    );
    expect(count.rows[0]?.count).toBe(0);
    const result = await access.command(
      identity,
      'edit',
      key,
      input,
      (questions, actor) => questions.createDraft(sampleContent, actor),
    );
    expect(result).toHaveProperty('questionId');
    expect(
      contentActor({ ...identity, subject: identity.subject.toUpperCase() }),
    ).toBe(contentActor(identity));
  });
  it('denies an unprivileged role even if SELECT is accidentally granted on private tables', async () => {
    const reader = process.env.DATABASE_TEST_READER_ROLE;
    if (!reader || !/^mamalik_reader_[0-9a-f]{32}$/.test(reader))
      throw new Error('Missing isolated reader role');
    await db.execute(
      sql`GRANT USAGE ON SCHEMA content TO ${sql.identifier(reader)}`,
    );
    await db.execute(
      sql`GRANT SELECT ON ALL TABLES IN SCHEMA content TO ${sql.identifier(reader)}`,
    );
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE ${sql.identifier(reader)}`);
      for (const table of [
        'question_revisions',
        'questions',
        'question_audit',
        'memberships',
        'access_audit',
        'requests',
      ]) {
        const result = await tx.execute(
          sql`SELECT * FROM content.${sql.identifier(table)}`,
        );
        expect(result.rows).toEqual([]);
      }
    });
  });
});
