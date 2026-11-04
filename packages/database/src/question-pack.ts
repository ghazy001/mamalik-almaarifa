import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { z } from 'zod';
import type { ContentConnection } from './client.js';
import { actorSchema, noteSchema, questionContentSchema } from './content.js';
import { createQuestionRepository } from './repository.js';

export const MAX_PACK_BYTES = 2 * 1024 * 1024;
const key = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[a-z0-9][a-z0-9_-]*$/);

// Comparison only: preserve the original Arabic in stored content.
function comparable(text: string) {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('ar')
    .replace(/\p{M}/gu, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/\s+/gu, ' ')
    .trim();
}

export const questionPackSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    packId: key(32),
    locale: z.literal('ar'),
    status: z.literal('DRAFT'),
    preparedOn: z.iso.date(),
    questions: z
      .array(
        z.strictObject({
          key: key(48),
          difficulty: z.enum(['easy', 'medium', 'hard']),
          reviewStatus: z.literal('PENDING'),
          content: questionContentSchema,
          evidence: z.strictObject({
            checkedOn: z.iso.date(),
            note: noteSchema,
          }),
        }),
      )
      .min(1)
      .max(200),
  })
  .superRefine((pack, context) => {
    const keys = new Set<string>();
    const prompts = new Set<string>();
    pack.questions.forEach((question, index) => {
      const problem = (message: string) =>
        context.addIssue({
          code: 'custom',
          path: ['questions', index],
          message,
        });
      if (keys.has(question.key)) problem('Question keys must be unique');
      keys.add(question.key);
      const prompt = comparable(question.content.text);
      if (!prompt || prompts.has(prompt))
        problem('Question prompts must be distinct');
      prompts.add(prompt);
      const choices = question.content.choices.map((choice) =>
        comparable(choice.text),
      );
      if (choices.some((choice) => !choice) || new Set(choices).size !== 4)
        problem('Choice text must remain distinct without Arabic marks');
      if (question.evidence.checkedOn > pack.preparedOn)
        problem('Evidence cannot be checked after pack preparation');
    });
  });

export type QuestionPack = z.infer<typeof questionPackSchema>;
export class QuestionPackError extends Error {
  constructor(
    readonly code:
      | 'PACK_CHANGED'
      | 'PACK_FILE_TOO_LARGE'
      | 'PACK_FILE_UNREADABLE'
      | 'INVALID_PACK_JSON',
  ) {
    super(code);
    this.name = 'QuestionPackError';
  }
}

export async function readQuestionPack(path: string): Promise<QuestionPack> {
  // Bound the actual read as well as the stat, even if the file grows mid-read.
  const file = await open(path, 'r').catch(() => {
    throw new QuestionPackError('PACK_FILE_UNREADABLE');
  });
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new QuestionPackError('PACK_FILE_UNREADABLE');
    if (stat.size > MAX_PACK_BYTES)
      throw new QuestionPackError('PACK_FILE_TOO_LARGE');
    const buffer = Buffer.alloc(MAX_PACK_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        size,
        buffer.length - size,
        size,
      );
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > MAX_PACK_BYTES)
      throw new QuestionPackError('PACK_FILE_TOO_LARGE');
    let value: unknown;
    try {
      value = JSON.parse(buffer.subarray(0, size).toString('utf8'));
    } catch {
      throw new QuestionPackError('INVALID_PACK_JSON');
    }
    return questionPackSchema.parse(value);
  } finally {
    await file.close();
  }
}

export function summarizeQuestionPack(input: unknown) {
  const pack = questionPackSchema.parse(input);
  const categories: Record<string, number> = Object.create(null);
  const difficulties = { easy: 0, medium: 0, hard: 0 };
  const answerPositions = { a: 0, b: 0, c: 0, d: 0 };
  for (const question of pack.questions) {
    categories[question.content.category] =
      (categories[question.content.category] ?? 0) + 1;
    difficulties[question.difficulty]++;
    answerPositions[question.content.correctChoiceId]++;
  }
  return {
    packId: pack.packId,
    schemaVersion: pack.schemaVersion,
    sha256: createHash('sha256').update(JSON.stringify(pack)).digest('hex'),
    questions: pack.questions.length,
    categories,
    difficulties,
    answerPositions,
    minimumDraftTargetMet: pack.questions.length >= 36,
    pendingHumanReview: pack.questions.length,
    publishedByImport: 0,
  };
}

export async function importQuestionPack(
  db: ContentConnection,
  input: unknown,
  authorInput: string,
) {
  // Validate everything before opening the transaction. This API never approves.
  const pack = questionPackSchema.parse(input);
  const author = actorSchema.parse(authorInput);
  return db.transaction(async (tx) => {
    const repository = createQuestionRepository(tx);
    const entries = [];
    // Consistent lock order also allows two operators to retry in parallel.
    for (const question of [...pack.questions].sort((a, b) =>
      a.key.localeCompare(b.key, 'en'),
    )) {
      const result = await repository.createDraft(
        question.content,
        author,
        `pack:${pack.packId}:${question.key}`,
      );
      if (!result.created) {
        const original = await repository.getRevision(result.questionId, 1);
        if (
          JSON.stringify(original.content) !== JSON.stringify(question.content)
        )
          throw new QuestionPackError('PACK_CHANGED');
      }
      entries.push({ key: question.key, ...result });
    }
    return {
      packId: pack.packId,
      draftsCreated: entries.filter((entry) => entry.created).length,
      existingQuestions: entries.filter((entry) => !entry.created).length,
      publishedByImport: 0,
      entries,
    };
  });
}
