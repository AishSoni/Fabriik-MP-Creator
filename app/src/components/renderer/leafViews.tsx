import type { CSSProperties } from 'react';
import type { ResolvedElement } from '../../engine/resolve';

export interface LeafProps {
  resolved: ResolvedElement;
  style: CSSProperties;
}

export function NavView({ resolved, style }: LeafProps) {
  const content = resolved.content as { brand: string; links: { label: string; href: string }[] };
  return (
    <div style={style} className="flex items-center justify-between gap-4">
      <span className="text-lg font-bold">{content.brand}</span>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-4 overflow-hidden">
        {content.links.map((link, i) => (
          <a
            key={i}
            href={link.href}
            onClick={(e) => e.preventDefault()}
            className="opacity-90 hover:opacity-100"
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}

export function HeadingView({ resolved, style }: LeafProps) {
  return <h2 style={style}>{(resolved.content as { text: string }).text}</h2>;
}

export function TextView({ resolved, style }: LeafProps) {
  return <p style={style}>{(resolved.content as { text: string }).text}</p>;
}

export function ButtonView({ resolved, style, editable }: LeafProps & { editable?: boolean }) {
  const content = resolved.content as { label: string; href: string };
  return (
    <div style={{ ...style, display: 'flex', justifyContent: centerAlign(resolved.style.textAlign) }}>
      <a
        href={editable ? undefined : content.href}
        draggable={false}
        onClick={(e) => e.preventDefault()}
        className="inline-block cursor-pointer no-underline"
      >
        {content.label}
      </a>
    </div>
  );
}

function centerAlign(textAlign?: string) {
  if (textAlign === 'center') return 'center';
  if (textAlign === 'right') return 'flex-end';
  return 'flex-start';
}

export function ImageView({ resolved, style }: LeafProps) {
  const content = resolved.content as { src: string; alt: string };
  return <img src={content.src} alt={content.alt} style={style} draggable={false} />;
}

export function ListView({ resolved, style }: LeafProps) {
  const content = resolved.content as { items: string[] };
  return (
    <ul style={style}>
      {content.items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
