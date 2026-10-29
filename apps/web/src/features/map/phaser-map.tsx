'use client';

import { useEffect, useRef, useState } from 'react';
import type { createMapRenderer } from './renderer';
import type { MapIntent, MapModel, MapSelection } from './model';

export default function PhaserMap({
  model,
  selection,
  onIntent,
}: {
  model: MapModel;
  selection: MapSelection;
  onIntent: (intent: MapIntent) => void;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof createMapRenderer> | null>(null);
  const currentSelection = useRef(selection);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>(
    'loading',
  );
  currentSelection.current = selection;

  useEffect(() => {
    const host = parent.current;
    if (!host) return;
    // Each effect owns a separate mount, including React Strict Mode's probe.
    const mount = document.createElement('div');
    mount.className = 'phaser-mount';
    host.appendChild(mount);
    let disposed = false;
    void Promise.all([document.fonts.ready, import('./renderer')])
      .then(([, module]) => {
        if (disposed) return;
        renderer.current = module.createMapRenderer(
          mount,
          model,
          onIntent,
          () => {
            if (!disposed) setStatus('ready');
          },
        );
        renderer.current.setSelection(currentSelection.current);
      })
      .catch(() => {
        if (!disposed) setStatus('fallback');
      });
    return () => {
      disposed = true;
      renderer.current?.destroy();
      renderer.current = null;
      mount.remove();
    };
  }, [model, onIntent]);

  useEffect(() => {
    renderer.current?.setSelection(selection);
  }, [selection]);

  return (
    <div
      className="phaser-host"
      data-render-state={status}
      data-selected-id={selection.selectedId ?? ''}
      data-hovered-id={selection.hoveredId ?? ''}
    >
      <div ref={parent} className="phaser-surface" aria-hidden="true" />
      {status === 'loading' && (
        <div className="map-loading" role="status">
          تُرسم حدود المملكة…
        </div>
      )}
      {status === 'fallback' && (
        <div className="map-loading" role="status">
          تعذّر عرض الرسم. قائمة الأراضي أدناه متاحة للاختيار.
        </div>
      )}
    </div>
  );
}
