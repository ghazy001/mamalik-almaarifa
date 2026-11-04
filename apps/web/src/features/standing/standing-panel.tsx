'use client';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createStandingSession } from './standing-session';
const numbers = new Intl.NumberFormat('ar', { numberingSystem: 'arab' });
export function StandingPanel() {
  const [session] = useState(() => createStandingSession());
  const view = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  useEffect(() => {
    void session.start();
    const refresh = () => {
      if (document.visibilityState === 'visible') void session.refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      session.stop();
    };
  }, [session]);
  const value = view.standing,
    busy = view.status === 'loading';
  return (
    <section
      className="history-panel standing-panel"
      aria-labelledby="standing-title"
      aria-busy={busy}
      data-standing-status={view.status}
    >
      <div className="history-heading">
        <div>
          <p className="eyebrow">رحلتك بالأرقام</p>
          <h1 id="standing-title">ترتيبي الشخصي</h1>
        </div>
        <button
          className="content-secondary"
          disabled={busy}
          onClick={() => void session.refresh()}
        >
          تحديث الترتيب
        </button>
      </div>
      <p className="content-muted">
        نقاطك ومركزك بين الحسابات المؤهلة في مشروع اللعبة نفسه. هذا العرض خاص
        بك؛ لا يعرض أسماء المنافسين. النقاط تراكمية وليست تقديرًا للمهارة.
      </p>
      <p role="status" aria-live="polite" className="history-status">
        {busy
          ? 'جارٍ تحميل ترتيبك…'
          : view.status === 'unauthenticated'
            ? 'سجّل الدخول لعرض ترتيبك الخاص.'
            : view.status === 'error'
              ? 'تعذّر تحميل الترتيب. حاول مجددًا.'
              : value?.position === null
                ? 'لم تُصنّف بعد. لا توجد مباريات مؤهلة محفوظة لحسابك.'
                : 'حُدّث ترتيبك من النتائج المحفوظة.'}
      </p>
      {view.status === 'unauthenticated' && (
        <Link href="/account" className="content-primary">
          دخول حساب اللاعب
        </Link>
      )}
      {value && (
        <dl className="standing-stats" data-standing-result="ready">
          {[
            ['المركز', value.position],
            ['نقاط الترتيب', value.points],
            ['مباريات مؤهلة', value.eligibleMatches],
            ['انتصارات منفردة', value.soleWins],
            ['صدارات مشتركة', value.sharedWins],
          ].map(([label, count]) => (
            <div key={String(label)}>
              <dt>{label}</dt>
              <dd>{typeof count === 'number' ? numbers.format(count) : '—'}</dd>
            </div>
          ))}
        </dl>
      )}
      <aside
        className="standing-policy"
        aria-labelledby="standing-policy-title"
      >
        <h2 id="standing-policy-title">كيف يُحسب الترتيب؟</h2>
        <p>
          السياسة الأساسية ١ · <bdi dir="ltr">basic-v1</bdi>
        </p>
        <ul>
          <li>
            ٣ نقاط للانتصار المنفرد، ونقطة لكل متصدر مشترك، وصفر لبقية
            المشاركين.
          </li>
          <li>
            تساوي النقاط يعني مركزًا مشتركًا: ١، ١، ٢. لا تُكسر المساواة بالاسم
            أو وقت اللعب.
          </li>
          <li>
            تُحتسب مباريات البحث عن لاعبين فقط، بثلاثة حسابات موثّقة من المشروع
            نفسه وأسئلة منشورة.
          </li>
          <li>
            القواعد المعتادة: حدّ ٣٦ دورًا، و١٠ ثوانٍ للاختيار، و١٥ ثانية
            للإجابة؛ تُقبل نهاية مبكرة بحسم القلاع.
          </li>
          <li>
            تُحتسب نهاية القلاع أو حدّ الأدوار بعد استهلاك سؤال على الأقل.
            تُستبعد نهاية آخر لاعب، والإلغاء، والغرف الخاصة، والضيف، والأسئلة
            التطويرية.
          </li>
          <li>
            تشمل السياسة النتائج القديمة المؤهلة. تُحدَّث النقاط بعد حفظ
            النتيجة؛ قد تتغير المراكز عند حفظ نتائج أخرى.
          </li>
        </ul>
        <p className="content-muted">
          المباريات المستبعدة تبقى في سجلّك. نشر الأسئلة لا يضمن سريتها،
          والنتيجة لا تثبت خلو المباراة من انسحابات سابقة. لا يوجد تصنيف مهارة
          أو اعتماد للمنافسة العامة.
        </p>
      </aside>
      <Link href="/history" className="content-back">
        سجل مبارياتي ←
      </Link>
    </section>
  );
}
