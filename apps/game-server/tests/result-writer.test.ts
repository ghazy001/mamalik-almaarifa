import { afterEach, expect, it, vi } from 'vitest';
import { MatchArchiveConflict } from '@mamalik/database';
import { createResultWriter } from '../src/result-writer.js';
import { finishedArchive } from './support/result-fixture.js';
const sampleArchive = finishedArchive();
afterEach(() => vi.useRealTimers());

it('acknowledges only a completed write and retries the same detached record after an uncertain commit', async () => {
  const write = vi
    .fn()
    .mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValue({ created: false });
  const writer = createResultWriter(write, async () => {});
  const input = structuredClone(sampleArchive);
  const done = writer.submit(input);
  input.seed = 1;
  expect(await done).toBe('saved');
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[0]![0]).toEqual(sampleArchive);
  expect(write.mock.calls[1]![0]).toEqual(sampleArchive);
  await writer.drain();
});
it('reports failed writes, rejects malformed data and does not retry conflicts', async () => {
  const offline = vi
    .fn()
    .mockRejectedValue(new Error('private connection detail'));
  const writer = createResultWriter(offline, async () => {});
  expect(await writer.submit(sampleArchive)).toBe('failed');
  expect(offline).toHaveBeenCalledTimes(3);
  expect(await writer.submit({ ...sampleArchive, answers: {} })).toBe('failed');
  expect(offline).toHaveBeenCalledTimes(3);
  const conflict = vi.fn().mockRejectedValue(new MatchArchiveConflict());
  expect(await createResultWriter(conflict).submit(sampleArchive)).toBe(
    'failed',
  );
  expect(conflict).toHaveBeenCalledOnce();
});
it('bounds concurrency/queue and settles pending work on a shutdown deadline without false saved acknowledgements', async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const write = vi.fn(() => blocked);
  const writer = createResultWriter(write);
  const jobs = Array.from({ length: 64 }, (_, index) =>
    writer.submit({ ...sampleArchive, matchId: `m_${index}` }),
  );
  expect(write).toHaveBeenCalledTimes(4);
  expect(await writer.submit(sampleArchive)).toBe('failed');
  const drain = writer.drain(1000);
  await vi.advanceTimersByTimeAsync(1000);
  await drain;
  expect(await Promise.all(jobs)).toEqual(Array(64).fill('failed'));
  release();
  await Promise.resolve();
  expect(write).toHaveBeenCalledTimes(4);
  expect(await writer.submit(sampleArchive)).toBe('failed');
});
it('drains successful queued work and closes submission after shutdown', async () => {
  const writer = createResultWriter(async () => ({ created: true }));
  const jobs = Array.from({ length: 8 }, (_, index) =>
    writer.submit({ ...sampleArchive, matchId: `m_${index}` }),
  );
  await writer.drain();
  expect(await Promise.all(jobs)).toEqual(Array(8).fill('saved'));
  expect(await writer.submit(sampleArchive)).toBe('failed');
});
