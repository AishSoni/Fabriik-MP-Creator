import type { CSSProperties } from 'react';
import type { StyleProps } from '../../types/template';

export function styleToCss(style: StyleProps): CSSProperties {
  return {
    fontSize: style.fontSize !== undefined ? `${style.fontSize}px` : undefined,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    textAlign: style.textAlign,
    color: style.color,
    backgroundColor: style.backgroundColor,
    paddingLeft: style.paddingX !== undefined ? `${style.paddingX}px` : undefined,
    paddingRight: style.paddingX !== undefined ? `${style.paddingX}px` : undefined,
    paddingTop: style.paddingY !== undefined ? `${style.paddingY}px` : undefined,
    paddingBottom: style.paddingY !== undefined ? `${style.paddingY}px` : undefined,
    marginTop: style.marginTop !== undefined ? `${style.marginTop}px` : undefined,
    marginBottom: style.marginBottom !== undefined ? `${style.marginBottom}px` : undefined,
    width: style.widthPercent !== undefined ? `${style.widthPercent}%` : undefined,
    height: style.height !== undefined ? `${style.height}px` : undefined,
    borderRadius: style.borderRadius !== undefined ? `${style.borderRadius}px` : undefined,
  };
}
