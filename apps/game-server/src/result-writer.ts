import { MatchArchiveConflict, matchArchiveSchema } from '@mamalik/database';
import type { MatchArchive } from '@mamalik/database';
import { z } from 'zod';

type Outcome = 'saved' | 'failed';
interface Job {
  archive: MatchArchive;
  done: boolean;
  resolve: (value: Outcome) => void;
}
/** Bounded best-effort delivery; only a database acknowledgement means saved. */
export function createResultWriter(
  write: (archive: MatchArchive) => Promise<unknown>,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const pending = new Set<Job>();
  const queue: Job[] = [];
  let active = 0,
    closing = false;
  const listeners = new Set<() => void>();
  function settle(job: Job, outcome: Outcome) {
    if (job.done) return;
    job.done = true;
    pending.delete(job);
    job.resolve(outcome);
    for (const listener of listeners) listener();
  }
  async function run(job: Job) {
    for (let attempt = 0; attempt < 3 && !job.done; attempt++) {
      try {
        await write(structuredClone(job.archive));
        settle(job, 'saved');
        return;
      } catch (error) {
        if (
          error instanceof MatchArchiveConflict ||
          error instanceof z.ZodError
        )
          break;
        if (attempt < 2 && !job.done) await wait(250 * (attempt + 1));
      }
    }
    settle(job, 'failed');
  }
  function pump() {
    while (active < 4 && queue.length) {
      const job = queue.shift()!;
      if (job.done) continue;
      active++;
      void run(job)
        .catch(() => settle(job, 'failed'))
        .finally(() => {
          active--;
          pump();
        });
    }
  }
  return {
    submit(input: unknown): Promise<Outcome> {
      const parsed = matchArchiveSchema.safeParse(input);
      if (!parsed.success || closing || pending.size >= 64)
        return Promise.resolve('failed');
      return new Promise((resolve) => {
        const job = { archive: parsed.data, resolve, done: false };
        pending.add(job);
        queue.push(job);
        pump();
      });
    },
    async drain(timeoutMs = 20000) {
      closing = true;
      if (!pending.size) return;
      await new Promise<void>((resolve) => {
        const done = () => {
          if (!pending.size) {
            clearTimeout(timer);
            listeners.delete(done);
            resolve();
          }
        };
        const timer = setTimeout(() => {
          for (const job of [...pending]) settle(job, 'failed');
          queue.length = 0;
          listeners.delete(done);
          resolve();
        }, timeoutMs);
        listeners.add(done);
        done();
      });
    },
  };
}
export type ResultWriter = ReturnType<typeof createResultWriter>;
