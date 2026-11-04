import Link from 'next/link';
import { KingdomMark } from '../../components/kingdom-mark';
import { readWebAuthConfig } from '../../features/content/server-config';
import { HistoryPanel } from '../../features/history/history-panel';
import '../../features/content/content.css';
import './history.css';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'سجل مبارياتي | ممالك المعرفة',
  robots: { index: false, follow: false },
};
export default function HistoryPage() {
  const enabled =
    process.env.WEB_PLAYER_AUTH_ENABLED === 'true' &&
    Boolean(readWebAuthConfig(process.env));
  return (
    <div className="content-shell">
      <header className="content-header">
        <Link href="/" className="content-brand">
          <KingdomMark />
          <span>
            ممالك المعرفة<small>سجلّك الشخصي</small>
          </span>
        </Link>
        <Link href="/online" className="content-back">
          العودة إلى اللعب
        </Link>
      </header>
      <main id="main">
        {enabled ? (
          <>
            <p>
              <Link href="/standing" className="content-back">
                ترتيبي الشخصي ←
              </Link>
            </p>
            <HistoryPanel />
          </>
        ) : (
          <section className="history-panel content-empty">
            <h1>سجل المباريات غير متاح حاليًا</h1>
            <p>خدمات الحساب لم تُفعّل بعد. يمكنك متابعة اللعب بصفة ضيف.</p>
            <Link href="/online" className="content-primary">
              العب بصفة ضيف
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
