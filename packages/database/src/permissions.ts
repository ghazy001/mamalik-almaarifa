import { z } from 'zod';
import { createHash } from 'node:crypto';

export const CONTENT_ROLES = ['editor', 'reviewer', 'publisher'] as const;
export const contentRoleSchema = z.enum(CONTENT_ROLES);
export const contentIdentitySchema = z.strictObject({
  issuer: z
    .url()
    .max(300)
    .refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return (
        ['https:', 'http:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === '/auth/v1'
      );
    })
    .transform((value) => new URL(value).href),
  subject: z.uuid().transform((value) => value.toLowerCase()),
});
export type ContentIdentity = z.infer<typeof contentIdentitySchema>;
export type ContentRole = z.infer<typeof contentRoleSchema>;
export function contentActor(identity: ContentIdentity) {
  const canonical = contentIdentitySchema.parse(identity);
  return `auth:${createHash('sha256').update(canonical.issuer).update('\0').update(canonical.subject).digest('hex')}`;
}
export type ContentPermission = 'read' | 'edit' | 'review' | 'publish';
const permissions: Record<ContentPermission, readonly ContentRole[]> = {
  read: ['editor', 'reviewer', 'publisher'],
  edit: ['editor'],
  review: ['reviewer'],
  publish: ['publisher'],
};
export function permits(
  roles: readonly ContentRole[],
  permission: ContentPermission,
) {
  return roles.some((role) => permissions[permission].includes(role));
}
export class ContentAccessDenied extends Error {
  constructor() {
    super('FORBIDDEN');
    this.name = 'ContentAccessDenied';
  }
}
export class ContentRequestConflict extends Error {
  constructor() {
    super('IDEMPOTENCY_CONFLICT');
  }
}
export const contentRequestKeySchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,64}$/);
export const contentCommandResultSchema = z.union([
  z.strictObject({ accepted: z.literal(true) }),
  z.strictObject({
    questionId: z.uuid(),
    revision: z.number().int().positive(),
    created: z.boolean().optional(),
  }),
]);
export type ContentCommandResult = z.infer<typeof contentCommandResultSchema>;
