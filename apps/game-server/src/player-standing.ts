import { createBasicRankingRepository } from '@mamalik/database';
import type { ContentDatabase, ContentIdentity } from '@mamalik/database';
import { personalStandingSchema } from '@mamalik/shared';
import type { PersonalStanding } from '@mamalik/shared';
export type PlayerStanding = (
  identity: ContentIdentity,
) => Promise<PersonalStanding>;
export function createPlayerStanding(db: ContentDatabase): PlayerStanding {
  const repository = createBasicRankingRepository(db);
  return async (identity) =>
    personalStandingSchema.parse(await repository.standingFor(identity));
}
