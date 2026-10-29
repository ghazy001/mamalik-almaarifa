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
import type { MapIntent, MapSelection } from '../map/model';
import { createLocalSession, HUMAN_ID } from './local-session';
import { BattleDialog, Countdown } from './battle-dialog';

const numbers = new Intl.NumberFormat('ar', { numberingSystem: 'arab' });
export function LocalMatch() {
  const [session] = useState(() => createLocalSession());
  const view = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const epoch = useRef<number | null>(null);
  const now = useCallback(() => {
    if (epoch.current === null) epoch.current = performance.now();
    return performance.now() - epoch.current;
  }, []);
  useEffect(() => {
    const tick = () => session.tick(now());
    tick();
    const timer = window.setInterval(tick, 100);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [session, now]);
  const [pending, setPending] = useState<{
    matchId: string;
    turn: number;
    targetId: string;
  } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const onMapIntent = useCallback(
    (intent: MapIntent) => {
      const current = session.getSnapshot();
      if (intent.type === 'CLEAR_SELECTION') {
        setPending(null);
        setHoveredId(null);
      } else if (intent.type === 'HOVER_TARGET') setHoveredId(intent.targetId);
      else if (current.map.legalTargetIds.includes(intent.targetId))
        setPending({
          matchId: current.state.matchId,
          turn: current.state.turn,
          targetId: intent.targetId,
        });
    },
    [session],
  );
  const state = view.state;
  const selectedId =
    state.phase === 'DUEL'
      ? (state.question?.targetId ?? null)
      : state.phase === 'RESOLUTION'
        ? (view.reveal?.outcome.target ?? null)
        : pending?.matchId === state.matchId &&
            pending.turn === state.turn &&
            view.map.legalTargetIds.includes(pending.targetId)
          ? pending.targetId
          : null;
  const selection: MapSelection = useMemo(
    () => ({ selectedId, hoveredId }),
    [selectedId, hoveredId],
  );
  const selected = view.map.territories.find((node) => node.id === selectedId);
  const humanTurn =
    state.phase === 'ATTACK_SELECTION' && state.activePlayerId === HUMAN_ID;
  const controlHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (humanTurn) controlHeading.current?.focus();
  }, [humanTurn, state.turn]);
  const active = view.map.players.find(
    (player) => player.id === state.activePlayerId,
  );
  const human = state.players.find((player) => player.id === HUMAN_ID)!;
  const continueTurn = () =>
    session.send(
      { type: 'CONTINUE', matchId: state.matchId, turn: state.turn },
      now(),
    );
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state.phase === 'FINISHED') resultHeading.current?.focus();
  }, [state.phase]);

  return (
    <div
      className="local-match"
      data-phase={state.phase}
      data-human-turn={humanTurn}
      data-match-id={state.matchId}
      data-turn={state.turn}
    >
      <div className="match-standings" aria-label="حالة الممالك">
        {view.standings.map((row) => {
          const player = view.map.players.find(
            (item) => item.id === row.playerId,
          )!;
          return (
            <div
              key={row.playerId}
              className="match-faction"
              data-eliminated={row.eliminated}
            >
              <span
                className="match-faction-name"
                style={{ color: player.color }}
              >
                {player.name}
                <small>
                  {player.id === HUMAN_ID ? 'أنت' : 'خصم مبرمج'}
                  {row.eliminated ? ' · خارج المنافسة' : ''}
                </small>
              </span>
              <strong>
                {numbers.format(row.score)}
                <small>نقطة</small>
              </strong>
              <span>
                {numbers.format(row.territories)} أرض ·{' '}
                {numbers.format(row.castles)} قلعة
              </span>
            </div>
          );
        })}
      </div>

      {state.phase === 'FINISHED' && state.result && (
        <section className="match-results" aria-labelledby="results-title">
          <p className="eyebrow">حكاية المملكة</p>
          <h2 id="results-title" ref={resultHeading} tabIndex={-1}>
            انتهت المباراة
          </h2>
          <p className="match-winner">
            {state.result.winners.includes(HUMAN_ID)
              ? state.result.winners.length === 1
                ? 'مملكتك تتوّج بالانتصار.'
                : 'مملكتك تشارك في الصدارة.'
              : `الصدارة لمملكة ${state.result.winners.map((id) => view.map.players.find((player) => player.id === id)?.name).join(' و')}.`}
          </p>
          <p>
            {state.result.reason === 'CASTLES'
              ? 'حُسمت المملكة بجمع القلاع الثلاث.'
              : state.result.reason === 'LAST_PLAYER'
                ? 'بقيت مملكة واحدة في المنافسة.'
                : 'حُسم الترتيب عند نهاية الأدوار.'}
          </p>
          <ol className="match-placements">
            {state.result.placements.map((row) => (
              <li key={row.playerId}>
                <strong>
                  المركز {numbers.format(row.rank)} ·{' '}
                  {
                    view.map.players.find(
                      (player) => player.id === row.playerId,
                    )?.name
                  }
                </strong>
                <span>
                  {numbers.format(row.score)} نقطة ·{' '}
                  {numbers.format(row.territories)} أرض ·{' '}
                  {numbers.format(row.castles)} قلعة
                </span>
              </li>
            ))}
          </ol>
          <div className="match-result-actions">
            <Button onClick={() => session.restart(now())}>مباراة جديدة</Button>
            <Button asChild variant="outline">
              <Link href="/">العودة إلى البداية</Link>
            </Button>
          </div>
        </section>
      )}

      <div className="map-workspace match-workspace">
        <MapBoard
          model={view.map}
          selection={selection}
          onIntent={onMapIntent}
          effect={view.effect}
          caption="مباراة محلية · خصمان مبرمجان"
        />
        <aside
          className="map-command-panel match-control"
          aria-labelledby="local-turn-title"
        >
          <p className="eyebrow">
            {state.phase === 'LOBBY'
              ? 'رحلة محلية'
              : `الدور ${numbers.format(state.turn)} من ${numbers.format(view.maxTurns)}`}
          </p>
          <h2 id="local-turn-title" ref={controlHeading} tabIndex={-1}>
            {state.phase === 'LOBBY'
              ? 'المعرفة تفتح الطريق.'
              : state.phase === 'FINISHED'
                ? 'اكتملت الرحلة.'
                : humanTurn
                  ? 'اختر خطوتك.'
                  : state.phase === 'DUEL'
                    ? view.humanInvolved
                      ? 'المعرفة تحسمها.'
                      : 'مواجهة الخصمين.'
                    : state.phase === 'RESOLUTION'
                      ? 'حُسمت المواجهة.'
                      : `دور ${active?.name ?? ''}`}
          </h2>
          {state.phase === 'LOBBY' ? (
            <>
              <p className="map-help">
                أنت تقود مملكة فيروز ضد خصمين مبرمجين. اختر أرضًا مجاورة، ثم أجب
                عن سؤال. القلعة تساوي ثلاث نقاط والأرض العادية نقطة واحدة.
              </p>
              <Button
                className="match-primary-action"
                onClick={() => session.start(now())}
              >
                ابدأ المباراة المحلية
              </Button>
              <p className="map-help">
                اجمع القلاع الثلاث للفوز، أو احصد أعلى رصيد عند نهاية الأدوار.
                سقوط قلعة البداية يُخرج مالكها وينقل أراضيه.
              </p>
            </>
          ) : state.phase === 'ATTACK_SELECTION' ? (
            <>
              <Countdown
                remainingMs={view.remainingMs}
                windowMs={view.windowMs}
              />
              <p className="map-help">
                {humanTurn
                  ? 'اختر أرضًا متاحة من الخريطة أو القائمة ثم ابدأ التحدّي.'
                  : 'الخصم المبرمج يختار أرضًا مجاورة.'}
              </p>
              {humanTurn && (
                <>
                  <div className="map-selection-summary" role="status">
                    <span>الهدف المختار</span>
                    <strong>{selected?.name ?? 'اختر أرضًا متاحة'}</strong>
                    <p>
                      {selected
                        ? selected.ownerId
                          ? 'أرض مملوكة · تنتظرك مبارزة مع المدافع.'
                          : 'أرض محايدة · إجابة صحيحة تضمّها لمملكتك.'
                        : 'الإطار الذهبي يبيّن الأراضي المتاحة.'}
                    </p>
                  </div>
                  <Button
                    className="match-primary-action"
                    disabled={!selected}
                    onClick={() => {
                      if (selected)
                        session.send(
                          {
                            type: 'SELECT_TARGET',
                            matchId: state.matchId,
                            turn: state.turn,
                            targetId: selected.id,
                          },
                          now(),
                        );
                    }}
                  >
                    ابدأ التحدّي
                  </Button>
                </>
              )}
            </>
          ) : state.phase === 'DUEL' || state.phase === 'RESOLUTION' ? (
            <>
              <p className="map-help">
                {state.phase === 'DUEL'
                  ? human.eliminated
                    ? 'سقطت قلعتك؛ يمكنك متابعة مواجهة المملكتين.'
                    : view.humanInvolved
                      ? 'أجب عن السؤال قبل انتهاء الوقت. يمكنك تصغير النافذة ومراجعة الخريطة.'
                      : 'راقب مواجهة الخصمين المبرمجين.'
                  : view.reveal?.outcome.captured
                    ? `انتقلت أرض ${selected?.name ?? ''} إلى الفائز.`
                    : 'حافظ الدفاع على ملكية الأرض.'}
              </p>
              <BattleDialog
                view={view}
                onAnswer={(choiceId, questionId) =>
                  session.send(
                    {
                      type: 'SUBMIT_ANSWER',
                      matchId: state.matchId,
                      turn: state.turn,
                      choiceId,
                      questionId,
                    },
                    now(),
                  )
                }
                onContinue={continueTurn}
              />
            </>
          ) : null}
          {view.notice && (
            <p className="match-notice" role="status">
              {view.notice}
            </p>
          )}
          <p className="match-offline-note">
            لعب محلي للتجربة. الأسئلة مضمنة وقابلة للفحص، والنتائج لا تُحفظ.
            تحديث الصفحة يبدأ تجربة جديدة.
          </p>
        </aside>
        <TerritoryControls
          model={view.map}
          selection={selection}
          onIntent={onMapIntent}
        />
      </div>
    </div>
  );
}
