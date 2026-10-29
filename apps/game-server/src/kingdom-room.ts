import { randomBytes } from 'node:crypto';
import { Room } from '@colyseus/core';
import type { Client } from '@colyseus/core';
import { DEFAULT_RULES } from '@mamalik/game-core';
import type { Rules } from '@mamalik/game-core';
import {
  PROTOCOL_VERSION,
  joinOptionsSchema,
  parseCommand,
  idSchema,
  roomSnapshotSchema,
  syncRequestSchema,
} from '@mamalik/shared';
import type { ErrorCode } from '@mamalik/shared';
import { createServerMatch } from './match-session.js';

interface Seat {
  playerId: string;
  name: string;
  connected: boolean;
}
export interface RoomSettings {
  rules?: Partial<Omit<Rules, 'version'>>;
  resolutionMs?: number;
  reconnectSeconds?: number;
  seed?: number;
}
const playerIds = ['p_teal', 'p_blue', 'p_gold'] as const;

/** Settings are injected only by trusted server construction, never join options. */
export function kingdomRoom(settings: RoomSettings = {}): new () => Room {
  return class KingdomRoom extends Room {
    override maxClients = 3;
    override maxMessagesPerSecond = 30;
    private seats = new Map<string, Seat>();
    private rates = new Map<string, { start: number; count: number }>();
    private match: ReturnType<typeof createServerMatch> | null = null;
    private sequence = 0;
    private closed = false;
    private reportedFinish = false;
    private logRef = randomBytes(6).toString('hex');
    private epoch = performance.now();
    private now = () => performance.now() - this.epoch;

    override async onCreate() {
      this.roomId = randomBytes(8).toString('hex');
      console.info(
        JSON.stringify({ event: 'room_created', roomRef: this.logRef }),
      );
      await this.setPrivate(true);
      this.setPatchRate(null);
      this.onMessage('command', (client: Client, input: unknown) =>
        this.command(client, input),
      );
      this.onMessage('sync', (client: Client, input: unknown) => {
        if (!this.allowed(client)) return;
        const parsed = syncRequestSchema.safeParse(input);
        if (!parsed.success)
          return this.reject(client, 'invalid', 'MALFORMED_COMMAND');
        this.advance();
        client.send('clock', {
          nonce: parsed.data.nonce,
          serverNow: this.now(),
        });
        this.sendSnapshot(client);
      });
      this.onMessage('*', (client: Client) => {
        if (this.allowed(client))
          this.reject(client, 'invalid', 'MALFORMED_COMMAND');
      });
      this.clock.setInterval(() => this.advance(), 50);
      // No unattended room can consume memory indefinitely.
      this.clock.setTimeout(() => {
        if (!this.match) {
          this.closed = true;
          this.publish();
          void this.disconnect();
        }
      }, 5 * 60_000);
      this.clock.setTimeout(() => this.onBeforeShutdown(), 25 * 60_000);
    }
    override onAuth(_client: Client, options: unknown) {
      return (
        !this.closed &&
        !this.match &&
        joinOptionsSchema.safeParse(options).success
      );
    }
    override onJoin(client: Client, input: unknown) {
      const options = joinOptionsSchema.parse(input);
      const playerId = playerIds.find(
        (id) => ![...this.seats.values()].some((seat) => seat.playerId === id),
      );
      if (!playerId || this.match || this.closed)
        throw new Error('Room is full');
      this.seats.set(client.sessionId, {
        playerId,
        name: options.name,
        connected: true,
      });
      if (this.seats.size === 3) {
        this.match = createServerMatch({
          id: `m_${this.roomId}`,
          players: playerIds.map((id) => {
            const seat = [...this.seats.values()].find(
              (seat) => seat.playerId === id,
            )!;
            return { id, name: seat.name };
          }),
          seed: settings.seed ?? randomBytes(4).readUInt32LE(),
          ...(settings.rules ? { rules: settings.rules } : {}),
          ...(settings.resolutionMs
            ? { resolutionMs: settings.resolutionMs }
            : {}),
        });
        void this.lock();
        console.info(
          JSON.stringify({ event: 'match_prepared', roomRef: this.logRef }),
        );
      }
      this.publish();
    }
    override onDrop(client: Client) {
      const seat = this.seats.get(client.sessionId);
      if (seat) seat.connected = false;
      this.allowReconnection(client, settings.reconnectSeconds ?? 30);
      this.publish();
    }
    override onReconnect(client: Client) {
      const seat = this.seats.get(client.sessionId);
      if (seat) seat.connected = true;
      this.advance();
      this.publish();
    }
    override onLeave(client: Client) {
      const seat = this.seats.get(client.sessionId);
      if (!seat) return;
      seat.connected = false;
      this.rates.delete(client.sessionId);
      if (this.match) this.match.forfeit(seat.playerId, this.now());
      else this.seats.delete(client.sessionId);
      this.publish();
    }
    override onBeforeShutdown() {
      this.closed = true;
      this.match?.abort(this.now());
      this.publish();
      void this.disconnect();
    }
    private allowed(client: Client) {
      const now = this.now();
      const bucket = this.rates.get(client.sessionId);
      if (!bucket || now - bucket.start >= 1000) {
        this.rates.set(client.sessionId, { start: now, count: 1 });
        return true;
      }
      bucket.count++;
      if (bucket.count === 13) this.reject(client, 'invalid', 'RATE_LIMITED');
      return bucket.count <= 12;
    }
    private reject(client: Client, key: string, error: ErrorCode) {
      client.send('event', {
        protocolVersion: PROTOCOL_VERSION,
        type: 'COMMAND_REJECTED',
        matchId: this.match?.view('')['state'].matchId ?? `m_${this.roomId}`,
        turn: this.match?.view('')['state'].turn ?? 0,
        sequence: this.sequence,
        idempotencyKey: key,
        error,
      });
    }
    private command(client: Client, input: unknown) {
      if (!this.allowed(client)) return;
      const parsed = parseCommand(input);
      const rawKey =
        typeof input === 'object' && input !== null && 'idempotencyKey' in input
          ? input.idempotencyKey
          : null;
      const key = idSchema.safeParse(rawKey).success
        ? (rawKey as string)
        : 'invalid';
      if (!parsed.ok) return this.reject(client, key, parsed.error);
      const seat = this.seats.get(client.sessionId);
      if (!seat?.connected || this.closed || !this.match)
        return this.reject(client, key, 'ROOM_CLOSED');
      const before = this.match.revision;
      const result = this.match.command(
        parsed.command,
        seat.playerId,
        this.now(),
      );
      if (this.match.revision !== before) this.publish();
      if (!result.ok) return this.reject(client, key, result.error);
      if (parsed.command.type === 'SUBMIT_ANSWER')
        client.send('event', {
          protocolVersion: PROTOCOL_VERSION,
          type: 'ANSWER_ACKNOWLEDGED',
          matchId: result.state.id,
          turn: parsed.command.turn,
          sequence: this.sequence,
          idempotencyKey: key,
        });
      // Retries get a fresh allowlisted view; no repeated capture event.
      if (result.duplicate) this.sendSnapshot(client);
    }
    private advance() {
      if (!this.match || this.closed) return;
      const before = this.match.revision;
      this.match.tick(this.now());
      if (before !== this.match.revision) this.publish();
    }
    private publish() {
      if (this.match?.finished && !this.reportedFinish) {
        this.reportedFinish = true;
        console.info(
          JSON.stringify({
            event: 'match_finished',
            roomRef: this.logRef,
            reason: this.match.publicState().result?.reason,
          }),
        );
      }
      this.sequence++;
      for (const client of this.clients)
        if (this.seats.get(client.sessionId)?.connected)
          this.sendSnapshot(client);
    }
    private sendSnapshot(client: Client) {
      const seat = this.seats.get(client.sessionId);
      if (!seat) return;
      const match = this.match?.view(seat.playerId);
      const message = roomSnapshotSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        sequence: ++this.sequence,
        roomId: this.roomId,
        playerId: seat.playerId,
        serverNow: this.now(),
        closed: this.closed,
        seats: [...this.seats.values()],
        ...(match ?? {
          state: null,
          legalTargetIds: [],
          standings: [],
          rules: {
            maxTurns: settings.rules?.maxTurns ?? DEFAULT_RULES.maxTurns,
            selectionMs:
              settings.rules?.selectionMs ?? DEFAULT_RULES.selectionMs,
            answerMs: settings.rules?.answerMs ?? DEFAULT_RULES.answerMs,
          },
          ownChoiceId: null,
          reveal: null,
        }),
      });
      client.send('snapshot', message);
    }
  };
}
