import { describe, expect, it } from 'vitest';
import { questionContentSchema } from '../src/content.js';
import { databaseUrlSchema } from '../src/client.js';
import { sampleContent } from './sample.js';

describe('server-only Arabic content boundary', () => {
  it('accepts Arabic punctuation, diacritics and HTTPS sources', () => {
    expect(questionContentSchema.parse(sampleContent)).toEqual(sampleContent);
  });
  it.each([
    { ...sampleContent, correctChoiceId: 'unknown' },
    { ...sampleContent, correctAnswer: 'leak' },
    { ...sampleContent, choices: sampleContent.choices.slice(1) },
    { ...sampleContent, choices: Array(4).fill(sampleContent.choices[0]) },
    {
      ...sampleContent,
      choices: sampleContent.choices.map((choice) => ({
        ...choice,
        text: 'نفس الجواب',
      })),
    },
    { ...sampleContent, sources: [] },
    { ...sampleContent, sources: [{ label: 'x', url: 'not a URL' }] },
    { ...sampleContent, sources: [{ label: 'x', url: 'javascript:alert(1)' }] },
    {
      ...sampleContent,
      sources: [{ label: 'x', url: 'https://user:secret@example.org' }],
    },
    { ...sampleContent, text: '<script>test</script>' },
    { ...sampleContent, text: '\u0000' },
    { ...sampleContent, locale: 'en' },
  ])('rejects malformed or unsafe content %#', (input) => {
    expect(questionContentSchema.safeParse(input).success).toBe(false);
  });
  it('requires a PostgreSQL database URL without echoing it', () => {
    expect(
      databaseUrlSchema.safeParse('postgresql://localhost/mamalik').success,
    ).toBe(true);
    expect(databaseUrlSchema.safeParse('https://example.org/db').success).toBe(
      false,
    );
    expect(databaseUrlSchema.safeParse('postgresql://localhost').success).toBe(
      false,
    );
  });
});
