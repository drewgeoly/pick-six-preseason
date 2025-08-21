// Cloudflare Worker: Odds API Proxy
// Forwards requests to The Odds API with a server-side API key.
// Set env.ODDS_API_KEY in Cloudflare (Wrangler/Worker env var).
// Optionally set env.ALLOWED_ORIGIN to restrict CORS (e.g., https://drewgeoly.github.io).

export interface Env {
  ODDS_API_KEY: string;
  ALLOWED_ORIGIN?: string;
}

const API_BASE = 'https://api.the-odds-api.com/v4';

function makeCorsHeaders(originHeader: string | null, env: Env): HeadersInit {
  const allowed = env.ALLOWED_ORIGIN?.trim() || originHeader || '*';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function withCors(resp: Response, cors: HeadersInit) {
  const headers = new Headers(resp.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v as string);
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json', ...makeCorsHeaders(origin, env) },
      });
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: makeCorsHeaders(origin, env) });
    }

    // Only allow safe methods
    if (!['GET', 'HEAD'].includes(req.method)) {
      return withCors(new Response('Method Not Allowed', { status: 405 }), makeCorsHeaders(origin, env));
    }

    if (!env.ODDS_API_KEY) {
      return withCors(new Response('Server misconfigured: missing ODDS_API_KEY', { status: 500 }), makeCorsHeaders(origin, env));
    }

    // Build upstream URL: support optional "/odds" prefix, e.g.,
    //  - Worker at root:   https://worker.example.com
    //  - Worker at /odds:  https://worker.example.com/odds
    // In both cases, forward `/sports/...` to The Odds API.
    const forwardedPath = url.pathname.startsWith('/odds')
      ? url.pathname.slice('/odds'.length) || '/'
      : url.pathname;
    const upstream = new URL(API_BASE + forwardedPath);

    // Forward all query params and inject server-side apiKey (overrides any incoming key)
    for (const [k, v] of url.searchParams) upstream.searchParams.set(k, v);
    upstream.searchParams.set('apiKey', env.ODDS_API_KEY);

    const res = await fetch(upstream.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
    });

    // Pass through JSON and status, add CORS
    const cors = makeCorsHeaders(origin, env);
    const out = new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json',
      },
    });
    return withCors(out, cors);
  },
};
