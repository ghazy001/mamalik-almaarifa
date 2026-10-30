import type { QuestionContent } from '../src/content.js';

export const sampleContent: QuestionContent = {
  locale: 'ar',
  category: 'الفضاء',
  text: 'أي كوكب هو الأقرب إلى الشمس؟',
  choices: [
    { id: 'a', text: 'عطارد' },
    { id: 'b', text: 'الأرض' },
    { id: 'c', text: 'المريخ' },
    { id: 'd', text: 'زحل' },
  ],
  correctChoiceId: 'a',
  explanation: 'عطارد أول الكواكب قربًا من الشمس.',
  sources: [
    {
      label: 'NASA · الكواكب',
      url: 'https://science.nasa.gov/solar-system/planets/',
    },
  ],
};
