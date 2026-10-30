'use client';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { contentErrors, detailSchema, listSchema, meSchema } from './contracts';
import type {
  Content,
  ContentCommand,
  ContentMe,
  Detail,
  Summary,
} from './contracts';

const statusLabels = {
  DRAFT: 'مسودة',
  APPROVED: 'مُراجَع',
  PUBLISHED: 'منشور',
  RETIRED: 'متوقف',
};
const roleLabels = { editor: 'محرّر', reviewer: 'مراجع', publisher: 'ناشر' };
const freshContent = (): Content => ({
  locale: 'ar',
  category: '',
  text: '',
  choices: ['a', 'b', 'c', 'd'].map((id) => ({
    id: id as 'a' | 'b' | 'c' | 'd',
    text: '',
  })),
  correctChoiceId: 'a',
  explanation: '',
  sources: [{ label: '', url: '' }],
});
class RequestError extends Error {
  constructor(
    readonly code: string,
    readonly uncertain = false,
  ) {
    super(contentErrors[code] ?? 'تعذّر إكمال الطلب. حاول مجددًا بعد قليل.');
  }
}
async function readApi(path: string, options?: RequestInit) {
  const response = await fetch(path, { ...options, cache: 'no-store' });
  if (response.status === 401) {
    window.location.replace('/signin');
    throw new RequestError('UNAUTHENTICATED');
  }
  const value: unknown = await response.json();
  if (!response.ok)
    throw new RequestError(
      typeof value === 'object' &&
        value !== null &&
        'error' in value &&
        typeof value.error === 'string'
        ? value.error
        : 'CONTENT_UNAVAILABLE',
      response.status >= 500,
    );
  return value;
}
export function ContentDesk({ initialMe }: { initialMe: ContentMe }) {
  const [me, setMe] = useState(initialMe),
    [items, setItems] = useState<Summary[]>([]),
    [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null),
    [editing, setEditing] = useState(false),
    [content, setContent] = useState<Content>(freshContent);
  const [note, setNote] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<{
    command: ContentCommand;
    key: string;
  } | null>(null);
  const generation = useRef(0),
    selection = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  const editor = me.roles.includes('editor'),
    reviewer = me.roles.includes('reviewer'),
    publisher = me.roles.includes('publisher');
  async function load(nextOffset = offset) {
    const current = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const fresh = meSchema.parse(await readApi('/api/content?view=me'));
      if (current !== generation.current) return;
      setMe(fresh);
      if (!fresh.roles.length) {
        setItems([]);
        setDetail(null);
        setEditing(false);
        setPending(null);
        return;
      }
      const data = listSchema.parse(
        await readApi(`/api/content?view=list&offset=${nextOffset}`),
      );
      if (current !== generation.current) return;
      setItems(data.items);
      setOffset(nextOffset);
    } catch (error) {
      if (current === generation.current) {
        setError(
          error instanceof RequestError
            ? error.message
            : 'تعذّر تحميل القائمة. حاول مجددًا.',
        );
        setDetail(null);
        setEditing(false);
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load(0);
    return () => {
      generation.current++;
      selection.current++;
    };
  }, []); // initial account is revalidated by the server
  async function select(item: Summary) {
    if (pending) return;
    const current = ++selection.current;
    setBusy(true);
    setError('');
    setNotice('');
    setEditing(false);
    setDetail(null);
    setNote('');
    try {
      const value = detailSchema.parse(
        await readApi(
          `/api/content?view=detail&id=${item.questionId}&revision=${item.revision}`,
        ),
      );
      if (current === selection.current) {
        setDetail(value);
        setTimeout(() => heading.current?.focus(), 0);
      }
    } catch (error) {
      setError(
        error instanceof RequestError ? error.message : 'تعذّر تحميل السؤال.',
      );
    } finally {
      if (current === selection.current) setBusy(false);
    }
  }
  async function send(command: ContentCommand, key = crypto.randomUUID()) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await readApi('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(command),
      });
      setPending(null);
      setEditing(false);
      setDetail(null);
      setNote('');
      setNotice('حُفظ الطلب بنجاح. يمكنك اختيار المراجعة من القائمة.');
      await load(0);
    } catch (error) {
      const uncertain = !(error instanceof RequestError) || error.uncertain;
      setPending(uncertain ? { command, key } : null);
      setError(
        uncertain
          ? 'تعذّر تأكيد الحفظ. أعد إرسال الطلب نفسه للتحقق دون إنشاء نسخة إضافية.'
          : error.message,
      );
      if (error instanceof RequestError && error.code === 'FORBIDDEN') {
        setDetail(null);
        setEditing(false);
        await load();
        setError(error.message);
      }
    } finally {
      setBusy(false);
    }
  }
  async function signout() {
    setBusy(true);
    try {
      const response = await fetch('/api/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error();
      window.location.replace('/signin');
    } catch {
      setError('تعذّر إنهاء الجلسة. حاول مجددًا.');
      setBusy(false);
    }
  }
  function startDraft() {
    selection.current++;
    setDetail(null);
    setContent(freshContent());
    setEditing(true);
    setNote('');
    setError('');
    setNotice('');
    setTimeout(() => heading.current?.focus(), 0);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(
      detail
        ? {
            type: 'REVISE',
            questionId: detail.questionId,
            expectedRevision: detail.revision,
            content,
          }
        : { type: 'CREATE_DRAFT', content },
    );
  }
  return (
    <section className="content-desk">
      <div className="content-title-row">
        <div>
          <p className="eyebrow">دار المعرفة</p>
          <h1>أسئلة تصنع الفارق.</h1>
          <p className="content-muted">
            اكتب بوضوح، وثّق المصدر، واترك المراجعة لعين أخرى.
          </p>
        </div>
        <div className="content-account">
          <div
            role="group"
            aria-label="صلاحيات الحساب"
            className="content-badges"
          >
            {me.roles.map((role) => (
              <span key={role}>{roleLabels[role]}</span>
            ))}
          </div>
          <button
            onClick={() => void signout()}
            disabled={busy}
            className="content-secondary"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
      <p role="status" className="content-success">
        {notice}
      </p>
      <p role="alert" className="content-error">
        {error}
      </p>
      {pending && (
        <div className="content-retry">
          <p>
            الطلب السابق لم يُحسم بعد. تبقى البيانات مقفلة حتى تأكيد نتيجته.
          </p>
          <button
            className="content-primary"
            onClick={() => void send(pending.command, pending.key)}
            disabled={busy}
          >
            إعادة إرسال الطلب نفسه
          </button>
        </div>
      )}
      {!me.roles.length ? (
        <div className="content-empty content-card">
          <h2>لا توجد صلاحيات محتوى لهذا الحساب</h2>
          <p>
            تواصل مع مسؤول الفريق لمنح صلاحية تحرير أو مراجعة أو نشر. اللعب بصفة
            ضيف متاح من رابط المملكة.
          </p>
          <button
            className="content-secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            التحقق من الصلاحيات
          </button>
        </div>
      ) : (
        <div className="content-workspace">
          <aside
            className="content-card content-library"
            aria-label="قائمة مراجعات الأسئلة"
          >
            <div className="content-list-toolbar">
              <h2>مراجعات الأسئلة</h2>
              <button
                className="content-secondary"
                onClick={() => {
                  if (!pending) {
                    selection.current++;
                    setDetail(null);
                    setEditing(false);
                    void load();
                  }
                }}
                disabled={loading || busy || Boolean(pending)}
              >
                تحديث
              </button>
            </div>
            {editor && (
              <button
                className="content-primary content-wide"
                onClick={startDraft}
                disabled={busy || Boolean(pending)}
              >
                سؤال جديد
              </button>
            )}
            <p className="content-muted">
              {loading
                ? 'جارٍ تحميل المراجعات…'
                : `${items.length} مراجعة في هذه الصفحة`}
            </p>
            <ul className="content-question-list">
              {items.map((item) => (
                <li key={`${item.questionId}-${item.revision}`}>
                  <button
                    onClick={() => void select(item)}
                    disabled={busy || Boolean(pending)}
                    aria-pressed={
                      detail?.questionId === item.questionId &&
                      detail.revision === item.revision
                    }
                  >
                    <span
                      className={`content-status status-${item.status.toLowerCase()}`}
                    >
                      {statusLabels[item.status]}
                    </span>
                    <strong>{item.category}</strong>
                    <span className="content-revision">
                      مراجعة {item.revision} ·{' '}
                      <bdi dir="ltr">{item.questionId.slice(0, 8)}</bdi>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {!loading && !items.length && (
              <p>لا توجد أسئلة في هذه الصفحة. ابدأ بمسودة موثّقة المصدر.</p>
            )}
            <div className="content-pagination">
              <button
                className="content-secondary"
                disabled={offset === 0 || loading || busy || Boolean(pending)}
                onClick={() => void load(Math.max(0, offset - 25))}
              >
                السابق
              </button>
              <button
                className="content-secondary"
                disabled={
                  items.length < 25 || loading || busy || Boolean(pending)
                }
                onClick={() => void load(offset + 25)}
              >
                التالي
              </button>
            </div>
          </aside>
          <section
            className="content-card content-detail"
            aria-label="مساحة السؤال"
          >
            {editing ? (
              <form className="content-form" onSubmit={submit}>
                <p className="content-kicker">
                  {detail ? 'مراجعة جديدة' : 'بداية سؤال'}
                </p>
                <h2 ref={heading} tabIndex={-1}>
                  {detail ? 'تعديل السؤال في مسودة جديدة' : 'صياغة سؤال جديد'}
                </h2>
                <p className="content-muted">
                  الحفظ يُنشئ مسودة تحتاج إلى مراجعة مستقلة. لن يغيّر مراجعة
                  منشورة.
                </p>
                <fieldset disabled={busy || Boolean(pending)}>
                  <label>
                    التصنيف
                    <input
                      required
                      maxLength={80}
                      value={content.category}
                      onChange={(e) =>
                        setContent({ ...content, category: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    نص السؤال
                    <textarea
                      required
                      maxLength={500}
                      rows={3}
                      value={content.text}
                      onChange={(e) =>
                        setContent({ ...content, text: e.target.value })
                      }
                    />
                  </label>
                  <div className="content-choice-fields">
                    {content.choices.map((choice, index) => (
                      <label key={choice.id}>
                        الخيار {index + 1}
                        <input
                          required
                          maxLength={200}
                          value={choice.text}
                          onChange={(e) =>
                            setContent({
                              ...content,
                              choices: content.choices.map((c) =>
                                c.id === choice.id
                                  ? { ...c, text: e.target.value }
                                  : c,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label>
                    الإجابة الصحيحة
                    <select
                      value={content.correctChoiceId}
                      onChange={(e) =>
                        setContent({
                          ...content,
                          correctChoiceId: e.target
                            .value as Content['correctChoiceId'],
                        })
                      }
                    >
                      {content.choices.map((choice, index) => (
                        <option key={choice.id} value={choice.id}>
                          الخيار {index + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    تفسير الإجابة
                    <textarea
                      required
                      maxLength={1000}
                      rows={3}
                      value={content.explanation}
                      onChange={(e) =>
                        setContent({ ...content, explanation: e.target.value })
                      }
                    />
                  </label>
                  {content.sources.map((source, index) => (
                    <div key={index} className="content-source-fields">
                      <label>
                        اسم المصدر {index + 1}
                        <input
                          required
                          maxLength={160}
                          value={source.label}
                          onChange={(e) =>
                            setContent({
                              ...content,
                              sources: content.sources.map((s, i) =>
                                i === index
                                  ? { ...s, label: e.target.value }
                                  : s,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        رابط المصدر {index + 1}
                        <input
                          required
                          type="url"
                          pattern="https://.*"
                          dir="ltr"
                          maxLength={2000}
                          value={source.url}
                          onChange={(e) =>
                            setContent({
                              ...content,
                              sources: content.sources.map((s, i) =>
                                i === index ? { ...s, url: e.target.value } : s,
                              ),
                            })
                          }
                        />
                      </label>
                      {index > 0 && (
                        <button
                          type="button"
                          className="content-secondary"
                          onClick={() =>
                            setContent({
                              ...content,
                              sources: content.sources.filter(
                                (_, i) => i !== index,
                              ),
                            })
                          }
                        >
                          حذف المصدر {index + 1}
                        </button>
                      )}
                    </div>
                  ))}
                  {content.sources.length < 5 && (
                    <button
                      type="button"
                      className="content-secondary"
                      onClick={() =>
                        setContent({
                          ...content,
                          sources: [...content.sources, { label: '', url: '' }],
                        })
                      }
                    >
                      إضافة مصدر
                    </button>
                  )}
                  <div className="content-actions">
                    <button className="content-primary">حفظ المسودة</button>
                    <button
                      type="button"
                      className="content-secondary"
                      onClick={() => setEditing(false)}
                    >
                      إلغاء التحرير
                    </button>
                  </div>
                </fieldset>
              </form>
            ) : detail ? (
              <>
                <div className="content-detail-heading">
                  <span
                    className={`content-status status-${detail.status.toLowerCase()}`}
                  >
                    {statusLabels[detail.status]}
                  </span>
                  <span className="content-muted">
                    مراجعة {detail.revision} · {detail.content.category}
                  </span>
                </div>
                <h2 ref={heading} tabIndex={-1}>
                  {detail.content.text}
                </h2>
                <ol className="content-answer-list">
                  {detail.content.choices.map((choice) => (
                    <li
                      key={choice.id}
                      data-correct={
                        choice.id === detail.content.correctChoiceId
                      }
                    >
                      <span>{choice.text}</span>
                      {choice.id === detail.content.correctChoiceId && (
                        <strong>الإجابة الصحيحة</strong>
                      )}
                    </li>
                  ))}
                </ol>
                <h3>التفسير</h3>
                <p>{detail.content.explanation}</p>
                <h3>المصادر</h3>
                <ul className="content-sources">
                  {detail.content.sources.map((source, index) => (
                    <li key={index}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {source.label}
                        <span aria-hidden="true"> ↗</span>
                      </a>
                    </li>
                  ))}
                </ul>
                {detail.reviewNote && (
                  <div className="content-review-note">
                    <h3>ملاحظة المراجعة</h3>
                    <p>{detail.reviewNote}</p>
                  </div>
                )}
                <p className="content-footnote">
                  حُفظت هذه المراجعة في{' '}
                  <bdi>
                    {new Intl.DateTimeFormat('ar-TN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(detail.createdAt))}
                  </bdi>
                  .
                </p>
                <div className="content-actions">
                  {editor && (
                    <button
                      className="content-secondary"
                      disabled={busy || Boolean(pending)}
                      onClick={() => {
                        setContent(structuredClone(detail.content));
                        setEditing(true);
                      }}
                    >
                      إنشاء مراجعة معدّلة
                    </button>
                  )}
                </div>
                {reviewer &&
                  detail.status === 'DRAFT' &&
                  (detail.author === me.actor ? (
                    <p className="content-muted">
                      لا يمكنك مراجعة مسودة ألّفتها. تحتاج إلى مراجع آخر.
                    </p>
                  ) : (
                    <div className="content-review-action">
                      <label htmlFor="review-note">
                        ملاحظة المراجعة
                        <textarea
                          id="review-note"
                          required
                          rows={3}
                          maxLength={1000}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          disabled={busy || Boolean(pending)}
                        />
                      </label>
                      <p className="content-footnote">
                        تحقق من الإجابة والصياغة والمصدر قبل اعتماد المراجعة.
                      </p>
                      <button
                        className="content-primary"
                        disabled={!note.trim() || busy || Boolean(pending)}
                        onClick={() =>
                          void send({
                            type: 'APPROVE',
                            questionId: detail.questionId,
                            revision: detail.revision,
                            note,
                          })
                        }
                      >
                        اعتماد المراجعة
                      </button>
                    </div>
                  ))}
                {publisher && detail.status === 'APPROVED' && (
                  <div className="content-review-action">
                    <p>
                      هذه المراجعة معتمدة. نشرها يستبدل أي مراجعة منشورة سابقة
                      للسؤال.
                    </p>
                    <button
                      className="content-primary"
                      disabled={busy || Boolean(pending)}
                      onClick={() =>
                        void send({
                          type: 'PUBLISH',
                          questionId: detail.questionId,
                          revision: detail.revision,
                        })
                      }
                    >
                      نشر السؤال
                    </button>
                  </div>
                )}
                {publisher && detail.status === 'PUBLISHED' && (
                  <div className="content-review-action">
                    <label htmlFor="retire-note">
                      سبب إيقاف النشر
                      <textarea
                        id="retire-note"
                        required
                        rows={2}
                        maxLength={1000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        disabled={busy || Boolean(pending)}
                      />
                    </label>
                    <button
                      className="content-secondary"
                      disabled={!note.trim() || busy || Boolean(pending)}
                      onClick={() =>
                        void send({
                          type: 'RETIRE',
                          questionId: detail.questionId,
                          revision: detail.revision,
                          note,
                        })
                      }
                    >
                      إيقاف نشر السؤال
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="content-empty">
                <svg viewBox="0 0 64 64" aria-hidden="true">
                  <path
                    d="M12 12h16l4 5 4-5h16v40H36l-4 4-4-4H12V12Zm20 5v39M19 24h7m-7 9h7m12-9h7m-7 9h7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
                <h2>{busy ? 'جارٍ فتح السؤال…' : 'اختر سؤالًا لتبدأ'}</h2>
                <p>اعرض مراجعته ومصادره، ثم نفّذ الإجراء المتاح لصلاحيتك.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
