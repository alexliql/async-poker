import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { LAYOUTS, type LayoutId, pickLayout } from '../lib/layout';

const IDS = Object.keys(LAYOUTS) as LayoutId[];

function forcedLayout(): LayoutId | null {
  const v = new URLSearchParams(location.search).get('layout');
  return v && (IDS as string[]).includes(v) ? (v as LayoutId) : null;
}

/**
 * Draws the table at its design size and scales it to fit inside the safe area, centered.
 * Every device sees the same composition; `?layout=` forces a surface for testing.
 */
export function Stage({ children }: { children: (layout: LayoutId) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const id = forcedLayout() ?? pickLayout(box.w, box.h);
  const L = LAYOUTS[id];
  const scale = Math.min(box.w / L.W, box.h / L.H) || 1;
  const left = (box.w - L.W * scale) / 2;
  const top = (box.h - L.H * scale) / 2;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', overflow: 'hidden' }}>
      <div
        ref={ref}
        data-layout={id}
        style={{
          position: 'absolute',
          top: 'env(safe-area-inset-top)',
          right: 'env(safe-area-inset-right)',
          bottom: 'env(safe-area-inset-bottom)',
          left: 'env(safe-area-inset-left)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left,
            top,
            width: L.W,
            height: L.H,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {children(id)}
        </div>
      </div>
    </div>
  );
}
