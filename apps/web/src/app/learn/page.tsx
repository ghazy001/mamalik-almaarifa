import Link from 'next/link';
import type { Metadata } from 'next';
import { KingdomMark } from '../../components/kingdom-mark';
import { Practice } from '../../features/learn/Practice';
import '../map/map.css';
import '../play/play.css';
import './learn.css';

export const metadata: Metadata = {
  title: 'تعلّم اللعب | ممالك المعرفة',
  description:
    'تدريب عربي قصير: اختر أرضًا مجاورة، أجب عن سؤال، وتعرف كيف تفوز بمملكتك.',
};
export default function LearnPage() {
  return (
    <div className="map-page learn-page">
      <header className="map-page-header">
        <Link className="brand" href="/">
          <KingdomMark />
          <span>
            ممالك المعرفة<small>خطوتك الأولى إلى المملكة</small>
          </span>
        </Link>
        <Link className="map-back" href="/play" prefetch={false}>
          تجاوز التدريب والعب
        </Link>
      </header>
      <main id="main">
        <div className="map-page-intro">
          <div>
            <p className="eyebrow">تعلّم بالفعل · دون حساب</p>
            <h1>أرض واحدة، وخطوة أولى.</h1>
          </div>
          <p>
            جرّب اختيار الأرض والإجابة.
            <br />
            ثم انطلق إلى مباراة كاملة.
          </p>
        </div>
        <Practice />
      </main>
      <footer>
        <Link className="footer-brand" href="/">
          ممالك المعرفة
        </Link>
        <p>التدريب اختياري. يمكنك العودة إليه متى شئت.</p>
      </footer>
    </div>
  );
}
