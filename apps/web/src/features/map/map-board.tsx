'use client';

import dynamic from 'next/dynamic';
import type { MapEffect, MapIntent, MapModel, MapSelection } from './model';
const PhaserMap = dynamic(() => import('./phaser-map'), {
  ssr: false,
  loading: () => (
    <div className="map-loading" role="status">
      تُرسم حدود المملكة…
    </div>
  ),
});

export function MapBoard({
  model,
  selection,
  onIntent,
  effect = null,
  caption = 'معاينة محلية',
  milestone = 'M2',
}: {
  model: MapModel;
  selection: MapSelection;
  onIntent: (intent: MapIntent) => void;
  effect?: MapEffect | null;
  caption?: string;
  milestone?: 'M2' | 'M3';
}) {
  return (
    <section className="map-board" aria-labelledby="board-title">
      <div className="map-board-heading">
        <div>
          <p className="eyebrow">أرخبيل المنار</p>
          <h2 id="board-title">كل طريق يبدأ بقرار.</h2>
        </div>
        <span className="map-local-label">
          {caption} · <bdi>{milestone}</bdi>
        </span>
      </div>
      <div className="map-legend" aria-label="ممالك اللاعبين">
        {model.players.map((player) => (
          <span key={player.id} style={{ color: player.color }}>
            <i className="map-legend-gem" aria-hidden="true" />
            {player.name}
            <small>
              {player.id === model.activePlayerId
                ? 'المملكة النشطة'
                : 'مملكة منافسة'}
            </small>
          </span>
        ))}
      </div>
      <div className="map-canvas-frame">
        <PhaserMap
          model={model}
          selection={selection}
          onIntent={onIntent}
          effect={effect}
        />
      </div>
      <p className="map-board-note">
        الأرقام على الخريطة تقابل قائمة الأراضي. الخطوط تبيّن الجوار؛ بُعد الرسم
        لا يغيّر القواعد.
      </p>
    </section>
  );
}
const numerals = new Intl.NumberFormat('ar', { numberingSystem: 'arab' });
export function TerritoryControls({
  model,
  selection,
  onIntent,
}: {
  model: MapModel;
  selection: MapSelection;
  onIntent: (intent: MapIntent) => void;
}) {
  return (
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
              data-owner-id={node.ownerId ?? ''}
              data-legal={legal}
              aria-pressed={node.id === selection.selectedId}
              disabled={!legal}
              onClick={() =>
                onIntent({ type: 'SELECT_TARGET', targetId: node.id })
              }
              onFocus={() =>
                onIntent({ type: 'HOVER_TARGET', targetId: node.id })
              }
              onBlur={() => onIntent({ type: 'HOVER_TARGET', targetId: null })}
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
                    : 'غير متاحة الآن'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
