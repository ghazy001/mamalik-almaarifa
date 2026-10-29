export const WORLD_WIDTH = 1000;
export const WORLD_HEIGHT = 700;

/** Visual positions never define adjacency, move cost or game rules. */
export const GEOGRAPHY: Readonly<
  Record<string, { name: string; x: number; y: number }>
> = {
  t_00: { name: 'قلعة الفيروز', x: 490, y: 145 },
  t_01: { name: 'مرج الندى', x: 630, y: 145 },
  t_02: { name: 'هضبة المنار', x: 640, y: 265 },
  t_03: { name: 'غابة السنا', x: 785, y: 220 },
  t_04: { name: 'سهل النسيم', x: 835, y: 330 },
  t_05: { name: 'قلعة الياقوت', x: 790, y: 445 },
  t_06: { name: 'وادي النور', x: 690, y: 530 },
  t_07: { name: 'ملتقى الدروب', x: 555, y: 445 },
  t_08: { name: 'روضة الأفق', x: 470, y: 565 },
  t_09: { name: 'حقول الكهرمان', x: 335, y: 550 },
  t_10: { name: 'قلعة الكهرمان', x: 225, y: 470 },
  t_11: { name: 'غابة الظلال', x: 165, y: 350 },
  t_12: { name: 'عين الصفاء', x: 350, y: 330 },
  t_13: { name: 'جرف الصباح', x: 225, y: 235 },
  t_14: { name: 'ممر النجوم', x: 350, y: 160 },
};
