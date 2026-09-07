const SAFE_URL_SCHEME = /^(?:https?|mailto|tel)$/i;
const URL_SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

export function isSafeUrl(url: string): boolean {
  // eslint-disable-next-line no-control-regex -- C0 controls are stripped to defeat scheme-detection evasion
  const probe = url.replace(/[\u0000-\u0020]+/g, '');
  const schemeMatch = URL_SCHEME.exec(probe);
  if (!schemeMatch) return true;
  return SAFE_URL_SCHEME.test(schemeMatch[1]);
}
