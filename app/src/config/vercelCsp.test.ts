/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GEMINI_ENDPOINT } from '../engine/ai/providers/gemini';

const readAppFile = (relative: string): string =>
  readFileSync(resolve(process.cwd(), relative), 'utf8');

interface VercelHeaderSet {
  source: string;
  headers: { key: string; value: string }[];
}

const parseVercelConfig = (): { headers: VercelHeaderSet[] } =>
  JSON.parse(readAppFile('vercel.json')) as { headers: VercelHeaderSet[] };

const findHeaderValue = (key: string): string | undefined => {
  const config = parseVercelConfig();
  for (const set of config.headers) {
    const header = set.headers.find((h) => h.key.toLowerCase() === key.toLowerCase());
    if (header) return header.value;
  }
  return undefined;
};

const directives = (policy: string): Record<string, string[]> => {
  const map: Record<string, string[]> = {};
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...values] = tokens;
    map[name] = values;
  }
  return map;
};

const csp = (): string => {
  const value = findHeaderValue('Content-Security-Policy-Report-Only');
  expect(value, 'vercel.json must ship a Content-Security-Policy-Report-Only header').toBeDefined();
  return value as string;
};

const PROVIDER_ORIGINS = [
  'https://generativelanguage.googleapis.com',
  'https://api.openai.com',
  'https://openrouter.ai',
  'https://api.anthropic.com',
];

const LOCAL_ORIGINS = ['http://localhost:11434', 'http://localhost:1234'];

describe('Vercel CSP headers (spec ai-byok §7, §11)', () => {
  it('parses and applies headers to all routes', () => {
    const config = parseVercelConfig();
    expect(Array.isArray(config.headers)).toBe(true);
    expect(config.headers.length).toBeGreaterThan(0);
  });

  it('ships Report-Only CSP (enforce rollout is a later, deliberate flip)', () => {
    expect(findHeaderValue('Content-Security-Policy')).toBeUndefined();
    expect(csp().length).toBeGreaterThan(0);
  });

  it('locks scripts and defaults to self', () => {
    const d = directives(csp());
    expect(d['default-src']).toContain("'self'");
    expect(d['script-src']).toEqual(["'self'"]);
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['base-uri']).toEqual(["'self'"]);
    expect(d['form-action']).toEqual(["'none'"]);
  });

  it('permits inline styles plus Google Fonts stylesheets and font files', () => {
    const d = directives(csp());
    expect(d['style-src']).toContain("'self'");
    expect(d['style-src']).toContain("'unsafe-inline'");
    expect(d['style-src']).toContain('https://fonts.googleapis.com');
    expect(d['font-src']).toContain("'self'");
    expect(d['font-src']).toContain('https://fonts.gstatic.com');
  });

  it('permits self, data, and hosted https images', () => {
    const d = directives(csp());
    expect(d['img-src']).toEqual(
      expect.arrayContaining(["'self'", 'data:', 'https:']),
    );
  });

  it('allowlists exactly the BYOK provider endpoints plus local runtimes', () => {
    const d = directives(csp());
    const connect = d['connect-src'] ?? [];
    expect(connect).toContain("'self'");
    for (const origin of [...PROVIDER_ORIGINS, ...LOCAL_ORIGINS]) {
      expect(connect, `connect-src must include ${origin}`).toContain(origin);
    }
  });

  it('proxies Umami first-party so no third-party tracker origins are needed', () => {
    const d = directives(csp());
    expect(d['script-src']).not.toContain('https://cloud.umami.is');
    const connect = d['connect-src'] ?? [];
    for (const origin of [
      'https://cloud.umami.is',
      'https://gateway.umami.is',
      'https://eu.umami.is',
      'https://api-gateway-eu.umami.dev',
      'https://api-gateway.umami.dev',
    ]) {
      expect(connect, `connect-src must not include ${origin}`).not.toContain(origin);
    }
    expect(connect).toContain("'self'");
  });

  it('ships first-party Umami rewrites', () => {
    const config = parseVercelConfig() as {
      headers: VercelHeaderSet[];
      rewrites?: { source: string; destination: string }[];
    };
    expect(Array.isArray(config.rewrites)).toBe(true);
    const bySource = new Map(
      (config.rewrites ?? []).map((r) => [r.source, r.destination]),
    );
    expect(bySource.get('/m.js')).toBe('https://cloud.umami.is/script.js');
    expect(bySource.get('/m/api/send')).toBe(
      'https://cloud.umami.is/api/send',
    );
  });

  it('loads the tracker first-party', () => {
    const html = readAppFile('index.html');
    expect(html).toContain('src="/m.js"');
    expect(html).toContain('data-host-url="/m"');
    expect(html).not.toContain('https://cloud.umami.is/script.js');
  });
  it('connect-src parity: names the endpoint constants declared in provider modules', () => {
    const d = directives(csp());
    const geminiOrigin = new URL(GEMINI_ENDPOINT).origin;
    expect(d['connect-src']).toContain(geminiOrigin);
  });

  it('never opens a wildcard exfiltration channel', () => {
    const d = directives(csp());
    expect(d['connect-src']).not.toContain('*');
    expect(csp()).not.toMatch(/connect-src[^;]*\*/);
    expect(d['script-src']).not.toContain("'unsafe-eval'");
  });

  it('sends Referrer-Policy: no-referrer', () => {
    expect(findHeaderValue('Referrer-Policy')).toBe('no-referrer');
  });

  it('does not inject a CSP meta tag (delivery is Vercel headers; Vite dev stays unaffected)', () => {
    expect(readAppFile('index.html')).not.toMatch(/http-equiv=["']Content-Security-Policy/i);
  });
});
