import { routePartykitRequest } from 'partyserver';
import type { Env } from './env';
import { TemplateDocDO } from './docObject';
import { isOriginAllowed, parseAllowedOrigins } from './origin';

export { TemplateDocDO };

const DOC_PATH = /^\/doc\/([A-Za-z0-9_-]+)$/;

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (!isOriginAllowed(origin, parseAllowedOrigins(env.ALLOWED_ORIGINS))) {
      return new Response('Forbidden', { status: 403 });
    }
    const url = new URL(request.url);
    const match = DOC_PATH.exec(url.pathname);
    if (match) {
      url.pathname = `/parties/doc/${match[1]}`;
      request = new Request(url, request);
    }
    return (await routePartykitRequest(request, env)) ?? new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
