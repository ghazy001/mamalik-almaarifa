import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ContentShell } from '../../features/content/ContentShell';
import { ContentDesk } from '../../features/content/ContentDesk';
import { contentFetch, serverToken } from '../../features/content/server-http';
import { meSchema } from '../../features/content/contracts';
import { readWebAuthConfig } from '../../features/content/server-config';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'دار المعرفة | ممالك المعرفة',
  robots: { index: false, follow: false },
};
export default async function AdminPage() {
  if (!readWebAuthConfig(process.env))
    return (
      <ContentShell>
        <section className="content-empty content-card">
          <p className="eyebrow">دار المعرفة</p>
          <h1>بوابة الفريق غير متاحة حاليًا</h1>
          <p>يمكنك متابعة اللعب بصفة ضيف.</p>
          <Link href="/online" className="content-primary">
            العودة إلى المملكة
          </Link>
        </section>
      </ContentShell>
    );
  const session = await serverToken();
  if (!session) redirect('/signin');
  let me = null;
  let unauthorized = false;
  try {
    const response = await contentFetch(
      '/me',
      session.token,
      session.config.contentUrl,
    );
    if (response.status === 401) unauthorized = true;
    if (response.ok) me = meSchema.parse(await response.json());
  } catch {
    /* Render an unavailable state; never private upstream details. */
  }
  if (unauthorized) redirect('/signin');
  return (
    <ContentShell>
      {me ? (
        <ContentDesk initialMe={me} />
      ) : (
        <section className="content-empty content-card">
          <h1>تعذّر فتح دار المعرفة</h1>
          <p>الخدمة غير متاحة الآن. حاول مجددًا بعد قليل.</p>
          <Link href="/admin" className="content-primary">
            إعادة المحاولة
          </Link>
          <Link href="/signin">العودة إلى الدخول</Link>
        </section>
      )}
    </ContentShell>
  );
}
