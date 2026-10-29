'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { GEOGRAPHY } from '../map/geography';
import type { LocalView } from './local-session';
const numbers = new Intl.NumberFormat('ar', { numberingSystem: 'arab' });

export function Countdown({
  remainingMs,
  windowMs,
}: {
  remainingMs: number;
  windowMs: number;
}) {
  const seconds = Math.ceil(remainingMs / 1000);
  return (
    <div className="match-countdown">
      <div>
        <span>الوقت المتبقي</span>
        <strong role="timer" aria-live="off">
          {numbers.format(seconds)} ث
        </strong>
      </div>
      <div
        className="match-time-track"
        role="progressbar"
        aria-label="وقت الإجابة أو الاختيار"
        aria-valuemin={0}
        aria-valuemax={Math.ceil(windowMs / 1000)}
        aria-valuenow={seconds}
      >
        <span
          style={{ width: `${Math.min(100, (remainingMs / windowMs) * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function BattleDialog({
  view,
  onAnswer,
  onContinue,
}: {
  view: LocalView;
  onAnswer: (choiceId: string, questionId: string) => void;
  onContinue: () => void;
}) {
  const resolved = view.state.phase === 'RESOLUTION';
  const question = resolved ? view.reveal?.question : view.state.question;
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const key = `${view.state.matchId}:${view.state.turn}:${view.state.phase}`;
  const [closedKey, setClosedKey] = useState<string | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (closedKey === key) element.close();
    else {
      if (!element.open) element.showModal();
      heading.current?.focus();
    }
  }, [key, closedKey]);
  if (!question) return null;
  const attacker = view.map.players.find(
    (player) => player.id === question.attackerId,
  )!;
  const defender = view.map.players.find(
    (player) => player.id === question.defenderId,
  );
  const ownChoice = resolved ? view.reveal?.humanChoiceId : view.humanChoiceId;
  const correct = resolved ? view.reveal?.outcome.correctChoiceId : null;
  const outcome = view.reveal?.outcome;
  const winner = view.map.players.find(
    (player) => player.id === outcome?.winner,
  );
  const outcomeText = outcome?.captured
    ? `ضمّت مملكة ${winner?.name ?? ''} الأرض.`
    : question.defenderId
      ? 'نجح الدفاع وبقيت الأرض لدى مالكها.'
      : 'لم تُضم الأرض وبقيت محايدة.';
  return (
    <>
      {closedKey === key && (
        <Button className="reopen-battle" onClick={() => setClosedKey(null)}>
          إعادة فتح المواجهة
        </Button>
      )}
      <dialog
        ref={dialog}
        className="battle-dialog"
        aria-labelledby="battle-heading"
        aria-describedby="battle-context"
        onCancel={(event) => {
          event.preventDefault();
          setClosedKey(key);
        }}
        data-question-id={question.id}
        data-resolved={resolved}
      >
        <div className="battle-topline">
          <span className="eyebrow">
            {resolved
              ? 'نتيجة المواجهة'
              : defender
                ? 'مبارزة المعرفة'
                : 'تحدّي أرض محايدة'}
          </span>
          <button
            className="battle-minimize"
            type="button"
            onClick={() => setClosedKey(key)}
          >
            تصغير المواجهة
          </button>
        </div>
        <p id="battle-context" className="battle-context">
          {GEOGRAPHY[question.targetId]?.name} · {attacker.name}
          {defender ? ` في مواجهة ${defender.name}` : ' تتجه إلى أرض محايدة'}
        </p>
        {!resolved && (
          <Countdown remainingMs={view.remainingMs} windowMs={view.windowMs} />
        )}
        <h2 id="battle-heading" ref={heading} tabIndex={-1}>
          {resolved ? outcomeText : question.text}
        </h2>
        {resolved && (
          <p className="battle-original-question">{question.text}</p>
        )}
        <p className="battle-guidance" role="status">
          {resolved
            ? ownChoice
              ? ownChoice === correct
                ? outcome?.winner !== view.humanId
                  ? 'إجابتك صحيحة؛ حُسمت المواجهة وفق قاعدة السرعة والتعادل.'
                  : 'إجابتك صحيحة.'
                : 'إجابتك غير صحيحة.'
              : view.reveal?.humanInvolved
                ? 'انتهت المهلة دون إجابة منك.'
                : 'حُسمت مواجهة الخصمين المبرمجين.'
            : view.humanInvolved
              ? view.humanChoiceId
                ? 'تم تسجيل إجابتك. ننتظر حسم المواجهة.'
                : question.defenderId === view.humanId
                  ? 'أنت تدافع عن هذه الأرض. اختر إجابة واحدة.'
                  : 'اختر إجابة واحدة قبل انتهاء المهلة.'
              : 'أنت تراقب مواجهة الخصمين المبرمجين.'}
        </p>
        <div className="battle-choices">
          {question.choices.map((choice, index) => {
            const label = (
              <span className="battle-choice-label">
                <span className="battle-choice-marker" aria-hidden="true">
                  {numbers.format(index + 1)}
                </span>
                <span className="sr-only">
                  الخيار {numbers.format(index + 1)}:{' '}
                </span>
                <bdi dir="auto">{choice.text}</bdi>
              </span>
            );
            return resolved ? (
              <div
                key={choice.id}
                className="battle-choice"
                data-correct={choice.id === correct}
                data-chosen={choice.id === ownChoice}
              >
                <span>{label}</span>
                <small>
                  {choice.id === correct
                    ? 'الإجابة الصحيحة'
                    : choice.id === ownChoice
                      ? 'اختيارك'
                      : ''}
                </small>
              </div>
            ) : (
              <button
                key={choice.id}
                type="button"
                className="battle-choice"
                data-choice-id={choice.id}
                aria-pressed={choice.id === ownChoice}
                disabled={!view.canAnswer}
                onClick={() => onAnswer(choice.id, question.id)}
              >
                <span>{label}</span>
                <small>{choice.id === ownChoice ? 'تم اختيارها' : ''}</small>
              </button>
            );
          })}
        </div>
        {resolved && view.reveal && (
          <div className="battle-explanation">
            <p>{view.reveal.explanation}</p>
            {view.reveal.source ? (
              <a href={view.reveal.source.url} target="_blank" rel="noreferrer">
                المصدر: {view.reveal.source.label}
              </a>
            ) : (
              <span>سؤال حسابي مؤلّف للتجربة.</span>
            )}
          </div>
        )}
        {resolved && (
          <Button className="battle-continue" onClick={onContinue}>
            متابعة الدور التالي
          </Button>
        )}
        {!resolved && (
          <p className="battle-local-note">
            الإجابة الصحيحة تتقدّم على الخاطئة. إذا صحّت الإجابتان يفوز الأسرع،
            وعند تساوي الوقت يبقى المدافع.
          </p>
        )}
        {!resolved && (
          <p className="battle-local-note">
            لعب محلي · لا تظهر صحة الإجابات قبل الحسم.
          </p>
        )}
      </dialog>
    </>
  );
}
