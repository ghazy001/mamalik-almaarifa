import Link from 'next/link';
import type { ReactNode } from 'react';
import './content.css';
export function ContentShell({ children }: { children: ReactNode }) {
  return (
    <div className="content-shell">
      <header className="content-header">
        <Link href="/" className="content-brand">
          <svg viewBox="0 0 40 44" aria-hidden="true">
            <path
              d="M5 38V14h7V6h6v8h4V6h6v8h7v24H5Zm11 0V27a4 4 0 0 1 8 0v11M5 20h30"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
          <span>
            ممالك المعرفة<small>دار المعرفة · فريق المحتوى</small>
          </span>
        </Link>
        <Link href="/online" className="content-back">
          العودة إلى المملكة <span aria-hidden="true">←</span>
        </Link>
      </header>
      <main id="main">{children}</main>
      <footer className="content-footer">
        كل سؤالٍ واضح، خطوة نحو منافسة أعدل.
      </footer>
    </div>
  );
}
