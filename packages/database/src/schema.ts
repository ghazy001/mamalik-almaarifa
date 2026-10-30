import { sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  foreignKey,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { QuestionContent } from './content.js';
import type { MatchArchive } from './match-archive.js';
import { CONTENT_ROLES } from './permissions.js';

// Not public: no PostgREST/browser exposure or grants to anonymous roles.
export const contentSchema = pgSchema('content');
export const contentRole = contentSchema.enum('content_role', CONTENT_ROLES);
export const revisionStatus = contentSchema.enum('revision_status', [
  'DRAFT',
  'APPROVED',
  'PUBLISHED',
  'RETIRED',
]);
export const auditAction = contentSchema.enum('audit_action', [
  'DRAFT_CREATED',
  'APPROVED',
  'PUBLISHED',
  'RETIRED',
]);
export const questions = contentSchema
  .table(
    'questions',
    {
      id: uuid('id').primaryKey(),
      latestRevision: integer('latest_revision').notNull(),
      importKey: text('import_key').unique(),
    },
    (table) => [check('positive_revision', sql`${table.latestRevision} > 0`)],
  )
  .enableRLS();

export const revisions = contentSchema
  .table(
    'question_revisions',
    {
      questionId: uuid('question_id')
        .notNull()
        .references(() => questions.id),
      revision: integer('revision').notNull(),
      content: jsonb('content').$type<QuestionContent>().notNull(),
      author: text('author').notNull(),
      status: revisionStatus('status').notNull().default('DRAFT'),
      reviewer: text('reviewer'),
      reviewNote: text('review_note'),
      createdAt: timestamp('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
      reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    },
    (table) => [
      primaryKey({ columns: [table.questionId, table.revision] }),
      uniqueIndex('one_published_revision')
        .on(table.questionId)
        .where(sql`${table.status} = 'PUBLISHED'`),
      check('positive_revision', sql`${table.revision} > 0`),
      check(
        'review_required',
        sql`(${table.status} = 'DRAFT' AND ${table.reviewer} IS NULL AND ${table.reviewNote} IS NULL AND ${table.reviewedAt} IS NULL) OR (${table.status} <> 'DRAFT' AND ${table.reviewer} IS NOT NULL AND ${table.reviewer} <> ${table.author} AND ${table.reviewNote} IS NOT NULL AND length(trim(${table.reviewNote})) > 0 AND ${table.reviewedAt} IS NOT NULL)`,
      ),
      check(
        'content_shape',
        sql`(jsonb_typeof(${table.content}) = 'object' AND ${table.content}->>'locale' = 'ar' AND jsonb_array_length(${table.content}->'choices') = 4 AND jsonb_array_length(${table.content}->'sources') >= 1) IS TRUE`,
      ),
    ],
  )
  .enableRLS();

export const audit = contentSchema
  .table(
    'question_audit',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      questionId: uuid('question_id').notNull(),
      revision: integer('revision').notNull(),
      action: auditAction('action').notNull(),
      actor: text('actor').notNull(),
      note: text('note'),
      createdAt: timestamp('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    },
    (table) => [
      foreignKey({
        columns: [table.questionId, table.revision],
        foreignColumns: [revisions.questionId, revisions.revision],
      }),
    ],
  )
  .enableRLS();

export const memberships = contentSchema
  .table(
    'memberships',
    {
      issuer: text('issuer').notNull(),
      subject: uuid('subject').notNull(),
      role: contentRole('role').notNull(),
    },
    (table) => [
      primaryKey({ columns: [table.issuer, table.subject, table.role] }),
    ],
  )
  .enableRLS();

export const accessAudit = contentSchema
  .table(
    'access_audit',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      issuer: text('issuer').notNull(),
      subject: uuid('subject').notNull(),
      role: contentRole('role').notNull(),
      action: text('action').notNull(),
      actor: text('actor').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    },
    (table) => [
      check('valid_access_action', sql`${table.action} IN ('GRANT', 'REVOKE')`),
    ],
  )
  .enableRLS();

export const requests = contentSchema
  .table(
    'requests',
    {
      issuer: text('issuer').notNull(),
      subject: uuid('subject').notNull(),
      key: text('key').notNull(),
      payloadHash: text('payload_hash').notNull(),
      response: jsonb('response').$type<unknown>(),
      createdAt: timestamp('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    },
    (table) => [
      primaryKey({ columns: [table.issuer, table.subject, table.key] }),
    ],
  )
  .enableRLS();

export const gameSchema = pgSchema('game');
export const matchResults = gameSchema
  .table(
    'match_results',
    {
      matchId: text('match_id').primaryKey(),
      payloadHash: text('payload_hash').notNull(),
      archive: jsonb('archive').$type<MatchArchive>().notNull(),
      recordedAt: timestamp('recorded_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    },
    (table) => [
      check('result_hash_shape', sql`${table.payloadHash} ~ '^[a-f0-9]{64}$'`),
      check(
        'result_archive_shape',
        sql`(jsonb_typeof(${table.archive}) = 'object' AND ${table.archive}->>'archiveVersion' = '1' AND ${table.archive}->>'matchId' = ${table.matchId} AND jsonb_array_length(${table.archive}->'result'->'placements') = 3) IS TRUE`,
      ),
    ],
  )
  .enableRLS();
export const resultQuestions = gameSchema
  .table(
    'result_questions',
    {
      matchId: text('match_id')
        .notNull()
        .references(() => matchResults.matchId),
      position: integer('position').notNull(),
      questionId: text('question_id').notNull(),
      contentQuestionId: uuid('content_question_id'),
      contentRevision: integer('content_revision'),
    },
    (table) => [
      primaryKey({ columns: [table.matchId, table.position] }),
      uniqueIndex('one_question_per_result').on(
        table.matchId,
        table.questionId,
      ),
      foreignKey({
        columns: [table.contentQuestionId, table.contentRevision],
        foreignColumns: [revisions.questionId, revisions.revision],
      }),
      check(
        'result_question_position',
        sql`${table.position} >= 0 AND ${table.position} < 120`,
      ),
      check(
        'result_question_reference',
        sql`(${table.contentQuestionId} IS NULL AND ${table.contentRevision} IS NULL) OR (${table.contentQuestionId} IS NOT NULL AND ${table.contentRevision} IS NOT NULL AND ${table.contentRevision} > 0 AND ${table.questionId} = ${table.contentQuestionId}::text || '_v' || ${table.contentRevision}::text)`,
      ),
    ],
  )
  .enableRLS();
