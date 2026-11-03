import Link from 'next/link';
import { SignIn } from '../../features/content/SignIn';
import { readWebAuthConfig } from '../../features/content/server-config';
import { KingdomMark } from '../../components/kingdom-mark';
import '../../features/content/content.css';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'حساب اللاعب | ممالك المعرفة',
  robots: { index: false, follow: false },
};
export default function PlayerAccountPage() {
  const enabled =
    process.env.WEB_PLAYER_AUTH_ENABLED === 'true' &&
    Boolean(readWebAuthConfig(process.env));
  return (
    <div className="content-shell">
      <header className="content-header">
        <Link href="/" className="content-brand">
          <KingdomMark />
          <span>ممالك المعرفة</span>
        </Link>
        <Link href="/online" className="content-back">
          العودة إلى اللعب
        </Link>
      </header>
      <main id="main">
        {enabled && (
          <p>
            <Link href="/history" className="content-back">
              سجل مبارياتي ←
            </Link>
          </p>
        )}
        <SignIn enabled={enabled} player />
      </main>
    </div>
  );
}
