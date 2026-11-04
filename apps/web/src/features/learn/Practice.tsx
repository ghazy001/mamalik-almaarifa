'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import { DEFAULT_RULES } from '@mamalik/game-core';
import { Button } from '../../components/ui/button';
import { MapBoard, TerritoryControls } from '../map/map-board';
import type { MapIntent } from '../map/model';
import { BattleDialog } from '../match/battle-dialog';
import { createPracticeSession } from './practice-session';

const numbers = new Intl.NumberFormat('ar', { numberingSystem: 'arab' });
const steps = ['اختر أرضًا', 'أجب عن سؤال', 'اعرف طريق الفوز'];

export function Practice() {
  const [session] = useState(createPracticeSession);
  const view = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const epoch = useRef<number | null>(null);
  const now = useCallback(() => {
    epoch.current ??= performance.now();
    return performance.now() - epoch.current;
  }, []);
  useEffect(() => {
    const tick = () => session.tick(now());
    const interval = window.setInterval(tick, 100);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [session, now]);
  const [pending, setPending] = useState<{
    matchId: string;
    targetId: string;
  } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const onIntent = useCallback(
    (intent: MapIntent) => {
      const current = session.getSnapshot();
      if (intent.type === 'CLEAR_SELECTION') setPending(null);
      else if (intent.type === 'HOVER_TARGET') setHoveredId(intent.targetId);
      else if (current.map.legalTargetIds.includes(intent.targetId))
        setPending({
          matchId: current.state.matchId,
          targetId: intent.targetId,
        });
    },
    [session],
  );
  const phase = view.state.phase;
  const step = phase === 'FINISHED' ? 2 : phase === 'ATTACK_SELECTION' ? 0 : 1;
  const selectedId =
    phase === 'ATTACK_SELECTION'
      ? pending?.matchId === view.state.matchId
        ? pending.targetId
        : null
      : (view.state.question?.targetId ?? view.reveal?.outcome.target ?? null);
  const selected = view.map.territories.find((row) => row.id === selectedId);
  const selection = { selectedId, hoveredId };
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (phase === 'FINISHED') heading.current?.focus();
  }, [phase]);

  return (
    <div
      className="learn-practice"
      data-phase={phase}
      data-match-id={view.state.matchId}
    >
      <ol className="learn-progress" aria-label="مراحل التدريب">
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? 'step' : undefined}
            data-complete={index < step}
          >
            <span>{numbers.format(index + 1)}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="learn-workspace">
        <section className="learn-panel" aria-labelledby="practice-heading">
          <p className="eyebrow">
            {phase === 'FINISHED'
              ? 'من التدريب إلى المملكة'
              : `الخطوة ${numbers.format(step + 1)} من ٣`}
          </p>
          <h2 id="practice-heading" ref={heading} tabIndex={-1}>
            {phase === 'FINISHED'
              ? 'أصبحت تعرف خطوتك الأولى.'
              : phase === 'ATTACK_SELECTION'
                ? 'وسّع حدود فيروز.'
                : phase === 'DUEL'
                  ? 'المعرفة تفتح الطريق.'
                  : 'كل مواجهة تعلّمك.'}
          </h2>
          {phase === 'ATTACK_SELECTION' ? (
            <>
              <p>
                أنت تقود مملكة فيروز. اختر إحدى الأرضين المحايدتين المجاورتين
                لقلعتك؛ الإطار الذهبي يبيّن الأهداف المتاحة.
              </p>
              <p className="learn-hint">
                خذ وقتك هنا. في المباراة الكاملة لديك{' '}
                {numbers.format(DEFAULT_RULES.selectionMs / 1000)} ثوانٍ لاختيار
                الهدف.
              </p>
              <TerritoryControls
                model={view.map}
                selection={selection}
                onIntent={onIntent}
              />
              <p className="learn-selection" role="status">
                {selected
                  ? `هدفك: ${selected.name}`
                  : 'اختر من الخريطة أو من الزرّين أعلاه.'}
              </p>
              <Button
                className="learn-action"
                disabled={!selected}
                onClick={() => {
                  if (selected)
                    session.select(
                      { matchId: view.state.matchId, targetId: selected.id },
                      now(),
                    );
                }}
              >
                ابدأ السؤال التدريبي
              </Button>
            </>
          ) : phase === 'FINISHED' ? (
            <>
              <p>
                هذه كانت تجربة أرض واحدة. المباراة الكاملة تجمع ثلاث ممالك على
                خمس عشرة أرضًا.
              </p>
              <dl className="learn-rules">
                <div>
                  <dt>اجمع القلاع الثلاث</dt>
                  <dd>
                    أو تصدّر الترتيب بعد{' '}
                    {numbers.format(DEFAULT_RULES.maxTurns)} دورًا. القلعة ٣
                    نقاط والأرض العادية نقطة.
                  </dd>
                </div>
                <div>
                  <dt>احمِ قلعة بدايتك</dt>
                  <dd>سقوطها يخرجك من المنافسة وينقل أراضيك إلى المهاجم.</dd>
                </div>
              </dl>
              <details className="learn-details">
                <summary>المبارزة والتعادل</summary>
                <p>
                  عند مهاجمة أرض مملوكة يجيب المهاجم والمدافع. الصحيح يتقدم على
                  الخاطئ؛ وإذا صحّت الإجابتان يفوز الأسرع وفق وقت الاستلام. عند
                  تساوي الوقت يحتفظ المدافع بالأرض، وكذلك إذا أخطأ الطرفان.
                </p>
                <p>
                  عند نهاية الأدوار يُقارن الرصيد ثم عدد القلاع ثم الأراضي، مع
                  خروج اللاعبين المستبعدين من الصدارة. التعادل التام يعني صدارة
                  مشتركة.
                </p>
              </details>
              <Button className="learn-action" asChild>
                <Link href="/play" prefetch={false}>
                  العب مباراة محلية كاملة
                </Link>
              </Button>
              <Link className="learn-text-link" href="/online" prefetch={false}>
                العب مع لاعبين حقيقيين
              </Link>
              <Button
                className="learn-restart"
                variant="outline"
                onClick={() => {
                  session.restart(now());
                  setPending(null);
                  setHoveredId(null);
                }}
              >
                أعد التدريب
              </Button>
            </>
          ) : (
            <>
              <p>
                {phase === 'DUEL'
                  ? `اختر إجابة واحدة خلال ${numbers.format(DEFAULT_RULES.answerMs / 1000)} ثانية. الإجابة الصحيحة تضم الأرض إلى مملكتك.`
                  : view.reveal?.outcome.captured
                    ? 'أجبت إجابة صحيحة، فانتقلت الأرض إلى فيروز. راجع التفسير ثم تابع.'
                    : 'بقيت الأرض محايدة. راجع الإجابة الصحيحة؛ يمكنك إعادة التدريب بعد هذه الخطوة.'}
              </p>
              <p className="learn-hint">
                يمكنك تصغير بطاقة السؤال وإعادة فتحها. وقت الإجابة يستمر أثناء
                التصغير.
              </p>
            </>
          )}
          <p className="learn-note">
            تدريب محلي بأسئلة تجريبية معلنة. لا تُحفظ نتائج أو نقاط حساب، ولا
            يتطلب اتصالًا بخادم اللعب.
          </p>
        </section>
        <MapBoard
          model={view.map}
          selection={selection}
          onIntent={onIntent}
          effect={view.effect}
          caption="تدريب محلي · أرض واحدة"
          milestone="M5"
        />
      </div>
      {(phase === 'DUEL' || phase === 'RESOLUTION') && (
        <BattleDialog
          view={view}
          onAnswer={(choiceId, questionId) =>
            session.answer(
              { matchId: view.state.matchId, questionId, choiceId },
              now(),
            )
          }
          onContinue={() => session.finish(now())}
          continueLabel="تابع إلى طريقة الفوز"
        />
      )}
    </div>
  );
}
