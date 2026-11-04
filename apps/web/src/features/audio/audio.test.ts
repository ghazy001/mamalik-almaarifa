import { describe, expect, it, vi } from 'vitest';
import { createAudioController } from './controller';
import type { AudioFactory } from './controller';
import { createCueTracker } from './cues';
import { createPracticeSession } from '../learn/practice-session';
import { findFixture } from '../match/questions';

function harness() {
  const ports: {
    play: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    volume: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }[] = [];
  const callbacks: Parameters<AudioFactory>[0][] = [];
  const factory = vi.fn<AudioFactory>((events) => {
    const port = {
      play: vi.fn(),
      stop: vi.fn(),
      volume: vi.fn(),
      dispose: vi.fn(),
    };
    ports.push(port);
    callbacks.push(events);
    return port;
  });
  const audio = createAudioController(factory);
  return { audio, factory, ports, callbacks };
}
describe('optional per-page audio', () => {
  it('starts muted with no asset/engine work; consumes no cues until ready', () => {
    const { audio, factory, ports, callbacks } = harness();
    audio.play('question');
    expect(audio.getSnapshot()).toEqual({ status: 'muted', volume: 0.35 });
    expect(factory).not.toHaveBeenCalled();
    audio.enable();
    audio.play('question');
    expect(ports[0]!.play).not.toHaveBeenCalled();
    callbacks[0]!.ready();
    expect(ports[0]!.play.mock.calls).toEqual([['preview']]);
    audio.play('capture');
    expect(ports[0]!.play).toHaveBeenLastCalledWith('capture');
  });
  it('mute disposes immediately and ignores late load/error callbacks', () => {
    const { audio, ports, callbacks } = harness();
    audio.enable();
    audio.mute();
    callbacks[0]!.ready();
    callbacks[0]!.failed();
    expect(ports[0]!.dispose).toHaveBeenCalledOnce();
    expect(ports[0]!.play).not.toHaveBeenCalled();
    expect(audio.getSnapshot().status).toBe('muted');
  });
  it('clamps volume, rejects non-finite values, and silences zero volume', () => {
    const { audio, ports, callbacks } = harness();
    audio.setVolume(-1);
    audio.enable();
    callbacks[0]!.ready();
    audio.play('turn');
    expect(ports[0]!.play).not.toHaveBeenCalled();
    audio.setVolume(2);
    audio.setVolume(NaN);
    expect(audio.getSnapshot().volume).toBe(1);
    audio.setVolume(0);
    expect(ports[0]!.stop).toHaveBeenCalled();
  });
  it('backgrounding cancels pending loads and requires a new gesture after return', () => {
    const { audio, ports, callbacks } = harness();
    audio.enable();
    audio.setVisible(false);
    callbacks[0]!.ready();
    audio.setVisible(true);
    audio.play('finish');
    expect(ports[0]!.play).not.toHaveBeenCalled();
    expect(audio.getSnapshot().status).toBe('muted');
    audio.enable();
    callbacks[1]!.ready();
    expect(ports[1]!.play).toHaveBeenCalledWith('preview');
  });
  it('reports load/play failure without throwing into the game and can retry', () => {
    const { audio, ports, callbacks } = harness();
    audio.enable();
    callbacks[0]!.failed();
    expect(audio.getSnapshot().status).toBe('error');
    audio.enable();
    callbacks[1]!.ready();
    ports[1]!.play.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => audio.play('question')).not.toThrow();
    expect(audio.getSnapshot().status).toBe('error');
    expect(ports[1]!.dispose).toHaveBeenCalledOnce();
  });
  it('releases resources on navigation; stale callbacks cannot resurrect playback', () => {
    const { audio, ports, callbacks } = harness();
    audio.enable();
    audio.dispose();
    callbacks[0]!.ready();
    expect(ports[0]!.dispose).toHaveBeenCalledOnce();
    expect(audio.getSnapshot().status).toBe('muted');
    expect(ports[0]!.play).not.toHaveBeenCalled();
  });
  it('contains volume and disposal errors from browser output', () => {
    const { audio, ports, callbacks } = harness();
    audio.enable();
    callbacks[0]!.ready();
    ports[0]!.volume.mockImplementation(() => {
      throw new Error('output closed');
    });
    ports[0]!.dispose.mockImplementation(() => {
      throw new Error('already closed');
    });
    expect(() => audio.setVolume(0)).not.toThrow();
    expect(audio.getSnapshot().status).toBe('error');
    expect(() => audio.dispose()).not.toThrow();
  });
});

describe('sanitized state cue projection', () => {
  function run(correct: boolean) {
    const session = createPracticeSession();
    const initial = session.getSnapshot();
    const track = createCueTracker();
    expect(track(initial.state, initial.humanId)).toBeNull();
    session.select(
      {
        matchId: initial.state.matchId,
        targetId: initial.map.legalTargetIds[0]!,
      },
      0,
    );
    const duel = session.getSnapshot();
    expect(track(duel.state, duel.humanId)).toBe('question');
    expect(track(duel.state, duel.humanId)).toBeNull();
    const question = findFixture(duel.state.question!.id).question;
    const choice = question.choices.find(
      (choice) => (choice.id === question.correctChoiceId) === correct,
    )!;
    session.answer(
      {
        matchId: duel.state.matchId,
        questionId: question.id,
        choiceId: choice.id,
      },
      100,
    );
    const resolved = session.getSnapshot();
    expect(track(resolved.state, resolved.humanId)).toBe(
      correct ? 'capture' : 'hold',
    );
    // A stale duel cannot rewind the tracker or replay the outcome.
    expect(track(duel.state, duel.humanId)).toBeNull();
    expect(track(resolved.state, resolved.humanId)).toBeNull();
    session.finish(101);
    expect(track(session.getSnapshot().state, resolved.humanId)).toBe('finish');
  }
  it('sounds only a public resolved capture, never answer correctness', () =>
    run(true));
  it('sounds a retained territory only after public resolution', () =>
    run(false));
  it('makes initial and reconnected snapshots silent, including finished games', () => {
    const session = createPracticeSession();
    const initial = session.getSnapshot();
    const track = createCueTracker();
    track(initial.state, initial.humanId);
    track(undefined, initial.humanId, false);
    session.select(
      {
        matchId: initial.state.matchId,
        targetId: initial.map.legalTargetIds[0]!,
      },
      0,
    );
    const duel = session.getSnapshot();
    expect(track(duel.state, duel.humanId)).toBeNull();
    expect(track(duel.state, 'spectator')).toBeNull();
    expect(
      track({ ...duel.state, matchId: 'new_match' }, duel.humanId),
    ).toBeNull();
  });
});
