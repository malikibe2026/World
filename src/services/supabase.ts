// Optional Supabase (PostgreSQL + PostGIS) backend. When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// are set, statistics are read through the RPCs in supabase/migrations/…_functions.sql instead of the
// static snapshot. Only the anon (publishable) key is ever used in the browser; RLS makes it read-only.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Quality, Series } from '../types';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: Promise<SupabaseClient> | null = null;

export const supabaseEnabled = Boolean(URL_ && KEY);

export function getSupabase(): Promise<SupabaseClient> | null {
  if (!supabaseEnabled) return null;
  client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(URL_!, KEY!, { auth: { persistSession: false } }));
  return client;
}

interface ObsRow { indicator: string; year: number; value: number | null; quality: Quality; source_name: string; source_url: string; last_updated: string | null }

/** Server-side series for one geography (paged by PostgREST max_rows). */
export async function sbSeries(geoId: string, indicators: string[]): Promise<Record<string, Series> | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await (await sb).rpc('get_series', { p_geo_id: geoId, p_indicators: indicators });
  if (error) throw error;
  const out: Record<string, Series> = {};
  for (const r of (data ?? []) as ObsRow[]) {
    if (r.value === null) continue;
    (out[r.indicator] ??= { indicator: r.indicator, sourceId: '', lastUpdated: r.last_updated, points: [] }).points.push({ year: r.year, value: r.value, quality: r.quality });
  }
  return out;
}

/** Fire-and-forget download log (format, scope, row count; no personal data). */
export async function sbLogDownload(geoId: string | null, format: string, indicators: string[], rowCount: number): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await (await sb).rpc('log_download', { p_geo_id: geoId, p_format: format, p_indicators: indicators.slice(0, 50), p_row_count: rowCount, p_client: navigator.userAgent.split(' ')[0] });
  } catch {
    /* logging must never block a download */
  }
}
