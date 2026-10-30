import { z } from 'zod';
import { createHash } from 'node:crypto';
import { ServerError } from '@colyseus/core';
import { idSchema, ROOM_ADMISSION_ERRORS } from '@mamalik/shared';
import { QUESTION_FIXTURES } from '@mamalik/question-fixtures';
import { createQuestionRepository } from '@mamalik/database';
import type { ContentDatabase } from '@mamalik/database';

const choice = z.strictObject({
  id: idSchema,
  text: z.string().min(1).max(200),
});
const recordSchema = z.strictObject({
  question: z
    .strictObject({
      id: idSchema,
      text: z.string().min(1).max(500),
      choices: z.tuple([choice, choice, choice, choice]),
      correctChoiceId: idSchema,
    })
    .refine(
      (value) =>
        new Set(value.choices.map((option) => option.id)).size === 4 &&
        value.choices.some((option) => option.id === value.correctChoiceId),
    ),
  explanation: z.string().min(1).max(1000),
  source: z
    .strictObject({ label: z.string().min(1).max(200), url: z.url() })
    .nullable(),
});
export type ServerQuestion = z.infer<typeof recordSchema>;
type BankError = keyof typeof ROOM_ADMISSION_ERRORS;
export function bankError(code: BankError) {
  return new ServerError(503, ROOM_ADMISSION_ERRORS[code]);
}
export interface QuestionBank {
  readonly ids: readonly string[];
  readonly fingerprint: string;
  get(id: string): ServerQuestion;
}

/** Detached private snapshot. Callers receive copies, never internal records. */
export function createQuestionBank(
  input: unknown,
  minimum: number,
): QuestionBank {
  const parsed = z.array(recordSchema).max(1000).safeParse(input);
  if (!parsed.success) throw bankError('CONTENT_BANK_INVALID');
  const records = new Map(
    parsed.data.map((entry) => [entry.question.id, entry]),
  );
  if (records.size !== parsed.data.length)
    throw bankError('CONTENT_BANK_INVALID');
  if (records.size < minimum) throw bankError('CONTENT_BANK_INSUFFICIENT');
  return Object.freeze({
    ids: Object.freeze([...records.keys()]),
    fingerprint: createHash('sha256')
      .update(JSON.stringify(parsed.data))
      .digest('hex'),
    get(id: string) {
      const entry = records.get(id);
      if (!entry) throw bankError('CONTENT_BANK_INVALID');
      return structuredClone(entry);
    },
  });
}
export function developmentQuestionBank(minimum: number) {
  return createQuestionBank(
    QUESTION_FIXTURES.map(({ question, explanation, source }) => ({
      question,
      explanation,
      source,
    })),
    minimum,
  );
}

type PublishedRows = Awaited<
  ReturnType<ReturnType<typeof createQuestionRepository>['loadPublished']>
>;
/** Bound pending reads per service; no query or publication lookup during play. */
export function publishedQuestionLoader(read: () => Promise<PublishedRows>) {
  let pending = 0;
  return async (minimum: number) => {
    if (pending >= 4) throw bankError('CONTENT_BANK_UNAVAILABLE');
    pending++;
    try {
      const rows = await read();
      return createQuestionBank(
        rows.map(({ id, content }) => ({
          question: {
            id,
            text: content.text,
            choices: content.choices,
            correctChoiceId: content.correctChoiceId,
          },
          explanation: content.explanation,
          source: content.sources[0] ?? null,
        })),
        minimum,
      );
    } catch (error) {
      if (
        error instanceof ServerError &&
        Object.hasOwn(ROOM_ADMISSION_ERRORS, error.message)
      )
        throw error;
      throw bankError(
        error instanceof z.ZodError
          ? 'CONTENT_BANK_INVALID'
          : 'CONTENT_BANK_UNAVAILABLE',
      );
    } finally {
      pending--;
    }
  };
}
export function databaseQuestionLoader(db: ContentDatabase) {
  const repository = createQuestionRepository(db);
  return publishedQuestionLoader(() => repository.loadPublished(1001));
}
