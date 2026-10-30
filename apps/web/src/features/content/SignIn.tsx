'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
export function SignIn({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(data.get('email') ?? '').trim(),
          password: String(data.get('password') ?? ''),
        }),
      });
      if (response.ok) {
        form.reset();
        window.location.replace('/admin');
        return;
      }
      setError(
        response.status === 401
          ? 'تعذّر تسجيل الدخول. تحقق من البريد وكلمة المرور.'
          : response.status === 429
            ? 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.'
            : 'خدمة الدخول غير متاحة الآن. حاول لاحقًا.',
      );
    } catch {
      setError('تعذّر الاتصال. تحقق من الشبكة ثم حاول مجددًا.');
    } finally {
      const password = form.elements.namedItem('password');
      if (password instanceof HTMLInputElement) password.value = '';
      setBusy(false);
    }
  }
  return (
    <section className="signin-grid">
      <div className="content-intro">
        <p className="eyebrow">أمناء المعرفة</p>
        <h1>
          سؤالٌ موثوق.
          <br />
          <span>منافسة تستحقها.</span>
        </h1>
        <p>
          مساحة فريق المحتوى لصياغة أسئلة عربية واضحة، وتوثيق مصادرها، ومراجعتها
          قبل النشر.
        </p>
        <ol className="content-principles">
          <li>
            <b>صياغة دقيقة</b>
            <span>أربع إجابات واضحة، وإجابة صحيحة واحدة.</span>
          </li>
          <li>
            <b>مراجعة مستقلة</b>
            <span>عين أخرى تراجع السؤال ومصدره.</span>
          </li>
          <li>
            <b>نشر مسؤول</b>
            <span>كل تعديل مراجعة جديدة محفوظة.</span>
          </li>
        </ol>
      </div>
      <div className="content-card signin-card">
        <p className="content-kicker">بوابة فريق المحتوى</p>
        <h2>تسجيل الدخول</h2>
        {enabled ? (
          <>
            <p className="content-muted">
              استخدم حساب الفريق المخصّص لك. الصلاحيات يمنحها مسؤول المحتوى.
            </p>
            <form onSubmit={submit} className="content-form">
              <label htmlFor="email">
                البريد الإلكتروني
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  dir="ltr"
                  maxLength={254}
                  required
                  disabled={busy}
                />
              </label>
              <label htmlFor="password">
                كلمة المرور
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  dir="ltr"
                  maxLength={256}
                  required
                  disabled={busy}
                />
              </label>
              <p role="alert" className="content-error">
                {error}
              </p>
              <button className="content-primary" disabled={busy}>
                {busy ? 'جارٍ تسجيل الدخول…' : 'دخول إلى دار المعرفة'}
              </button>
            </form>
            <p className="content-footnote">
              تحتاج إلى حساب أو مساعدة؟ تواصل مع مسؤول فريقك.
            </p>
          </>
        ) : (
          <div className="content-empty">
            <h3>الدخول غير متاح حاليًا</h3>
            <p>بوابة الفريق لم تُفعّل بعد. يمكنك متابعة اللعب بصفة ضيف.</p>
            <Link href="/online" className="content-primary">
              العب بصفة ضيف
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
