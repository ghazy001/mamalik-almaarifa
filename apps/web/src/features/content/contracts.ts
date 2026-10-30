import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
export const contentSchema = z.strictObject({
  locale: z.literal('ar'),
  category: text(80),
  text: text(500),
  choices: z
    .array(
      z.strictObject({ id: z.enum(['a', 'b', 'c', 'd']), text: text(200) }),
    )
    .length(4),
  correctChoiceId: z.enum(['a', 'b', 'c', 'd']),
  explanation: text(1000),
  sources: z
    .array(
      z.strictObject({
        label: text(160),
        url: z
          .url()
          .max(2000)
          .refine(
            (value) =>
              URL.canParse(value) && new URL(value).protocol === 'https:',
          ),
      }),
    )
    .min(1)
    .max(5),
});
export const statusSchema = z.enum([
  'DRAFT',
  'APPROVED',
  'PUBLISHED',
  'RETIRED',
]);
export const meSchema = z.object({
  subject: z.uuid(),
  issuer: z.url(),
  actor: z.string(),
  roles: z.array(z.enum(['editor', 'reviewer', 'publisher'])),
});
export const summarySchema = z.object({
  questionId: z.uuid(),
  revision: z.number().int().positive(),
  status: statusSchema,
  category: z.string(),
  author: z.string(),
  reviewer: z.string().nullable(),
});
export const listSchema = z.object({ items: z.array(summarySchema).max(100) });
export const detailSchema = z.object({
  questionId: z.uuid(),
  revision: z.number().int().positive(),
  status: statusSchema,
  content: contentSchema,
  author: z.string(),
  reviewer: z.string().nullable(),
  reviewNote: z.string().nullable(),
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
});
const scope = {
  questionId: z.uuid(),
  revision: z.number().int().positive().max(2_147_483_647),
};
export const contentCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('CREATE_DRAFT'), content: contentSchema }),
  z.strictObject({
    type: z.literal('REVISE'),
    questionId: z.uuid(),
    expectedRevision: scope.revision,
    content: contentSchema,
  }),
  z.strictObject({ type: z.literal('APPROVE'), ...scope, note: text(1000) }),
  z.strictObject({ type: z.literal('PUBLISH'), ...scope }),
  z.strictObject({ type: z.literal('RETIRE'), ...scope, note: text(1000) }),
]);
export type Content = z.infer<typeof contentSchema>;
export type ContentMe = z.infer<typeof meSchema>;
export type Summary = z.infer<typeof summarySchema>;
export type Detail = z.infer<typeof detailSchema>;
export type ContentCommand = z.infer<typeof contentCommandSchema>;
export const contentErrors: Record<string, string> = {
  UNAUTHENTICATED: 'انتهت الجلسة. سجّل الدخول مجددًا.',
  FORBIDDEN: 'لا تملك الصلاحية المطلوبة. حدّث الصفحة للتحقق من صلاحياتك.',
  SELF_REVIEW: 'يجب أن يراجع المسودة حساب آخر غير مؤلفها.',
  STALE_REVISION: 'توجد مراجعة أحدث لهذا السؤال. حدّث القائمة أولًا.',
  INVALID_STATUS: 'تغيّرت حالة هذه المراجعة. حدّث السؤال قبل المتابعة.',
  IDEMPOTENCY_CONFLICT: 'تعارض طلب الإعادة. حدّث السؤال وتحقق من النتيجة.',
  INVALID_INPUT: 'راجع الحقول المطلوبة وطول النصوص والروابط.',
  NOT_FOUND: 'لم تعد هذه المراجعة متاحة.',
  RATE_LIMITED: 'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
};
