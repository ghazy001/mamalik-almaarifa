import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { ContentDatabase } from './client.js';
import {
  actorSchema,
  ContentError,
  noteSchema,
  questionContentSchema,
  questionIdSchema,
  revisionSchema,
} from './content.js';
import { audit, questions, revisions } from './schema.js';

type Transaction = Parameters<Parameters<ContentDatabase['transaction']>[0]>[0];

async function lockQuestion(tx: Transaction, id: string) {
  const [question] = await tx
    .select()
    .from(questions)
    .where(eq(questions.id, questionIdSchema.parse(id)))
    .for('update');
  if (!question) throw new ContentError('NOT_FOUND');
  return question;
}

async function findRevision(
  tx: Transaction,
  questionId: string,
  revision: number,
) {
  const [row] = await tx
    .select()
    .from(revisions)
    .where(
      and(
        eq(revisions.questionId, questionId),
        eq(revisions.revision, revisionSchema.parse(revision)),
      ),
    );
  if (!row) throw new ContentError('NOT_FOUND');
  return row;
}

async function record(
  tx: Transaction,
  questionId: string,
  revision: number,
  action: (typeof audit.$inferInsert)['action'],
  actor: string,
  note: string | null = null,
) {
  await tx.insert(audit).values({ questionId, revision, action, actor, note });
}

// This API is for a trusted server/CLI. Actor labels are audit metadata, not auth.
export function createQuestionRepository(db: ContentDatabase) {
  return {
    async createDraft(
      input: unknown,
      authorInput: string,
      importKey: string | null = null,
    ) {
      const content = questionContentSchema.parse(input);
      const author = actorSchema.parse(authorInput);
      const key = importKey === null ? null : actorSchema.parse(importKey);
      return db.transaction(async (tx) => {
        const id = randomUUID();
        const inserted = await tx
          .insert(questions)
          .values({ id, latestRevision: 1, importKey: key })
          .onConflictDoNothing({ target: questions.importKey })
          .returning();
        if (!inserted.length) {
          const [existing] = await tx
            .select()
            .from(questions)
            .where(eq(questions.importKey, key!));
          if (!existing) throw new ContentError('NOT_FOUND');
          return {
            questionId: existing.id,
            revision: existing.latestRevision,
            created: false,
          };
        }
        await tx
          .insert(revisions)
          .values({ questionId: id, revision: 1, content, author });
        await record(tx, id, 1, 'DRAFT_CREATED', author);
        return { questionId: id, revision: 1, created: true };
      });
    },

    async revise(
      id: string,
      expectedRevision: number,
      input: unknown,
      authorInput: string,
    ) {
      const content = questionContentSchema.parse(input);
      const author = actorSchema.parse(authorInput);
      revisionSchema.parse(expectedRevision);
      return db.transaction(async (tx) => {
        const question = await lockQuestion(tx, id);
        if (question.latestRevision !== expectedRevision)
          throw new ContentError('STALE_REVISION');
        const revision = revisionSchema.parse(expectedRevision + 1);
        await tx
          .update(questions)
          .set({ latestRevision: revision })
          .where(eq(questions.id, id));
        await tx
          .insert(revisions)
          .values({ questionId: id, revision, content, author });
        await record(tx, id, revision, 'DRAFT_CREATED', author);
        return { questionId: id, revision };
      });
    },

    async approve(
      id: string,
      revision: number,
      reviewerInput: string,
      noteInput: string,
    ) {
      const reviewer = actorSchema.parse(reviewerInput);
      const note = noteSchema.parse(noteInput);
      await db.transaction(async (tx) => {
        const question = await lockQuestion(tx, id);
        const row = await findRevision(tx, id, revision);
        if (question.latestRevision !== revision)
          throw new ContentError('STALE_REVISION');
        if (row.status !== 'DRAFT') throw new ContentError('INVALID_STATUS');
        if (row.author === reviewer) throw new ContentError('SELF_REVIEW');
        questionContentSchema.parse(row.content);
        await tx
          .update(revisions)
          .set({
            status: 'APPROVED',
            reviewer,
            reviewNote: note,
            reviewedAt: sql`now()`,
          })
          .where(
            and(eq(revisions.questionId, id), eq(revisions.revision, revision)),
          );
        await record(tx, id, revision, 'APPROVED', reviewer, note);
      });
    },

    async publish(id: string, revision: number, actorInput: string) {
      const actor = actorSchema.parse(actorInput);
      await db.transaction(async (tx) => {
        const question = await lockQuestion(tx, id);
        const row = await findRevision(tx, id, revision);
        if (question.latestRevision !== revision)
          throw new ContentError('STALE_REVISION');
        if (row.status !== 'APPROVED') throw new ContentError('INVALID_STATUS');
        questionContentSchema.parse(row.content);
        const retired = await tx
          .update(revisions)
          .set({ status: 'RETIRED' })
          .where(
            and(
              eq(revisions.questionId, id),
              eq(revisions.status, 'PUBLISHED'),
            ),
          )
          .returning();
        for (const previous of retired)
          await record(
            tx,
            id,
            previous.revision,
            'RETIRED',
            actor,
            'Replaced by a newer reviewed revision',
          );
        await tx
          .update(revisions)
          .set({ status: 'PUBLISHED' })
          .where(
            and(eq(revisions.questionId, id), eq(revisions.revision, revision)),
          );
        await record(tx, id, revision, 'PUBLISHED', actor);
      });
    },

    async retire(
      id: string,
      revision: number,
      actorInput: string,
      noteInput: string,
    ) {
      const actor = actorSchema.parse(actorInput);
      const note = noteSchema.parse(noteInput);
      await db.transaction(async (tx) => {
        await lockQuestion(tx, id);
        const row = await findRevision(tx, id, revision);
        if (row.status !== 'PUBLISHED')
          throw new ContentError('INVALID_STATUS');
        await tx
          .update(revisions)
          .set({ status: 'RETIRED' })
          .where(
            and(eq(revisions.questionId, id), eq(revisions.revision, revision)),
          );
        await record(tx, id, revision, 'RETIRED', actor, note);
      });
    },

    // Read once when preparing a future room; never query for each answer.
    // These include secret answers and must stay on the server.
    async loadPublished() {
      const rows = await db
        .select()
        .from(revisions)
        .where(eq(revisions.status, 'PUBLISHED'))
        .orderBy(asc(revisions.questionId));
      return rows.map((row) => ({
        id: `${row.questionId}_v${row.revision}`,
        questionId: row.questionId,
        revision: row.revision,
        content: questionContentSchema.parse(row.content),
      }));
    },

    async list() {
      return db
        .select({
          questionId: revisions.questionId,
          revision: revisions.revision,
          status: revisions.status,
          category: sql<string>`${revisions.content}->>'category'`,
          author: revisions.author,
          reviewer: revisions.reviewer,
        })
        .from(revisions)
        .orderBy(asc(revisions.questionId), asc(revisions.revision));
    },

    async history(id: string) {
      return db
        .select()
        .from(audit)
        .where(eq(audit.questionId, questionIdSchema.parse(id)))
        .orderBy(asc(audit.id));
    },
  };
}
