import { ROOM_ADMISSION_ERRORS } from '@mamalik/shared';

export function admissionErrorMessage(error: unknown) {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 503 &&
    'message' in error
      ? error.message
      : null;
  if (code === ROOM_ADMISSION_ERRORS.CONTENT_BANK_INSUFFICIENT)
    return 'مكتبة الأسئلة المنشورة غير كافية لبدء مباراة. حاول لاحقًا.';
  if (code === ROOM_ADMISSION_ERRORS.CONTENT_BANK_INVALID)
    return 'تعذّر التحقق من مكتبة الأسئلة. حاول لاحقًا.';
  if (code === ROOM_ADMISSION_ERRORS.CONTENT_BANK_UNAVAILABLE)
    return 'مكتبة الأسئلة غير متاحة الآن. حاول مجددًا بعد قليل.';
  return 'تعذّر الاتصال. تحقّق من تشغيل خدمة اللعبة ورمز الدعوة أو مهلة الاستعادة.';
}
