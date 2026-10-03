// Supabase Edge Function: data-proxy
//
// Optional server-side proxy for the live official APIs used by the browser, for deployments
// where a source does not send CORS headers or is rate limited. Only allow-listed hosts are
// proxied, responses are cached at the edge, and no credentials are forwarded.
//
//   GET /functions/v1/data-proxy?url=<encoded https URL on an allowed host>
//
// Deploy:  supabase functions deploy data-proxy --no-verify-jwt
// Then set VITE_DATA_PROXY_URL=https://<project>.supabase.co/functions/v1/data-proxy

const ALLOWED_HOSTS = new Set([
  'api.worldbank.org',
  'api.data.gov.my',
  'storage.dosm.gov.my',
  'storage.data.gov.my',
  'query.wikidata.org',
  'www.wikidata.org',
  'en.wikipedia.org',
]);
const CACHE_SECONDS: Record<string, number> = {
  'api.worldbank.org': 86400,
  'api.data.gov.my': 3600,
  'storage.dosm.gov.my': 86400,
  'storage.data.gov.my': 86400,
  'query.wikidata.org': 86400,
  'www.wikidata.org': 86400,
  'en.wikipedia.org': 86400,
};
const MAX_BYTES = 25 * 1024 * 1024;

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

  const target = new URL(req.url).searchParams.get('url');
  let url: URL;
  try {
    url = new URL(target ?? '');
  } catch {
    return new Response('Missing or invalid ?url=', { status: 400, headers: cors });
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    return new Response('Host not allowed', { status: 403, headers: cors });
  }

  const upstream = await fetch(url.toString(), {
    headers: { 'User-Agent': 'WorldStatAtlas-proxy/0.1', Accept: req.headers.get('Accept') ?? '*/*' },
  });
  const len = Number(upstream.headers.get('content-length') ?? '0');
  if (len > MAX_BYTES) return new Response('Upstream response too large', { status: 413, headers: cors });

  const headers = new Headers(cors);
  headers.set('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
  headers.set('Cache-Control', `public, max-age=${CACHE_SECONDS[url.hostname] ?? 3600}`);
  const lm = upstream.headers.get('last-modified');
  if (lm) headers.set('Last-Modified', lm);
  headers.set('X-Proxied-From', url.hostname);
  return new Response(upstream.body, { status: upstream.status, headers });
});
