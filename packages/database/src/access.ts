import { and, asc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { ContentConnection } from './client.js';
import { actorSchema } from './content.js';
import {
  contentActor,
  contentIdentitySchema,
  contentRoleSchema,
  ContentAccessDenied,
  ContentRequestConflict,
  contentRequestKeySchema,
  contentCommandResultSchema,
  permits,
} from './permissions.js';
import type {
  ContentIdentity,
  ContentPermission,
  ContentCommandResult,
} from './permissions.js';
import { accessAudit, memberships, requests } from './schema.js';
import { createQuestionRepository } from './repository.js';

function identityScope(identity: ContentIdentity) {
  return and(
    eq(memberships.issuer, identity.issuer),
    eq(memberships.subject, identity.subject),
  );
}

// Grant/revoke are trusted operator functions, never exposed as HTTP commands.
export function createAccessRepository(db: ContentConnection) {
  type Transaction = Parameters<
    Parameters<ContentConnection['transaction']>[0]
  >[0];
  async function authorized<T>(
    identityInput: ContentIdentity,
    permission: ContentPermission,
    work: (tx: Transaction, actor: string) => Promise<T>,
  ) {
    const identity = contentIdentitySchema.parse(identityInput);
    return db.transaction(async (tx) => {
      const rows = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(identityScope(identity))
        .for('share');
      if (
        !permits(
          rows.map((row) => row.role),
          permission,
        )
      )
        throw new ContentAccessDenied();
      return work(tx, contentActor(identity));
    });
  }
  return {
    async grant(
      identityInput: ContentIdentity,
      roleInput: string,
      actorInput: string,
    ) {
      const identity = contentIdentitySchema.parse(identityInput);
      const role = contentRoleSchema.parse(roleInput);
      const actor = actorSchema.parse(actorInput);
      return db.transaction(async (tx) => {
        const inserted = await tx
          .insert(memberships)
          .values({ ...identity, role })
          .onConflictDoNothing()
          .returning();
        if (!inserted.length) return false;
        await tx
          .insert(accessAudit)
          .values({ ...identity, role, actor, action: 'GRANT' });
        return true;
      });
    },
    async revoke(
      identityInput: ContentIdentity,
      roleInput: string,
      actorInput: string,
    ) {
      const identity = contentIdentitySchema.parse(identityInput);
      const role = contentRoleSchema.parse(roleInput);
      const actor = actorSchema.parse(actorInput);
      return db.transaction(async (tx) => {
        const removed = await tx
          .delete(memberships)
          .where(and(identityScope(identity), eq(memberships.role, role)))
          .returning();
        if (!removed.length) return false;
        await tx
          .insert(accessAudit)
          .values({ ...identity, role, actor, action: 'REVOKE' });
        return true;
      });
    },
    async roles(identityInput: ContentIdentity) {
      const identity = contentIdentitySchema.parse(identityInput);
      const rows = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(identityScope(identity))
        .orderBy(asc(memberships.role));
      return rows.map((row) => row.role);
    },
    async authorize<T>(
      identityInput: ContentIdentity,
      permission: ContentPermission,
      work: (
        questions: ReturnType<typeof createQuestionRepository>,
        actor: string,
      ) => Promise<T>,
    ) {
      return authorized(identityInput, permission, (tx, actor) =>
        work(createQuestionRepository(tx), actor),
      );
    },
    async command(
      identityInput: ContentIdentity,
      permission: ContentPermission,
      keyInput: string,
      input: unknown,
      work: (
        questions: ReturnType<typeof createQuestionRepository>,
        actor: string,
      ) => Promise<ContentCommandResult>,
    ) {
      const identity = contentIdentitySchema.parse(identityInput);
      const key = contentRequestKeySchema.parse(keyInput);
      const payloadHash = createHash('sha256')
        .update(JSON.stringify(input))
        .digest('hex');
      return authorized(identity, permission, async (tx, actor) => {
        const scope = and(
          eq(requests.issuer, identity.issuer),
          eq(requests.subject, identity.subject),
          eq(requests.key, key),
        );
        await tx
          .insert(requests)
          .values({ ...identity, key, payloadHash })
          .onConflictDoNothing();
        const [request] = await tx
          .select()
          .from(requests)
          .where(scope)
          .for('update');
        if (!request || request.payloadHash !== payloadHash)
          throw new ContentRequestConflict();
        if (request.response !== null)
          return contentCommandResultSchema.parse(request.response);
        const result = contentCommandResultSchema.parse(
          await work(createQuestionRepository(tx), actor),
        );
        await tx.update(requests).set({ response: result }).where(scope);
        return result;
      });
    },
  };
}
