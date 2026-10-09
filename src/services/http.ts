// Fetch helpers: in-memory de-duplication, optional session cache for live APIs, and an
// optional edge proxy (VITE_DATA_PROXY_URL) used when a source blocks cross-origin requests.

const memory = new Map<string, Promise<unknown>>();
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
const PROXY = (import.meta.env.VITE_DATA_PROXY_URL as string | undefined) || '';

export class HttpError extends Error {
  constructor(public url: string, public status: number, message?: string) {
    super(message ?? `HTTP ${status} for ${url}`);
  }
}

/**
 * URL of a file in the static snapshot (public/data). The build id makes each deploy's data a
 * new URL, so neither the browser cache nor the service worker can serve an older snapshot.
 */
export function dataUrl(path: string): string {
  return `${BASE}/data/${path.replace(/^\//, '')}?v=${__BUILD_ID__}`;
}

export function assetUrl(path: string): string {
  return `${BASE}/${path.replace(/^\//, '')}`;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new HttpError(url, res.status);
  return (await res.json()) as T;
}

/** Static snapshot file; cached for the lifetime of the page. */
export function loadData<T>(path: string): Promise<T> {
  const url = dataUrl(path);
  if (!memory.has(url)) {
    const p = getJson<T>(url).catch((e) => {
      memory.delete(url);
      throw e;
    });
    memory.set(url, p);
  }
  return memory.get(url) as Promise<T>;
}

/** Static file that may legitimately be absent (e.g. a DOSM snapshot not built yet). */
export async function loadOptional<T>(path: string): Promise<T | null> {
  try {
    return await loadData<T>(path);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    // Vite dev server answers unknown paths with index.html → JSON parse error: treat as absent
    if (e instanceof SyntaxError) return null;
    throw e;
  }
}

function sessionGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw) as { t: number; v: T };
    if (Date.now() - t > 6 * 3600 * 1000) return null;
    return v;
  } catch {
    return null;
  }
}

function sessionSet(key: string, v: unknown) {
  try {
    const s = JSON.stringify({ t: Date.now(), v });
    if (s.length < 1_500_000) sessionStorage.setItem(key, s);
  } catch {
    /* storage full or blocked: ignore */
  }
}

/**
 * Live official API (World Bank, OpenDOSM, Wikidata). Tries the source directly, then the proxy.
 * Results are cached in sessionStorage for 6 hours to stay polite to public endpoints.
 */
export function liveJson<T>(url: string, opts: { cacheKey?: string; timeoutMs?: number; init?: RequestInit } = {}): Promise<T> {
  const key = `wsa.live.${opts.cacheKey ?? url}`;
  if (memory.has(key)) return memory.get(key) as Promise<T>;
  const cached = sessionGet<T>(key);
  if (cached) return Promise.resolve(cached);
  const attempt = async (u: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
    try {
      return await getJson<T>(u, { ...opts.init, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  };
  const p = (async () => {
    try {
      const v = await attempt(url);
      sessionSet(key, v);
      return v;
    } catch (e) {
      if (!PROXY) throw e;
      const v = await attempt(`${PROXY}?url=${encodeURIComponent(url)}`);
      sessionSet(key, v);
      return v;
    }
  })().catch((e) => {
    memory.delete(key);
    throw e;
  });
  memory.set(key, p);
  return p;
}
