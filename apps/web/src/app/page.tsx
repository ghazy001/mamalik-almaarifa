import { Button } from '../components/ui/button';
import { KingdomMark } from '../components/kingdom-mark';

const steps = [
  {
    number: '٠١',
    title: 'اختر طريقك',
    text: 'ابدأ من قلعتك، واختر أرضًا مجاورة لتوسيع مملكتك.',
  },
  {
    number: '٠٢',
    title: 'احتكم إلى المعرفة',
    text: 'أجب عن السؤال لضم أرض محايدة، أو واجه مالكها في مبارزة.',
  },
  {
    number: '٠٣',
    title: 'وحّد القلاع',
    text: 'اجمع القلاع الثلاث للفوز، أو احصد أعلى رصيد عند نهاية الأدوار.',
  },
];

export default function Home() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#main" aria-label="ممالك المعرفة، البداية">
          <KingdomMark />
          <span>
            ممالك المعرفة<small>كل إجابة تفتح أفقًا</small>
          </span>
        </a>
        <nav aria-label="التنقل الرئيسي">
          <a href="#rules">كيف تُبنى المملكة؟</a>
          <span className="version-label">
            <bdi dir="ltr">M1</bdi>
            <span>مرحلة التأسيس</span>
          </span>
        </nav>
      </header>
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="line" />
              استراتيجية عربية · تحدٍّ من ثلاثة لاعبين
            </p>
            <h1 id="hero-title">
              المعرفة
              <br />
              تصنع <span>الملوك.</span>
            </h1>
            <p className="hero-description">
              خلف كل قلعة قرار، وخلف كل انتصار إجابة.
              <br className="desktop-break" /> ابنِ مملكتك بالمعرفة، وارسم طريقك
              بحكمة.
            </p>
            <div className="hero-actions">
              <Button asChild>
                <a href="#rules">
                  اكتشف قواعد المملكة <span aria-hidden="true">←</span>
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href="#foundation">عن هذه النسخة</a>
              </Button>
            </div>
            <p className="availability">
              نسخة تأسيسية · اللعب التفاعلي قادم في مرحلة لاحقة
            </p>
          </div>
          <div className="heraldry" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <span className="ornament ornament-top">✦</span>
            <div className="central-seal">
              <KingdomMark />
              <span>ممالك المعرفة</span>
              <small>العقلُ أقوى الحصون</small>
            </div>
            <div className="faction faction-teal">
              <span className="faction-gem" />
              <span>
                فيروز<small>حكمةٌ تُضيء الطريق</small>
              </span>
            </div>
            <div className="faction faction-blue">
              <span className="faction-gem" />
              <span>
                ياقوت<small>عزمٌ يصنع الأثر</small>
              </span>
            </div>
            <div className="faction faction-gold">
              <span className="faction-gem" />
              <span>
                كهرمان<small>فكرٌ يسبق الخطى</small>
              </span>
            </div>
            <span className="seal-caption">ثلاث قلاع. مملكة واحدة.</span>
          </div>
        </section>
        <section className="facts" aria-label="ملامح اللعبة">
          <div>
            <strong>٣</strong>
            <span>لاعبين في كل مواجهة</span>
          </div>
          <div>
            <strong>١٥</strong>
            <span>أرضًا ترسم حدود المملكة</span>
          </div>
          <div>
            <strong>١</strong>
            <span>طريق إلى المجد: المعرفة</span>
          </div>
        </section>
        <section
          id="rules"
          className="rules-section"
          aria-labelledby="rules-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">رحلتك إلى العرش</p>
              <h2 id="rules-title">قرارٌ ذكي. إجابةٌ حاسمة.</h2>
            </div>
            <p>
              قواعد واضحة، ومساحة للتكتيك.
              <br />
              المعرفة تحسم المواجهة.
            </p>
          </div>
          <ol className="steps">
            {steps.map((step) => (
              <li key={step.number}>
                <span className="step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
        <section
          id="foundation"
          className="foundation"
          aria-labelledby="foundation-title"
        >
          <div>
            <p className="eyebrow">نبني الأساس أولًا</p>
            <h2 id="foundation-title">مملكة جميلة، بقواعد راسخة.</h2>
            <p>
              هذه واجهة مرحلة التأسيس. تشمل قواعد حتمية قابلة للاختبار، ومحاكاة
              تقنية كاملة، وخدمة خادم مستقلة. لم تُفتح الغرف أو المباريات عبر
              الإنترنت بعد.
            </p>
          </div>
          <span className="foundation-tag">
            <span className="status-dot" />
            تطوير محلي · <bdi dir="ltr">M1</bdi>
          </span>
        </section>
      </main>
      <footer>
        <a href="#main" className="footer-brand">
          ممالك المعرفة
        </a>
        <p>عالم أصلي. منافسة عادلة. معرفة تجمعنا.</p>
        <span>صُنع ليُقرأ من اليمين</span>
      </footer>
    </div>
  );
}
