import { z } from 'zod';

export const PROTOCOL_VERSION = 2 as const;
export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
export const errorCodeSchema = z.enum([
  'INVALID_PHASE',
  'INVALID_ACTOR',
  'WRONG_MATCH',
  'STALE_TURN',
  'ILLEGAL_TARGET',
  'DEADLINE_EXPIRED',
  'TOO_EARLY',
  'ALREADY_ANSWERED',
  'INVALID_ANSWER',
  'INVALID_QUESTION',
  'DUPLICATE_ACTION',
  'INVALID_TIME',
  'INVALID_INPUT',
  'MALFORMED_COMMAND',
  'UNSUPPORTED_VERSION',
  'NOT_IMPLEMENTED',
  'RATE_LIMITED',
  'ROOM_CLOSED',
]);
const scope = {
  protocolVersion: z.literal(PROTOCOL_VERSION),
  matchId: idSchema,
  turn: z.number().int().min(0).max(120),
  idempotencyKey: idSchema,
};

/** No actor/session/time fields: identity and receipt time come from transport. */
export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...scope, type: z.literal('READY') }),
  z.strictObject({
    ...scope,
    type: z.literal('SELECT_TARGET'),
    targetId: idSchema,
  }),
  z.strictObject({
    ...scope,
    type: z.literal('SUBMIT_ANSWER'),
    questionId: idSchema,
    choiceId: idSchema,
  }),
  z.strictObject({ ...scope, type: z.literal('REQUEST_RECONNECT') }),
]);
export type Command = z.infer<typeof commandSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export function parseCommand(
  input: unknown,
): { ok: true; command: Command } | { ok: false; error: ErrorCode } {
  if (
    typeof input === 'object' &&
    input !== null &&
    'protocolVersion' in input &&
    input.protocolVersion !== PROTOCOL_VERSION
  )
    return { ok: false, error: 'UNSUPPORTED_VERSION' };
  const parsed = commandSchema.safeParse(input);
  return parsed.success
    ? { ok: true, command: parsed.data }
    : { ok: false, error: 'MALFORMED_COMMAND' };
}

const choiceSchema = z.strictObject({
  id: idSchema,
  text: z.string().min(1).max(200),
});
export const questionSchema = z.strictObject({
  id: idSchema,
  text: z.string().min(1).max(500),
  choices: z.tuple([choiceSchema, choiceSchema, choiceSchema, choiceSchema]),
  deadline: z.number().finite().nonnegative(),
  targetId: idSchema,
  attackerId: idSchema,
  defenderId: idSchema.nullable(),
});
const outcomeSchema = z.strictObject({
  target: idSchema,
  captured: z.boolean(),
  winner: idSchema.nullable(),
  correctChoiceId: idSchema,
  questionId: idSchema,
});
const placementSchema = z.strictObject({
  playerId: idSchema,
  score: z.number().int().nonnegative(),
  castles: z.number().int().min(0).max(3),
  territories: z.number().int().min(0).max(15),
  eliminated: z.boolean(),
  rank: z.number().int().min(1).max(3),
});
const resultSchema = z.strictObject({
  reason: z.enum(['CASTLES', 'LAST_PLAYER', 'TURN_LIMIT', 'ABORTED']),
  winners: z.array(idSchema).max(3),
  placements: z.array(placementSchema).length(3),
});
export const publicStateSchema = z.strictObject({
  matchId: idSchema,
  rulesVersion: z.literal(1),
  phase: z.enum([
    'LOBBY',
    'SETUP',
    'ATTACK_SELECTION',
    'DUEL',
    'RESOLUTION',
    'FINISHED',
  ]),
  turn: z.number().int().min(0).max(120),
  activePlayerId: idSchema.nullable(),
  players: z
    .array(
      z.strictObject({
        id: idSchema,
        name: z.string().min(1).max(40),
        ready: z.boolean(),
        eliminated: z.boolean(),
      }),
    )
    .length(3),
  territories: z
    .array(
      z.strictObject({
        id: idSchema,
        castle: z.boolean(),
        ownerId: idSchema.nullable(),
      }),
    )
    .length(15),
  selectionDeadline: z.number().finite().nonnegative().nullable(),
  question: questionSchema.nullable(),
  outcome: outcomeSchema.nullable(),
  result: resultSchema.nullable(),
});
export type PublicState = z.infer<typeof publicStateSchema>;

const eventScope = {
  protocolVersion: z.literal(PROTOCOL_VERSION),
  matchId: idSchema,
  turn: z.number().int().min(0).max(120),
  sequence: z.number().int().nonnegative(),
};
/** Guest rooms emit errors/acks; other changes use full snapshots. */
export const eventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...eventScope,
    type: z.literal('ROOM_UPDATED'),
    state: publicStateSchema,
  }),
  z.strictObject({
    ...eventScope,
    type: z.literal('TURN_STARTED'),
    activePlayerId: idSchema,
    deadline: z.number().finite().nonnegative(),
  }),
  z.strictObject({
    ...eventScope,
    type: z.literal('QUESTION_PRESENTED'),
    question: questionSchema,
  }),
  z.strictObject({
    ...eventScope,
    type: z.literal('ANSWER_ACKNOWLEDGED'),
    idempotencyKey: idSchema,
  }),
  z.strictObject({
    ...eventScope,
    type: z.literal('DUEL_RESOLVED'),
    outcome: outcomeSchema,
  }),
  z.strictObject({
    ...eventScope,
    type: z.literal('TERRITORY_UPDATED'),
    territoryId: idSchema,
    ownerId: idSchema.nullable(),
  }),
  z.strictObject({
    ...eventScope,
    type: z.literal('MATCH_FINISHED'),
    result: resultSchema,
  }),
  z.strictObject({
    ...eventScope,
    type: z.literal('COMMAND_REJECTED'),
    idempotencyKey: idSchema,
    error: errorCodeSchema,
  }),
]);
export type ServerEvent = z.infer<typeof eventSchema>;

/** Guest room transport. Seat identity is never supplied in player commands. */
export const joinOptionsSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .refine(
      (value) =>
        !/[<>]/.test(value) &&
        ![...value].some((character) => character.charCodeAt(0) < 32),
    ),
});
export const syncRequestSchema = z.strictObject({ nonce: idSchema });
export const roomModeSchema = z.enum(['private', 'matchmaking']);
export type RoomMode = z.infer<typeof roomModeSchema>;
export const roomSnapshotSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  sequence: z.number().int().nonnegative(),
  roomId: idSchema,
  mode: roomModeSchema,
  readyDeadline: z.number().finite().nonnegative().nullable(),
  playerId: idSchema,
  serverNow: z.number().finite().nonnegative(),
  closed: z.boolean(),
  seats: z
    .array(
      z.strictObject({
        playerId: idSchema,
        name: z.string().min(1).max(40),
        connected: z.boolean(),
      }),
    )
    .max(3),
  state: publicStateSchema.nullable(),
  legalTargetIds: z.array(idSchema).max(15),
  standings: z.array(placementSchema).max(3),
  rules: z.strictObject({
    maxTurns: z.number().int().min(1).max(120),
    selectionMs: z.number().int().min(100).max(60000),
    answerMs: z.number().int().min(100).max(60000),
  }),
  ownChoiceId: idSchema.nullable(),
  reveal: z
    .strictObject({
      question: questionSchema,
      explanation: z.string().min(1).max(1000),
      source: z
        .strictObject({ label: z.string().max(200), url: z.url() })
        .nullable(),
    })
    .nullable(),
});
export const clockReplySchema = z.strictObject({
  nonce: idSchema,
  serverNow: z.number().finite().nonnegative(),
});
export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;
