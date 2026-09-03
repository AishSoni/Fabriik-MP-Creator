import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { cn } from '../../lib/cn';

type Align = 'left' | 'right' | 'center';

interface DropdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  label?: string;
  align?: Align;
  widthClass?: string;
  testId?: string;
  menuTestId?: string;
  variant?: 'base' | 'file';
  className?: string;
}

const alignClass: Record<Align, string> = {
  left: 'left-0',
  right: 'right-0',
  center: 'left-1/2 -translate-x-1/2',
};

export function Dropdown({
  open,
  onOpenChange,
  trigger,
  children,
  label,
  align = 'left',
  widthClass = 'w-64',
  testId,
  menuTestId,
  variant = 'base',
  className,
}: DropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [fixedStyle, setFixedStyle] = useState<React.CSSProperties>({});

  // bounds-aware fixed placement so sidepanel submenus never overflow viewport or get clipped by overflow-hidden ancestors
  const computeFixed = () => {
    const triggerEl = triggerRef.current;
    const menuEl = menuRef.current;
    if (!triggerEl || !menuEl) return;
    const t = triggerEl.getBoundingClientRect();
    const mw = menuEl.offsetWidth || 256;
    const mh = menuEl.offsetHeight || 0;
    const gap = 8;
    let top = t.bottom + gap;
    let left: number;
    if (align === 'right') left = t.right - mw;
    else if (align === 'center') left = t.left + t.width / 2 - mw / 2;
    else left = t.left;
    // viewport clamp
    const pad = 8;
    left = Math.max(pad, Math.min(left, window.innerWidth - mw - pad));
    // flip above if below viewport
    if (top + mh > window.innerHeight - pad) {
      const flipped = t.top - mh - gap;
      if (flipped >= pad) top = flipped;
      else top = Math.max(pad, window.innerHeight - mh - pad);
    }
    setFixedStyle({ position: 'fixed', left, top, zIndex: 50 });
  };

  useLayoutEffect(() => {
    if (!open) return;
    // measure after mount
    const id = requestAnimationFrame(() => computeFixed());
    return () => cancelAnimationFrame(id);
  }, [open, align, widthClass]);

  useEffect(() => {
    if (!open) return;
    const onReflow = () => computeFixed();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onOpenChange]);

  // base shell is deliberately neutral so file variant can add its own header/footer
  const baseShell = cn(
    'overflow-hidden rounded-[16px] border shadow-floating',
    variant === 'file' ? 'p-1.5' : 'p-1',
  );

  const darkMode = useEditorStore((s) => s.darkMode);
  // fallback respects JS-driven darkMode (Tailwind dark: variant would not fire for store-based theme)
  const fallbackTone = darkMode ? 'border-surface-dark-muted bg-surface-dark-raised' : 'border-stone bg-surface';

  // use fixed when open to escape overflow-hidden sidepanel containers; fallback to absolute if measurement not ready
  const useFixed = open && fixedStyle.left !== undefined;

  return (
    <div ref={containerRef} className="relative" data-testid={testId}>
      <div ref={triggerRef}>{trigger}</div>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          data-testid={menuTestId}
          style={useFixed ? fixedStyle : undefined}
          className={cn(
            !useFixed && `absolute z-20 mt-2 ${alignClass[align]}`,
            widthClass,
            baseShell,
            'animate-in max-w-[calc(100vw-16px)]',
            className ?? fallbackTone,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// Helpers for the base variant — keep them headless so file menu can compose its own header
export function DropdownHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function DropdownItem({
  children,
  onClick,
  testId,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { testId?: string }) {
  return (
    <button role="menuitem" type="button" data-testid={testId} onClick={onClick} className={className} {...rest}>
      {children}
    </button>
  );
}
