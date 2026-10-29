import type { Question } from '@mamalik/game-core';

export interface QuestionFixture {
  question: Question;
  category: string;
  explanation: string;
  source: { label: string; url: string } | null;
  calculation?: {
    operator: 'add' | 'subtract' | 'multiply';
    left: number;
    right: number;
  };
}
const digits = new Intl.NumberFormat('ar', { numberingSystem: 'arab' });
const nasa = {
  label: 'NASA · الكواكب',
  url: 'https://science.nasa.gov/solar-system/planets/',
};
const si = {
  label: 'BIPM · الوحدات الأساسية',
  url: 'https://www.bipm.org/en/measurement-units/si-base-units',
};
const mdn = (path: string) => ({
  label: 'MDN · تقنيات الويب',
  url: `https://developer.mozilla.org/en-US/docs/${path}`,
});

function fixture(
  id: string,
  category: string,
  text: string,
  correct: string,
  wrong: [string, string, string],
  explanation: string,
  source: QuestionFixture['source'],
  index: number,
): QuestionFixture {
  const options = [correct, ...wrong];
  const rotated = [...options.slice(index % 4), ...options.slice(0, index % 4)];
  const choices: Question['choices'] = [
    { id: 'a', text: rotated[0]! },
    { id: 'b', text: rotated[1]! },
    { id: 'c', text: rotated[2]! },
    { id: 'd', text: rotated[3]! },
  ];
  return {
    question: {
      id,
      text,
      choices,
      correctChoiceId: choices.find((choice) => choice.text === correct)!.id,
    },
    category,
    explanation,
    source,
  };
}

// Original Arabic development fixtures. Source-checked, not a human-reviewed release bank.
const facts: QuestionFixture[] = [
  fixture(
    'q_space_1',
    'الفضاء',
    'أي كوكب هو الأقرب إلى الشمس؟',
    'عطارد',
    ['الأرض', 'المريخ', 'زحل'],
    'عطارد أول الكواكب قربًا من الشمس.',
    nasa,
    0,
  ),
  fixture(
    'q_space_2',
    'الفضاء',
    'ما ترتيب الأرض بين الكواكب بدءًا من الشمس؟',
    'الثالث',
    ['الأول', 'الثاني', 'الخامس'],
    'الأرض هي الكوكب الثالث من الشمس.',
    nasa,
    1,
  ),
  fixture(
    'q_space_3',
    'الفضاء',
    'ما أكبر كواكب مجموعتنا الشمسية؟',
    'المشتري',
    ['الأرض', 'المريخ', 'نبتون'],
    'المشتري أكبر كواكب المجموعة الشمسية.',
    nasa,
    2,
  ),
  fixture(
    'q_space_4',
    'الفضاء',
    'أي كوكب يأتي سادسًا بدءًا من الشمس؟',
    'زحل',
    ['الزهرة', 'الأرض', 'عطارد'],
    'زحل هو الكوكب السادس من الشمس.',
    nasa,
    3,
  ),
  fixture(
    'q_space_5',
    'الفضاء',
    'أي الكواكب الثمانية أبعد عن الشمس؟',
    'نبتون',
    ['المشتري', 'زحل', 'المريخ'],
    'نبتون ثامن الكواكب وأبعدها عن الشمس.',
    nasa,
    4,
  ),
  fixture(
    'q_space_6',
    'الفضاء',
    'أي كوكب يأتي ثانيًا بدءًا من الشمس؟',
    'الزهرة',
    ['عطارد', 'الأرض', 'المريخ'],
    'الزهرة هو الكوكب الثاني من الشمس.',
    nasa,
    5,
  ),
  fixture(
    'q_si_1',
    'العلوم',
    'ما وحدة الطول الأساسية في النظام الدولي؟',
    'المتر',
    ['الثانية', 'الكيلوغرام', 'الأمبير'],
    'المتر وحدة الطول الأساسية.',
    si,
    6,
  ),
  fixture(
    'q_si_2',
    'العلوم',
    'ما وحدة الزمن الأساسية في النظام الدولي؟',
    'الثانية',
    ['المتر', 'الكلفن', 'المول'],
    'الثانية وحدة الزمن الأساسية.',
    si,
    7,
  ),
  fixture(
    'q_si_3',
    'العلوم',
    'ما وحدة الكتلة الأساسية في النظام الدولي؟',
    'الكيلوغرام',
    ['المتر', 'الأمبير', 'الثانية'],
    'الكيلوغرام وحدة الكتلة الأساسية.',
    si,
    8,
  ),
  fixture(
    'q_si_4',
    'العلوم',
    'ما وحدة شدة التيار الكهربائي الأساسية في النظام الدولي؟',
    'الأمبير',
    ['الكلفن', 'المول', 'المتر'],
    'الأمبير وحدة شدة التيار الكهربائي.',
    si,
    9,
  ),
  fixture(
    'q_si_5',
    'العلوم',
    'ما وحدة درجة الحرارة الديناميكية الحرارية الأساسية في النظام الدولي؟',
    'الكلفن',
    ['الثانية', 'المتر', 'المول'],
    'الكلفن وحدة درجة الحرارة الديناميكية الحرارية.',
    si,
    10,
  ),
  fixture(
    'q_si_6',
    'العلوم',
    'ما وحدة كمية المادة الأساسية في النظام الدولي؟',
    'المول',
    ['الأمبير', 'الكيلوغرام', 'الثانية'],
    'المول وحدة كمية المادة الأساسية.',
    si,
    11,
  ),
  fixture(
    'q_web_1',
    'التقنية',
    'أي تقنية تصف بنية محتوى صفحة الويب؟',
    'HTML',
    ['CSS', 'HTTP', 'UTF-8'],
    'تصف HTML بنية المحتوى وعناصره.',
    mdn(
      'Learn_web_development/Getting_started/Your_first_website/Creating_the_content',
    ),
    12,
  ),
  fixture(
    'q_web_2',
    'التقنية',
    'أي تقنية تُستخدم لتنسيق ألوان صفحة الويب ومظهرها؟',
    'CSS',
    ['HTML', 'HTTP', 'URL'],
    'تُستخدم CSS للتحكم في المظهر والتنسيق.',
    mdn(
      'Learn_web_development/Getting_started/Your_first_website/Styling_the_content',
    ),
    13,
  ),
  fixture(
    'q_web_3',
    'التقنية',
    'أي لغة تُستخدم لإضافة التفاعل البرمجي داخل صفحة الويب؟',
    'JavaScript',
    ['CSS', 'HTTP', 'UTF-8'],
    'يمكن لـ JavaScript إضافة سلوك تفاعلي للصفحات.',
    mdn(
      'Learn_web_development/Getting_started/Your_first_website/Adding_interactivity',
    ),
    14,
  ),
  fixture(
    'q_web_4',
    'التقنية',
    'أي خيار هو بروتوكول لنقل موارد الويب؟',
    'HTTP',
    ['HTML', 'CSS', 'UTF-8'],
    'HTTP بروتوكول يُستخدم لنقل موارد الويب.',
    mdn('Glossary/HTTP'),
    15,
  ),
  fixture(
    'q_web_5',
    'التقنية',
    'أي اختصار يشير إلى عنوان يحدّد موقع مورد على الويب؟',
    'URL',
    ['CSS', 'HTML', 'UTF-8'],
    'يشير URL إلى محدّد موقع المورد.',
    mdn('Glossary/URL'),
    16,
  ),
  fixture(
    'q_web_6',
    'التقنية',
    'أي خيار هو ترميز محارف يدعم كتابة العربية؟',
    'UTF-8',
    ['HTTP', 'CSS', 'URL'],
    'UTF-8 ترميز لمحارف Unicode، ومنها العربية.',
    mdn('Glossary/UTF-8'),
    17,
  ),
];

const arithmetic: QuestionFixture[] = Array.from({ length: 18 }, (_, index) => {
  const n = index % 6;
  const operator = index < 6 ? 'add' : index < 12 ? 'subtract' : 'multiply';
  const left =
    operator === 'add' ? 7 + n : operator === 'subtract' ? 30 + n * 3 : 3 + n;
  const right =
    operator === 'add' ? 9 + n : operator === 'subtract' ? 7 + n : 4 + n;
  const answer =
    operator === 'add'
      ? left + right
      : operator === 'subtract'
        ? left - right
        : left * right;
  const text =
    operator === 'add'
      ? `كم حاصل جمع ${digits.format(left)} و${digits.format(right)}؟`
      : operator === 'subtract'
        ? `كم يتبقى عند طرح ${digits.format(right)} من ${digits.format(left)}؟`
        : `كم حاصل ضرب ${digits.format(left)} في ${digits.format(right)}؟`;
  return {
    ...fixture(
      `q_math_${index + 1}`,
      'الحساب',
      text,
      digits.format(answer),
      [
        digits.format(answer - 1),
        digits.format(answer + 2),
        digits.format(answer + 3),
      ],
      `الحساب المباشر يعطي ${digits.format(answer)}.`,
      null,
      index + 18,
    ),
    calculation: { operator, left, right },
  };
});

export const QUESTION_FIXTURES: readonly QuestionFixture[] = [
  ...facts,
  ...arithmetic,
];
export function findFixture(id: string): QuestionFixture {
  const found = QUESTION_FIXTURES.find((item) => item.question.id === id);
  if (!found) throw new Error(`Unknown local fixture ${id}`);
  return found;
}
