import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ElementNode } from './ElementNode';
import { useEditorStore } from '../../store/editorStore';
import { useTemplateStore } from '../../store/templateStore';
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
      const doc = useTemplateStore.getState().doc;
      const ancestors = new Set<string>();
      for (const id of ids) {
        let current: string | null = doc.elements[id]?.parentId ?? null;
        while (current) {
          ancestors.add(current);
          current = doc.elements[current]?.parentId ?? null;
        }
      }
      const deepest = ids.filter((id) => !ancestors.has(id));
      if (deepest.length > 0) setSelection(deepest);
    }
    origin.current = null;
    setMarquee(null);
  };

  const darkMode = useEditorStore((s) => s.darkMode);
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col items-center overflow-auto overscroll-contain p-4 sm:p-6 ${darkMode ? 'canvas-grid-dark' : 'canvas-grid'}`}
      data-canvas-surface="true"
      data-testid="canvas-scroll"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="flex w-full justify-center">
        <div className={`hidden shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium shadow-[0_2px_8px_rgba(14,14,16,0.08)] sm:inline-flex ${darkMode ? 'border-[#262629] bg-[#1E1E20] text-[#9A9996]' : 'border-[#E7E5E0] bg-white text-[#6B6A68]'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${activeViewport === 'desktop' ? 'bg-[#7868E6]' : activeViewport === 'tablet' ? 'bg-[#C9A86A]' : 'bg-[#3A9B8A]'}`} />
          <span className="capitalize">{activeViewport}</span>
          <span className="font-mono tabular-nums opacity-60">{VIEWPORT_WIDTH[activeViewport]}px</span>
          <span className={`ml-1 hidden h-3 w-px lg:block ${darkMode ? 'bg-[#262629]' : 'bg-[#E7E5E0]'}`} />
          <span className="hidden lg:inline opacity-60">Drag to marquee · Shift/Cmd for multi-select</span>
        </div>
      </div>

      <div className="mt-4 flex w-full flex-1 justify-center pb-8">
        {/* Outer shell — double-bezel */}
        <div
          className={`h-fit rounded-[20px] p-1.5 sm:rounded-[24px] sm:p-2 ${darkMode ? 'bg-[#1A1A1E] ring-1 ring-white/[0.06]' : 'bg-[#E7E5E0]/60 ring-1 ring-[#0E0E10]/[0.06] shadow-[0_12px_40px_rgba(14,14,16,0.12),0_4px_12px_rgba(14,14,16,0.08)]'}`}
          style={{ width: VIEWPORT_WIDTH[activeViewport], maxWidth: '100%' }}
        >
          <div
            ref={frameRef}
            className={`relative h-fit min-h-[420px] overflow-hidden bg-white sm:min-h-full ${darkMode ? 'ring-1 ring-white/5' : 'ring-1 ring-[#0E0E10]/5'}`}
            style={{ width: '100%', borderRadius: '16px' }}
            data-testid="device-frame"
          >
            {/* inner highlight */}
            <div className="pointer-events-none absolute inset-0 rounded-[16px] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]" />
            <ElementNode id="page-root" />
            {marquee && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute rounded-[6px] border border-[#7868E6] bg-[#7868E6]/10 shadow-[0_0_0_1px_rgba(120,104,230,0.2)] backdrop-blur-[1px]"
                style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
