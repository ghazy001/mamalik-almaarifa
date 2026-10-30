import Link from 'next/link';
import type { Metadata } from 'next';
import { KingdomMark } from '../../components/kingdom-mark';
import { OnlineMatch } from '../../features/online/online-match';
import '../map/map.css';
import '../play/play.css';
import './online.css';

export const metadata: Metadata = {
  title: 'اللعب الجماعي | ممالك المعرفة',
  description: 'ابحث عن لاعبين أو ادعُ أصدقاءك إلى مباراة معرفة واستراتيجية.',
};
export const dynamic = 'force-dynamic';
export default function OnlinePage() {
  const endpoint = process.env.GAME_SERVER_URL ?? 'http://127.0.0.1:2567';
  const url = new URL(endpoint);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('Invalid GAME_SERVER_URL');
  return (
    <div className="map-page">
      <header className="map-page-header">
        <Link href="/" className="brand">
          <KingdomMark />
          <span>
            ممالك المعرفة<small>أرخبيل المنار</small>
          </span>
        </Link>
        <Link className="map-back" href="/">
          البداية ←
        </Link>
      </header>
      <main id="main">
        <div className="map-page-intro">
          <div>
            <p className="eyebrow">المرحلة الثالثة · اللعب الجماعي</p>
            <h1>ثلاث ممالك، معرفة تجمعها.</h1>
          </div>
          <p>
            ثلاثة ضيوف حقيقيين.
            <br />
            أسئلة ونتائج يحسمها الخادم.
          </p>
        </div>
        <OnlineMatch endpoint={endpoint} />
      </main>
      <footer>
        <span className="footer-brand">ممالك المعرفة</span>
        <p>تجربة تطوير · سجل المباريات غير متاح في هذه الواجهة.</p>
      </footer>
    </div>
  );
}
