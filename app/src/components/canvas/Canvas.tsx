import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ElementNode } from './ElementNode';
import { useEditorStore } from '../../store/editorStore';
import { VIEWPORT_WIDTH } from '../../types/viewport';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Canvas() {
  const activeViewport = useEditorStore((s) => s.activeViewport);
  const setSelection = useEditorStore((s) => s.setSelection);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const frameRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    const target = e.target as HTMLElement;
    const onSurface =
      target.dataset.canvasSurface === 'true' || target === frameRef.current;
    if (!onSurface) return;
    clearSelection();
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    origin.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setMarquee({ x: origin.current.x, y: origin.current.y, w: 0, h: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!origin.current || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMarquee({
      x: Math.min(origin.current.x, x),
      y: Math.min(origin.current.y, y),
      w: Math.abs(x - origin.current.x),
      h: Math.abs(y - origin.current.y),
    });
  };

  const onPointerUp = () => {
    if (marquee && marquee.w > 4 && marquee.h > 4 && frameRef.current) {
      const ids: string[] = [];
      frameRef.current.querySelectorAll<HTMLElement>('[data-eid]').forEach((el) => {
        const r = el.getBoundingClientRect();
        const f = frameRef.current!.getBoundingClientRect();
        const elRect = { left: r.left - f.left, top: r.top - f.top, right: r.right - f.left, bottom: r.bottom - f.top };
        const intersects =
          elRect.left < marquee.x + marquee.w &&
          elRect.right > marquee.x &&
          elRect.top < marquee.y + marquee.h &&
          elRect.bottom > marquee.y;
        if (intersects && el.dataset.eid) ids.push(el.dataset.eid);
      });
      if (ids.length > 0) setSelection(ids);
    }
    origin.current = null;
    setMarquee(null);
  };

  return (
    <div
      className="flex flex-1 justify-center overflow-auto bg-slate-200 p-6"
      data-canvas-surface="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        ref={frameRef}
        className="relative h-fit min-h-full bg-white shadow-xl"
        style={{ width: VIEWPORT_WIDTH[activeViewport], maxWidth: '100%' }}
        data-testid="device-frame"
      >
        <ElementNode id="page-root" />
        {marquee && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border border-blue-600 bg-blue-500/10"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
          />
        )}
      </div>
    </div>
  );
}
