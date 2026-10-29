'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import { Button } from '../../components/ui/button';
import { MapBoard, TerritoryControls } from '../map/map-board';
import { projectMap, PLAYER_COLORS } from '../map/project';
import type { MapIntent } from '../map/model';
import { BattleDialog, Countdown } from '../match/battle-dialog';
import { createOnlineSession } from './online-session';

const numbers = new Intl.NumberFormat('ar', { numberingSystem: 'arab' });
export function OnlineMatch({ endpoint }: { endpoint: string }) {
  const [session] = useState(() => createOnlineSession(endpoint));
  const view = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<{
    matchId: string;
    turn: number;
    targetId: string;
  } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  useEffect(() => {
    session.activate();
    setCode(new URLSearchParams(window.location.search).get('room') ?? '');
    const restore = window.setTimeout(() => session.restoreIfSaved(), 0);
    const timer = window.setInterval(() => session.tick(), 100);
    const visible = () => {
      if (document.visibilityState === 'visible') {
        session.tick();
        session.refresh();
      }
    };
    const wake = () => session.refresh();
    document.addEventListener('visibilitychange', visible);
    document.addEventListener('resume', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('online', wake);
    return () => {
      window.clearTimeout(restore);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      document.removeEventListener('resume', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener('online', wake);
      session.suspend();
    };
  }, [session]);
  const onIntent = useCallback(
    (intent: MapIntent) => {
      const snapshot = session.getSnapshot().snapshot;
      if (intent.type === 'CLEAR_SELECTION') {
        setPending(null);
        setHoveredId(null);
      } else if (intent.type === 'HOVER_TARGET') setHoveredId(intent.targetId);
      else if (
        snapshot?.state &&
        snapshot.legalTargetIds.includes(intent.targetId)
      )
        setPending({
          matchId: snapshot.state.matchId,
          turn: snapshot.state.turn,
          targetId: intent.targetId,
        });
    },
    [session],
  );
  const snapshot = view.snapshot;
  const state = snapshot?.state;
  const model = useMemo(
    () =>
      state && snapshot ? projectMap(state, snapshot.legalTargetIds) : null,
    [state, snapshot],
  );
  const question = state?.question ?? snapshot?.reveal?.question;
  const humanId = snapshot?.playerId ?? '';
  const involved =
    !!question && [question.attackerId, question.defenderId].includes(humanId);
  const deadline = state?.question?.deadline ?? state?.selectionDeadline ?? 0;
  const remainingMs = Math.max(0, deadline - view.estimatedNow);
  const windowMs =
    state?.phase === 'DUEL'
      ? snapshot!.rules.answerMs
      : (snapshot?.rules.selectionMs ?? 10000);
  const ownChoiceId = snapshot?.ownChoiceId ?? view.pendingAnswer;
  const selectedId =
    state?.question?.targetId ??
    state?.outcome?.target ??
    (pending?.matchId === state?.matchId &&
    pending?.turn === state?.turn &&
    snapshot?.legalTargetIds.includes(pending?.targetId ?? '')
      ? pending!.targetId
      : null);
  const selection = useMemo(
    () => ({ selectedId, hoveredId }),
    [selectedId, hoveredId],
  );
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state?.phase === 'FINISHED') resultHeading.current?.focus();
  }, [state?.phase]);
  const connected = view.status === 'connected';
  const busy =
    view.status === 'connecting' ||
    view.status === 'reconnecting' ||
    (connected && !snapshot);
  return (
    <div
      className="online-match"
      data-status={view.status}
      data-player-id={humanId}
      data-phase={state?.phase ?? 'WAITING'}
      data-turn={state?.turn ?? 0}
      data-match-id={state?.matchId ?? ''}
      data-active-player-id={state?.activePlayerId ?? ''}
      data-room-mode={snapshot?.mode ?? ''}
      data-sequence={snapshot?.sequence ?? 0}
      data-question-deadline={state?.question?.deadline ?? ''}
    >
      <p className="online-connection" role="status">
        {connected
          ? 'متصل بخادم اللعبة'
          : busy
            ? 'جارٍ الاتصال واستعادة الحالة…'
            : 'بحث عن لاعبين أو دعوة أصدقاء · ثلاثة ضيوف حقيقيين'}
        {connected && view.rttMs !== null
          ? ` · زمن الذهاب والإياب ${numbers.format(view.rttMs)} مللي ثانية`
          : ''}
      </p>
      {view.error && (
        <p className="match-notice" role="alert">
          {view.error}
        </p>
      )}
      {snapshot && (view.status === 'closed' || view.status === 'error') && (
        <div className="online-entry-actions">
          <Button onClick={() => void session.connect('restore')}>
            استعادة الاتصال
          </Button>
          <Button variant="outline" onClick={() => void session.leave()}>
            العودة إلى الغرف
          </Button>
        </div>
      )}
      {!snapshot && (
        <section className="online-entry" aria-labelledby="online-entry-title">
          <h2 id="online-entry-title">اجمع مملكتين إلى مملكتك.</h2>
          <p>
            ابحث عن لاعبين على خدمة اللعبة نفسها، أو ادعُ صديقين إلى غرفة خاصة.
            تبدأ المباراة بثلاثة لاعبين حقيقيين بعد استعداد الجميع.
          </p>
          <label htmlFor="guest-name">اسمك في المباراة</label>
          <input
            id="guest-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            autoComplete="nickname"
            disabled={busy}
          />
          <div className="online-entry-actions">
            <Button
              disabled={busy || !name.trim()}
              onClick={() => void session.connect('queue', name)}
            >
              ابحث عن لاعبين
            </Button>
            <Button
              variant="outline"
              disabled={busy || !name.trim()}
              onClick={() => void session.connect('create', name)}
            >
              أنشئ غرفة خاصة
            </Button>
          </div>
          {(view.status === 'connecting' || (connected && !snapshot)) && (
            <Button variant="outline" onClick={() => void session.leave()}>
              {view.searching ? 'إلغاء البحث' : 'إلغاء الاتصال'}
            </Button>
          )}
          <label htmlFor="invite-code">رمز الدعوة</label>
          <input
            id="invite-code"
            dir="ltr"
            value={code}
            onChange={(event) => setCode(event.target.value.toLowerCase())}
            maxLength={16}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy}
          />
          <div className="online-entry-actions">
            <Button
              variant="outline"
              disabled={busy || !name.trim() || !/^[a-f0-9]{16}$/.test(code)}
              onClick={() => void session.connect('join', name, code)}
            >
              انضم إلى الغرفة
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void session.connect('restore')}
            >
              استعادة مقعد سابق
            </Button>
          </div>
          <p className="map-help">
            مقاعد ضيوف دون حسابات. يحتفظ هذا التبويب برمز استعادة مؤقت؛ لا
            تشاركه. لا تُحفظ النتائج بعد إغلاق الخادم.
          </p>
        </section>
      )}
      {snapshot && (
        <>
          <section
            className="online-room-bar"
            aria-label={
              snapshot.mode === 'private' ? 'دعوة الغرفة' : 'البحث عن لاعبين'
            }
          >
            {snapshot.mode === 'private' ? (
              <>
                <label htmlFor="room-code">رمز الغرفة</label>
                <input
                  id="room-code"
                  dir="ltr"
                  readOnly
                  value={snapshot.roomId}
                  onFocus={(event) => event.target.select()}
                />
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${location.origin}/online?room=${snapshot.roomId}`,
                      );
                      setCopied(true);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied ? 'نُسخ رابط الدعوة' : 'انسخ رابط الدعوة'}
                </Button>
              </>
            ) : (
              <p className="online-queue-status" role="status">
                {!state
                  ? `جارٍ البحث · ${numbers.format(snapshot.seats.length)} من ٣ ممالك`
                  : state.phase === 'LOBBY'
                    ? 'اكتملت المقاعد · أعلن استعدادك'
                    : 'مباراة جمعتك بلاعبين من قائمة الانتظار'}
              </p>
            )}
            <Button variant="outline" onClick={() => void session.leave()}>
              {!state && snapshot.mode === 'matchmaking'
                ? 'إلغاء البحث'
                : 'مغادرة الغرفة والاستسلام'}
            </Button>
          </section>
          <div className="match-standings">
            {snapshot.seats.map((seat) => {
              const player = state?.players.find((p) => p.id === seat.playerId);
              const row = snapshot.standings.find(
                (p) => p.playerId === seat.playerId,
              );
              return (
                <div
                  key={seat.playerId}
                  className="match-faction"
                  data-eliminated={player?.eliminated ?? false}
                >
                  <span
                    className="match-faction-name"
                    style={{ color: PLAYER_COLORS[seat.playerId] }}
                  >
                    {seat.name}
                    <small>
                      {seat.playerId === humanId ? 'أنت' : 'لاعب ضيف'} ·{' '}
                      {seat.connected ? 'متصل' : 'انقطع الاتصال'}
                    </small>
                  </span>
                  <strong>
                    {numbers.format(row?.score ?? 3)}
                    <small>نقطة</small>
                  </strong>
                  <span>
                    {player?.eliminated
                      ? 'خارج المنافسة'
                      : player?.ready
                        ? 'جاهز'
                        : 'ينتظر الاستعداد'}
                  </span>
                </div>
              );
            })}
          </div>
          {(!state || state.phase === 'LOBBY') && (
            <section className="online-entry" aria-labelledby="lobby-title">
              <h2 id="lobby-title">بانتظار الممالك الثلاث.</h2>
              <p>
                بعد اكتمال المقاعد، يعلن كل لاعب استعداده. تبدأ المباراة
                تلقائيًا عندما يستعد الجميع. الخادم يحدد ترتيب الأدوار والأسئلة.
              </p>
              {snapshot.readyDeadline !== null && (
                <p>
                  تنتهي مهلة الاستعداد خلال{' '}
                  {numbers.format(
                    Math.ceil(
                      Math.max(0, snapshot.readyDeadline - view.estimatedNow) /
                        1000,
                    ),
                  )}{' '}
                  ثانية. تُلغى هذه المباراة إن لم يستعد الجميع؛ يمكنك البحث
                  مجددًا.
                </p>
              )}
              <Button
                disabled={
                  !state ||
                  !connected ||
                  state.players.find((p) => p.id === humanId)?.ready
                }
                onClick={() => session.send('READY')}
              >
                أنا جاهز
              </Button>
            </section>
          )}
          {state?.phase === 'FINISHED' && state.result && (
            <section
              className="match-results"
              aria-labelledby="online-results-title"
            >
              <h2 id="online-results-title" ref={resultHeading} tabIndex={-1}>
                انتهت المباراة
              </h2>
              <p className="match-winner">
                {state.result.reason === 'ABORTED'
                  ? 'أُلغيت المباراة دون فائز.'
                  : `الصدارة: ${state.result.winners.map((id) => state.players.find((p) => p.id === id)?.name).join(' و')}`}
              </p>
              <p>
                {state.result.reason === 'CASTLES'
                  ? 'حُسمت المملكة بجمع القلاع الثلاث.'
                  : state.result.reason === 'LAST_PLAYER'
                    ? 'بقيت مملكة واحدة بعد خروج المنافسين.'
                    : state.result.reason === 'TURN_LIMIT'
                      ? 'اكتملت الأدوار؛ حُسم الترتيب بالنقاط والقلاع والأراضي.'
                      : 'توقفت المباراة قبل اكتمالها.'}
              </p>
              <ol className="match-placements">
                {state.result.placements.map((row) => (
                  <li key={row.playerId}>
                    <strong>
                      المركز {numbers.format(row.rank)} ·{' '}
                      {state.players.find((p) => p.id === row.playerId)?.name}
                    </strong>
                    <span>
                      {numbers.format(row.score)} نقطة ·{' '}
                      {numbers.format(row.territories)} أرض ·{' '}
                      {numbers.format(row.castles)} قلعة
                    </span>
                  </li>
                ))}
              </ol>
              <p>نتيجة حُسمت على الخادم؛ غير محفوظة في سجل دائم.</p>
              <Button onClick={() => void session.leave()}>
                العودة إلى الغرف
              </Button>
            </section>
          )}
          {state && model && (
            <div className="map-workspace match-workspace">
              <MapBoard
                model={model}
                selection={selection}
                onIntent={onIntent}
                caption={`${snapshot.mode === 'private' ? 'غرفة خاصة' : 'بحث عن لاعبين'} · ثلاثة لاعبين حقيقيين`}
                milestone="M3"
                effect={
                  state.outcome
                    ? {
                        key: `${state.matchId}:${state.turn}`,
                        targetId: state.outcome.target,
                        captured: state.outcome.captured,
                        ownerId:
                          state.territories.find(
                            (t) => t.id === state.outcome!.target,
                          )?.ownerId ?? null,
                      }
                    : null
                }
              />
              <aside
                className="map-command-panel match-control"
                aria-labelledby="online-turn-title"
              >
                <p className="eyebrow">
                  الدور {numbers.format(state.turn)} من{' '}
                  {numbers.format(snapshot.rules.maxTurns)}
                </p>
                <h2 id="online-turn-title">
                  {state.phase === 'ATTACK_SELECTION'
                    ? state.activePlayerId === humanId
                      ? 'اختر خطوتك.'
                      : `دور ${state.players.find((p) => p.id === state.activePlayerId)?.name}`
                    : state.phase === 'DUEL'
                      ? involved
                        ? 'المعرفة تحسمها.'
                        : 'راقب المواجهة.'
                      : state.phase === 'RESOLUTION'
                        ? 'حُسمت المواجهة.'
                        : 'ممالك المعرفة'}
                </h2>
                {state.phase === 'ATTACK_SELECTION' && (
                  <>
                    <Countdown remainingMs={remainingMs} windowMs={windowMs} />
                    <p className="map-help">
                      {state.activePlayerId === humanId
                        ? 'اختر أرضًا متاحة ثم ابدأ التحدّي. لديك عشر ثوانٍ.'
                        : 'انتظر اختيار المملكة صاحبة الدور.'}
                    </p>
                    <p className="map-help" role="status">
                      {model.territories.find((t) => t.id === selectedId)
                        ?.name ?? 'لم يُحدّد هدف بعد.'}
                    </p>
                    {state.activePlayerId === humanId && (
                      <Button
                        className="match-primary-action"
                        disabled={
                          !connected ||
                          !selectedId ||
                          !snapshot.legalTargetIds.includes(selectedId)
                        }
                        onClick={() =>
                          selectedId &&
                          session.send('SELECT_TARGET', {
                            targetId: selectedId,
                          })
                        }
                      >
                        ابدأ التحدّي
                      </Button>
                    )}
                  </>
                )}
                {(state.phase === 'DUEL' || state.phase === 'RESOLUTION') &&
                  question && (
                    <BattleDialog
                      view={{
                        state,
                        map: model,
                        humanId,
                        humanChoiceId: ownChoiceId,
                        humanInvolved: involved,
                        canAnswer:
                          connected &&
                          state.phase === 'DUEL' &&
                          involved &&
                          !ownChoiceId &&
                          remainingMs > 0,
                        remainingMs,
                        windowMs,
                        reveal:
                          snapshot.reveal && state.outcome
                            ? {
                                ...snapshot.reveal,
                                turn: state.turn,
                                outcome: state.outcome,
                                humanChoiceId: ownChoiceId,
                                humanInvolved: involved,
                              }
                            : null,
                      }}
                      answerPending={view.pendingAnswer !== null}
                      connectionNotice={
                        connected
                          ? ''
                          : view.error ||
                            'نستعيد حالة المباراة من الخادم؛ الوقت مستمر والإجابات متوقفة مؤقتًا.'
                      }
                      {...(view.status === 'closed' || view.status === 'error'
                        ? { onRestore: () => void session.connect('restore') }
                        : {})}
                      onAnswer={(choiceId, questionId) =>
                        session.send('SUBMIT_ANSWER', { choiceId, questionId })
                      }
                    />
                  )}
                <p className="match-offline-note">
                  العدّاد تقديري؛ وصول الإجابة إلى الخادم هو المعتمد. الوقت
                  مستمر عند انقطاع الشبكة، ومهلة الاستعادة ثلاثون ثانية. الخروج
                  الصريح استسلام.
                </p>
              </aside>
              <TerritoryControls
                model={connected ? model : { ...model, legalTargetIds: [] }}
                selection={selection}
                onIntent={onIntent}
              />
            </div>
          )}
        </>
      )}
      <p className="map-help">
        تجربة تطوير بمحتوى أسئلة تجريبي.{' '}
        <Link href="/play" prefetch={false}>
          اللعب المحلي ضد خصمين مبرمجين
        </Link>
      </p>
    </div>
  );
}
