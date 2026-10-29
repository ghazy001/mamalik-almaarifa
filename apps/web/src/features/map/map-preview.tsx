'use client';

import dynamic from 'next/dynamic';
import { useReducer } from 'react';
import { Button } from '../../components/ui/button';
import { EMPTY_SELECTION, reduceSelection } from './model';
import type { MapModel } from './model';

const PhaserMap = dynamic(() => import('./phaser-map'), {
  ssr: false,
  loading: () => (
    <div className="map-loading" role="status">
      تُرسم حدود المملكة…
    </div>
  ),
});
const numerals = new Intl.NumberFormat('ar', { numberingSystem: 'arab' });

export function MapPreview({ model }: { model: MapModel }) {
  const [selection, dispatch] = useReducer(
    (
      state: typeof EMPTY_SELECTION,
      intent: Parameters<typeof reduceSelection>[1],
    ) => reduceSelection(state, intent, model),
    EMPTY_SELECTION,
  );
  const active = model.players.find(
    (player) => player.id === model.activePlayerId,
  )!;
  const selected = model.territories.find(
    (node) => node.id === selection.selectedId,
  );

  return (
    <div className="map-workspace">
      <section className="map-board" aria-labelledby="board-title">
        <div className="map-board-heading">
          <div>
            <p className="eyebrow">أرخبيل المنار</p>
            <h2 id="board-title">كل طريق يبدأ بقرار.</h2>
          </div>
          <span className="map-local-label">
            معاينة محلية · <bdi>M2</bdi>
          </span>
        </div>
        <div className="map-legend" aria-label="ممالك اللاعبين">
          {model.players.map((player) => (
            <span key={player.id} style={{ color: player.color }}>
              <i className="map-legend-gem" aria-hidden="true" />
              {player.name}
              <small>
                {player.id === active.id ? 'المملكة النشطة' : 'قلعة البداية'}
              </small>
            </span>
          ))}
        </div>
        <div className="map-canvas-frame">
          <PhaserMap model={model} selection={selection} onIntent={dispatch} />
        </div>
        <p className="map-board-note">
          الأرقام على الخريطة تقابل قائمة الأراضي. الخطوط تبيّن الجوار؛ بُعد
          الرسم لا يغيّر القواعد.
        </p>
      </section>

      <aside className="map-command-panel" aria-labelledby="target-title">
        <p className="eyebrow">اختيار الهدف</p>
        <h2 id="target-title">إلى أين تتجه؟</h2>
        <p className="map-help">
          المملكة النشطة:{' '}
          <strong style={{ color: active.color }}>{active.name}</strong>. اختر
          أرضًا مجاورة لقلعتها من الخريطة أو القائمة.
        </p>
        <div
          className="map-selection-summary"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {selected ? (
            <>
              <span>الهدف المختار</span>
              <strong>{selected.name}</strong>
              <p>أرض محايدة مجاورة · لم تتغيّر ملكيتها.</p>
            </>
          ) : (
            <>
              <span>بانتظار اختيارك</span>
              <strong>
                أمامك {numerals.format(model.legalTargetIds.length)} من الدروب
              </strong>
              <p>الأراضي ذات الإطار الذهبي متاحة للاختيار.</p>
            </>
          )}
        </div>
        <Button
          variant="outline"
          className="map-clear"
          onClick={() => dispatch({ type: 'CLEAR_SELECTION' })}
          disabled={!selected}
        >
          مسح الاختيار
        </Button>
        <p className="map-slice-note">
          هذه تجربة لاختيار الأراضي فقط. الأسئلة والمواجهات تأتي في الخطوة
          التالية، ولا توجد مباراة عبر الإنترنت.
        </p>
      </aside>

      <section
        className="map-territory-section"
        aria-labelledby="territory-title"
      >
        <div className="map-territory-heading">
          <h2 id="territory-title">أراضي المملكة</h2>
          <p>يمكنك اختيار الهدف بلوحة المفاتيح أو اللمس.</p>
        </div>
        <div className="map-territories">
          {model.territories.map((node, index) => {
            const owner = model.players.find(
              (player) => player.id === node.ownerId,
            );
            const legal = model.legalTargetIds.includes(node.id);
            return (
              <button
                key={node.id}
                type="button"
                className="map-territory"
                data-territory-id={node.id}
                data-legal={legal}
                aria-pressed={node.id === selection.selectedId}
                disabled={!legal}
                onClick={() =>
                  dispatch({ type: 'SELECT_TARGET', targetId: node.id })
                }
                onFocus={() =>
                  dispatch({ type: 'HOVER_TARGET', targetId: node.id })
                }
                onBlur={() =>
                  dispatch({ type: 'HOVER_TARGET', targetId: null })
                }
              >
                <span className="map-territory-number">
                  {numerals.format(index + 1).padStart(2, '٠')}
                </span>
                <span className="map-territory-name">
                  {node.name}
                  <small>
                    {owner
                      ? `مملكة ${owner.name}${node.castle ? ' · قلعة' : ''}`
                      : 'أرض محايدة'}
                  </small>
                </span>
                <span className="map-territory-state">
                  {legal
                    ? node.id === selection.selectedId
                      ? 'مختارة'
                      : 'متاحة'
                    : owner
                      ? 'مملوكة'
                      : 'غير مجاورة'}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
