'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { createHistorySession } from './history-session';
const numbers = new Intl.NumberFormat('ar', { numberingSystem: 'arab' });
const dates = new Intl.DateTimeFormat('ar', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Tunis',
  numberingSystem: 'arab',
});
const outcomes = {
  won: 'انتصار',
  shared: 'صدارة مشتركة',
  lost: 'مباراة مكتملة',
  aborted: 'مباراة ملغاة',
};
const reasons = {
  CASTLES: 'حُسمت بالسيطرة على القلاع.',
  LAST_PLAYER: 'بقيت مملكة واحدة بعد خروج المنافسين.',
  TURN_LIMIT: 'اكتملت الأدوار وحُسم الترتيب بالنقاط.',
  ABORTED: 'أُلغيت المباراة دون فائز.',
};
export function HistoryPanel() {
  const [session] = useState(() => createHistorySession());
  const view = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  useEffect(() => {
    void session.start();
    const visible = () => {
      if (document.visibilityState === 'visible') void session.refresh();
    };
    const focus = () => {
      void session.refresh();
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', focus);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', focus);
      session.stop();
    };
  }, [session]);
  const busy = view.status === 'loading';
  return (
    <section
      className="history-panel"
      aria-labelledby="history-title"
      aria-busy={busy}
      data-history-status={view.status}
    >
      <div className="history-heading">
        <div>
          <p className="eyebrow">رحلتك في المملكة</p>
          <h1 id="history-title">سجل مبارياتي</h1>
        </div>
        <button
          className="content-secondary"
          onClick={() => void session.refresh()}
          disabled={busy}
        >
          تحديث السجل
        </button>
      </div>
      <p className="content-muted">
        النتائج المحفوظة للمباريات التي دخلتها بحسابك. مباريات الضيف لا تُربط
        بالحساب بأثر رجعي. وقت الحفظ بتوقيت تونس؛ لا يمثّل مدة المباراة.
      </p>
      <p role="status" aria-live="polite" className="history-status">
        {busy
          ? 'جارٍ تحميل سجلّك…'
          : view.status === 'unauthenticated'
            ? 'سجّل الدخول لعرض مبارياتك الخاصة.'
            : view.status === 'error'
              ? 'تعذّر تحميل السجل. حاول مجددًا؛ لم نعرض بيانات قديمة.'
              : !view.page?.items.length
                ? 'لا توجد مباريات محفوظة في هذه الصفحة.'
                : `${numbers.format(view.page.items.length)} مباراة في الصفحة ${numbers.format(view.index + 1)}`}
      </p>
      {view.status === 'unauthenticated' && (
        <Link href="/account" className="content-primary">
          دخول حساب اللاعب
        </Link>
      )}
      <ol className="history-list">
        {view.page?.items.map((item) => (
          <li
            className="history-card"
            key={item.matchId}
            data-history-match={item.matchId}
            data-outcome={item.outcome}
          >
            <div className="history-card-heading">
              <h2>{outcomes[item.outcome]}</h2>
              <span>
                {item.mode === 'private' ? 'غرفة خاصة' : 'بحث عن لاعبين'}
              </span>
            </div>
            <p>{reasons[item.reason]}</p>
            <p className="content-muted">
              حُفظت في{' '}
              <time dateTime={item.recordedAt}>
                {dates.format(new Date(item.recordedAt))}
              </time>
            </p>
            <dl>
              {[
                ['المركز', item.outcome === 'aborted' ? '—' : item.rank],
                ['النقاط', item.score],
                ['القلاع', item.castles],
                ['الأراضي', item.territories],
                ['الأدوار', item.finalTurn],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt>{label}</dt>
                  <dd>
                    {typeof value === 'number' ? numbers.format(value) : value}
                  </dd>
                </div>
              ))}
            </dl>
            {item.eliminated && (
              <p className="content-muted">انتهت مشاركتك بالإقصاء.</p>
            )}
          </li>
        ))}
      </ol>
      <nav aria-label="صفحات سجل المباريات" className="history-pagination">
        <button
          className="content-secondary"
          onClick={() => void session.previous()}
          disabled={busy || view.status !== 'ready' || view.index === 0}
        >
          الصفحة السابقة
        </button>
        <button
          className="content-primary"
          onClick={() => void session.next()}
          disabled={busy || view.status !== 'ready' || !view.page?.nextCursor}
        >
          الصفحة التالية
        </button>
      </nav>
    </section>
  );
}
