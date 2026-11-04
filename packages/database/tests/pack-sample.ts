import type { QuestionPack } from '../src/question-pack.js';
import { sampleContent } from './sample.js';

// Public test content only. Never import the private release candidate into tests.
export function samplePack(packId = 'test-pack'): QuestionPack {
  return {
    schemaVersion: 1,
    packId,
    locale: 'ar',
    status: 'DRAFT',
    preparedOn: '2026-11-04',
    questions: ['alpha', 'beta'].map((key, index) => ({
      key,
      difficulty: 'easy',
      reviewStatus: 'PENDING',
      content: {
        ...structuredClone(sampleContent),
        text:
          index === 0
            ? sampleContent.text
            : 'أي كوكب يبدأ به ترتيب الكواكب من الشمس؟',
      },
      evidence: {
        checkedOn: '2026-11-03',
        note: 'Synthetic public fixture for import tests; not a release review.',
      },
    })),
  };
}
