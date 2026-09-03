import type { StyleProps } from '../types/template';

export function styleToCssText(style: StyleProps): string[] {
  const declarations: string[] = [];
  if (style.fontSize !== undefined) declarations.push(`font-size: ${style.fontSize}px`);
  if (style.fontWeight !== undefined) declarations.push(`font-weight: ${style.fontWeight}`);
  if (style.lineHeight !== undefined) declarations.push(`line-height: ${style.lineHeight}`);
  if (style.textAlign !== undefined) declarations.push(`text-align: ${style.textAlign}`);
  if (style.color !== undefined) declarations.push(`color: ${style.color}`);
  if (style.backgroundColor !== undefined)
    declarations.push(`background-color: ${style.backgroundColor}`);
  if (style.paddingX !== undefined) {
    declarations.push(`padding-left: ${style.paddingX}px`);
    declarations.push(`padding-right: ${style.paddingX}px`);
  }
  if (style.paddingY !== undefined) {
    declarations.push(`padding-top: ${style.paddingY}px`);
    declarations.push(`padding-bottom: ${style.paddingY}px`);
  }
  if (style.marginTop !== undefined) declarations.push(`margin-top: ${style.marginTop}px`);
  if (style.marginBottom !== undefined)
    declarations.push(`margin-bottom: ${style.marginBottom}px`);
  if (style.widthPercent !== undefined) declarations.push(`width: ${style.widthPercent}%`);
  if (style.height !== undefined) declarations.push(`height: ${style.height}px`);
  if (style.borderRadius !== undefined)
    declarations.push(`border-radius: ${style.borderRadius}px`);
  return declarations;
}
