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

// Not public: no PostgREST/browser exposure or grants to anonymous roles.
export const contentSchema = pgSchema('content');
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
export const questions = contentSchema.table(
  'questions',
  {
    id: uuid('id').primaryKey(),
    latestRevision: integer('latest_revision').notNull(),
    importKey: text('import_key').unique(),
  },
  (table) => [check('positive_revision', sql`${table.latestRevision} > 0`)],
);

export const revisions = contentSchema.table(
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
);

export const audit = contentSchema.table(
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
);
