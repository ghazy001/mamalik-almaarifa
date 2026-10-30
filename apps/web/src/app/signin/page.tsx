import { ContentShell } from '../../features/content/ContentShell';
import { SignIn } from '../../features/content/SignIn';
import { readWebAuthConfig } from '../../features/content/server-config';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'دخول فريق المحتوى | ممالك المعرفة',
  robots: { index: false, follow: false },
};
export default function SignInPage() {
  return (
    <ContentShell>
      <SignIn enabled={Boolean(readWebAuthConfig(process.env))} />
    </ContentShell>
  );
}
