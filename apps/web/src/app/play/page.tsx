import Link from 'next/link';
import type { Metadata } from 'next';
import { KingdomMark } from '../../components/kingdom-mark';
import { LocalMatch } from '../../features/match/local-match';
import '../map/map.css';
import './play.css';

export const metadata: Metadata = {
  title: 'مباراة محلية | ممالك المعرفة',
  description:
    'قد مملكة فيروز في مباراة محلية كاملة ضد خصمين مبرمجين. أجب عن الأسئلة واختر طريقك إلى القلاع.',
};
export default function PlayPage() {
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
          مغادرة اللعب المحلي <span aria-hidden="true">←</span>
        </Link>
      </header>
      <main id="main">
        <div className="map-page-intro">
          <div>
            <p className="eyebrow">المرحلة الثانية · مباراة محلية كاملة</p>
            <h1>ابنِ مملكتك بالمعرفة.</h1>
          </div>
          <p>
            أنت ومملكتان مبرمجتان.
            <br />
            هذه المباراة محلية؛ الغرف الخاصة في صفحة مستقلة.
          </p>
        </div>
        <LocalMatch />
      </main>
      <footer>
        <span className="footer-brand">ممالك المعرفة</span>
        <p>أجب بذكاء، واختر طريقك بحكمة.</p>
        <Link className="map-back" href="/map">
          معاينة الخريطة دون مؤقّت
        </Link>
      </footer>
    </div>
  );
}
