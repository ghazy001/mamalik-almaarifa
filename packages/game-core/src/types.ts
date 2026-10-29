export type Phase =
  'LOBBY' | 'SETUP' | 'ATTACK_SELECTION' | 'DUEL' | 'RESOLUTION' | 'FINISHED';
export type ErrorCode =
  | 'INVALID_PHASE'
  | 'INVALID_ACTOR'
  | 'WRONG_MATCH'
  | 'STALE_TURN'
  | 'ILLEGAL_TARGET'
  | 'DEADLINE_EXPIRED'
  | 'TOO_EARLY'
  | 'ALREADY_ANSWERED'
  | 'INVALID_ANSWER'
  | 'INVALID_QUESTION'
  | 'DUPLICATE_ACTION'
  | 'INVALID_TIME'
  | 'INVALID_INPUT';
export interface Player {
  id: string;
  name: string;
  homeCastle: string;
  ready: boolean;
  eliminated: boolean;
}
export interface Choice {
  id: string;
  text: string;
}
export interface Question {
  id: string;
  text: string;
  choices: [Choice, Choice, Choice, Choice];
  correctChoiceId: string;
}
export interface Answer {
  choiceId: string;
  receivedAt: number;
}
export interface Duel {
  target: string;
  attacker: string;
  defender: string | null;
  question: Question;
  openedAt: number;
  deadline: number;
  answers: Record<string, Answer>;
}
export interface Outcome {
  target: string;
  captured: boolean;
  winner: string | null;
  correctChoiceId: string;
  questionId: string;
}
export interface Placement {
  playerId: string;
  score: number;
  castles: number;
  territories: number;
  eliminated: boolean;
  rank: number;
}
export interface MatchResult {
  reason: 'CASTLES' | 'LAST_PLAYER' | 'TURN_LIMIT' | 'ABORTED';
  winners: string[];
  placements: Placement[];
}
export interface Rules {
  version: 1;
  maxTurns: number;
  selectionMs: number;
  answerMs: number;
}
export interface MatchState {
  id: string;
  rules: Rules;
  phase: Phase;
  players: Player[];
  order: string[];
  turn: number;
  activeIndex: number;
  owners: Record<string, string | null>;
  selectionDeadline: number | null;
  duel: Duel | null;
  outcome: Outcome | null;
  result: MatchResult | null;
  questionDeck: string[];
  usedQuestionIds: string[];
  lastNow: number;
  accepted: Record<string, string>;
}
export interface PlayerScope {
  matchId: string;
  turn: number;
  actor: string;
  key: string;
}
export type PlayerAction = PlayerScope &
  (
    | { type: 'READY' }
    | { type: 'SELECT_TARGET'; target: string }
    | { type: 'SUBMIT_ANSWER'; questionId: string; choiceId: string }
  );
export type ServerAction =
  | { type: 'BEGIN' }
  | { type: 'ADVANCE' }
  | { type: 'RESOLVE' }
  | { type: 'FORFEIT'; playerId: string }
  | { type: 'ABORT' };
export type Action = PlayerAction | ServerAction;
export interface Context {
  now: number;
  question?: Question;
}
export type ApplyResult =
  | { ok: true; state: MatchState; duplicate: boolean }
  | { ok: false; state: MatchState; error: ErrorCode };
