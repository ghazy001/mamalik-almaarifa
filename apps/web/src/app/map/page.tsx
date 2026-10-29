import Link from 'next/link';
import type { Metadata } from 'next';
import { KingdomMark } from '../../components/kingdom-mark';
import { MapPreview } from '../../features/map/map-preview';
import { createMapPreview } from '../../features/map/preview';
import './map.css';

export const metadata: Metadata = {
  title: 'أرخبيل المنار | ممالك المعرفة',
  description:
    'معاينة محلية لخريطة المملكة واختيار الأراضي المجاورة. أولى خطوات المرحلة الثانية.',
};
export default function MapPage() {
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
          العودة إلى البداية <span aria-hidden="true">←</span>
        </Link>
      </header>
      <main id="main">
        <div className="map-page-intro">
          <div>
            <p className="eyebrow">المرحلة الثانية · أولى الدروب</p>
            <h1>اكتشف حدود مملكتك.</h1>
          </div>
          <p>
            ثلاث قلاع، وخمسة عشر احتمالًا.
            <br />
            تعرّف إلى الجوار واختر خطوتك الأولى.
          </p>
        </div>
        <MapPreview model={createMapPreview()} />
      </main>
      <footer>
        <span className="footer-brand">ممالك المعرفة</span>
        <p>معاينة اختيار · بلا مؤقّت أو نتائج معارك</p>
        <span>عالم أصلي، يُبنى خطوة بخطوة.</span>
      </footer>
    </div>
  );
}
