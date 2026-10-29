'use client';

import { useReducer } from 'react';
import { Button } from '../../components/ui/button';
import { EMPTY_SELECTION, reduceSelection } from './model';
import type { MapModel } from './model';
import { MapBoard, TerritoryControls } from './map-board';
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
      <MapBoard model={model} selection={selection} onIntent={dispatch} />
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
          هذه معاينة لاختيار الأراضي فقط. يمكنك بدء مباراة كاملة من صفحة اللعب
          المحلي، ولا توجد مباراة عبر الإنترنت.
        </p>
      </aside>
      <TerritoryControls
        model={model}
        selection={selection}
        onIntent={dispatch}
      />
    </div>
  );
}
