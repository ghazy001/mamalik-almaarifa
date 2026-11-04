import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  MAX_PACK_BYTES,
  questionPackSchema,
  readQuestionPack,
  summarizeQuestionPack,
} from '../src/question-pack.js';
import { samplePack } from './pack-sample.js';

const directory = await mkdtemp(join(tmpdir(), 'mamalik-pack-unit-'));
afterAll(() => rm(directory, { recursive: true, force: true }));

describe('private draft pack boundary', () => {
  it('returns answer-free aggregate diagnostics with a reproducible digest', () => {
    const pack = samplePack();
    const result = summarizeQuestionPack(pack);
    expect(result).toMatchObject({
      questions: 2,
      categories: { الفضاء: 2 },
      difficulties: { easy: 2, medium: 0, hard: 0 },
      answerPositions: { a: 2, b: 0, c: 0, d: 0 },
      minimumDraftTargetMet: false,
      pendingHumanReview: 2,
      publishedByImport: 0,
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(summarizeQuestionPack(structuredClone(pack))).toEqual(result);
    expect(JSON.stringify(result)).not.toContain(
      pack.questions[0]!.content.explanation,
    );
    expect(JSON.stringify(result)).not.toContain('correctChoiceId');
    pack.questions[0]!.evidence.note += ' amended';
    expect(summarizeQuestionPack(pack).sha256).not.toBe(result.sha256);
  });

  it.each([
    { schemaVersion: 2 },
    { status: 'APPROVED' },
    { locale: 'en' },
    { reviewer: 'pretend-human' },
    { packId: '../unsafe' },
    { preparedOn: '2026-02-30' },
    { questions: [] },
  ])('rejects incompatible or misleading metadata %j', (change) => {
    expect(
      questionPackSchema.safeParse({ ...samplePack(), ...change }).success,
    ).toBe(false);
  });

  it('rejects duplicate keys and Arabic-equivalent prompts', () => {
    const pack = samplePack();
    pack.questions[1]!.key = pack.questions[0]!.key;
    expect(questionPackSchema.safeParse(pack).success).toBe(false);
    pack.questions[1]!.key = 'other';
    pack.questions[0]!.content.text = 'أي كوكب؟';
    pack.questions[1]!.content.text = 'إي   كَوكب؟';
    expect(questionPackSchema.safeParse(pack).success).toBe(false);
  });

  it('rejects choices differing only in Arabic marks or tatweel', () => {
    const pack = samplePack();
    pack.questions[0]!.content.choices[0]!.text = 'الارض';
    pack.questions[0]!.content.choices[1]!.text = 'الأَرْض';
    expect(questionPackSchema.safeParse(pack).success).toBe(false);
    pack.questions[0]!.content.choices[1]!.text = 'الاـرض';
    expect(questionPackSchema.safeParse(pack).success).toBe(false);
  });

  it('requires a pending review, meaningful dated evidence and validated source URLs', () => {
    const pack = samplePack();
    const question = pack.questions[0]!;
    for (const evidence of [
      { checkedOn: '2026-11-05', note: 'future' },
      { checkedOn: '2026-11-03', note: ' ' },
    ]) {
      expect(
        questionPackSchema.safeParse({
          ...pack,
          questions: [{ ...question, evidence }],
        }).success,
      ).toBe(false);
    }
    expect(
      questionPackSchema.safeParse({
        ...pack,
        questions: [{ ...question, reviewStatus: 'REVIEWED' }],
      }).success,
    ).toBe(false);
    question.content.sources[0]!.url = 'https://user:password@example.org';
    expect(questionPackSchema.safeParse(pack).success).toBe(false);
    question.content.sources[0]!.url = 'http://example.org';
    expect(questionPackSchema.safeParse(pack).success).toBe(false);
  });

  it('rejects overlong keys, oversized batches and malformed question content', () => {
    const pack = samplePack();
    const question = pack.questions[0]!;
    expect(
      questionPackSchema.safeParse({
        ...pack,
        questions: [{ ...question, key: 'x'.repeat(49) }],
      }).success,
    ).toBe(false);
    expect(
      questionPackSchema.safeParse({
        ...pack,
        questions: Array(201).fill(question),
      }).success,
    ).toBe(false);
    expect(
      questionPackSchema.safeParse({
        ...pack,
        questions: [
          {
            ...question,
            content: { ...question.content, correctChoiceId: 'x' },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('bounds file reads and reports malformed JSON without leaking payloads', async () => {
    const path = join(directory, 'pack.json');
    await writeFile(path, JSON.stringify(samplePack()));
    expect(await readQuestionPack(path)).toEqual(samplePack());
    await writeFile(path, '{"secret-answer":');
    await expect(readQuestionPack(path)).rejects.toMatchObject({
      code: 'INVALID_PACK_JSON',
      message: 'INVALID_PACK_JSON',
    });
    await writeFile(path, Buffer.alloc(MAX_PACK_BYTES + 1));
    await expect(readQuestionPack(path)).rejects.toMatchObject({
      code: 'PACK_FILE_TOO_LARGE',
    });
    await expect(readQuestionPack(directory)).rejects.toMatchObject({
      code: 'PACK_FILE_UNREADABLE',
    });
    await expect(
      readQuestionPack(join(directory, 'missing')),
    ).rejects.toMatchObject({ code: 'PACK_FILE_UNREADABLE' });
  });
});
