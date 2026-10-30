import { z } from 'zod';

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        [...value].every((character) => {
          const code = character.charCodeAt(0);
          return (
            character !== '<' &&
            character !== '>' &&
            code !== 127 &&
            (code >= 32 || code === 9 || code === 10)
          );
        }),
      'Markup and control characters are not allowed',
    );
const choiceId = z.enum(['a', 'b', 'c', 'd']);
export const actorSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_:@.-]+$/);
export const questionIdSchema = z.uuid();
export const revisionSchema = z.number().int().positive().max(2_147_483_647);
export const noteSchema = text(1000);

// Server-only content. There is deliberately no network DTO export here.
export const questionContentSchema = z
  .strictObject({
    locale: z.literal('ar'),
    category: text(80),
    text: text(500),
    choices: z
      .array(z.strictObject({ id: choiceId, text: text(200) }))
      .length(4),
    correctChoiceId: choiceId,
    explanation: text(1000),
    sources: z
      .array(
        z.strictObject({
          label: text(160),
          url: z
            .url()
            .max(2000)
            .refine((value) => {
              if (!URL.canParse(value)) return false;
              const url = new URL(value);
              return (
                url.protocol === 'https:' && !url.username && !url.password
              );
            }, 'Sources must use HTTPS without credentials'),
        }),
      )
      .min(1)
      .max(5),
  })
  .superRefine((value, context) => {
    if (new Set(value.choices.map((choice) => choice.id)).size !== 4)
      context.addIssue({
        code: 'custom',
        message: 'Four distinct choice IDs are required',
      });
    if (
      new Set(
        value.choices.map((choice) =>
          choice.text.normalize('NFC').toLocaleLowerCase('ar'),
        ),
      ).size !== 4
    )
      context.addIssue({
        code: 'custom',
        message: 'Choice text must be distinct',
      });
  });

export type QuestionContent = z.infer<typeof questionContentSchema>;
export type ContentErrorCode =
  'NOT_FOUND' | 'INVALID_STATUS' | 'SELF_REVIEW' | 'STALE_REVISION';
export class ContentError extends Error {
  constructor(readonly code: ContentErrorCode) {
    super(code);
    this.name = 'ContentError';
  }
}
