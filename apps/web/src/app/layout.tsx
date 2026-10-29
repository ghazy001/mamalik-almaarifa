import type { Metadata } from 'next';
import '@fontsource/noto-sans-arabic/400.css';
import '@fontsource/noto-sans-arabic/600.css';
import '@fontsource/noto-sans-arabic/700.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'ممالك المعرفة | المعرفة تصنع الملوك',
  description:
    'لعبة استراتيجية عربية لثلاثة لاعبين. أجب بذكاء، واختر طريقك، وابنِ مملكتك. مرحلة تأسيس القواعد.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <a className="skip-link" href="#main">
          انتقل إلى المحتوى
        </a>
        {children}
      </body>
    </html>
  );
}
