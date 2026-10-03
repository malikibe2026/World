import { describe, expect, it } from 'vitest';
import { alignYears, dedupe, jumpOutliers, robustOutliers, unitCheck, wppQuality } from './quality';
import type { Observation, Series } from '../types';

const obs = (geoId: string, year: number, value: number): Observation => ({
  geoId, geoName: geoId, level: 'country', indicator: 'gdp', value, unit: 'current US$', year,
  referencePeriod: String(year), quality: 'OFFICIAL', sourceId: 'wb_wdi', sourceName: 'WDI', sourceUrl: 'x', lastUpdated: null,
});

describe('quality engine', () => {
  it('drops duplicate observations and reports them', () => {
    const r = dedupe([obs('MYS', 2020, 1), obs('MYS', 2020, 2), obs('MYS', 2021, 3)]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].value).toBe(1);
    expect(r.issues[0].check).toBe('duplicate_records');
  });

  it('flags large year-on-year jumps without removing them', () => {
    const s: Series = { indicator: 'x', sourceId: 's', lastUpdated: null, points: [
      { year: 2000, value: 100, quality: 'OFFICIAL' }, { year: 2001, value: 102, quality: 'OFFICIAL' }, { year: 2002, value: 400, quality: 'OFFICIAL' },
    ] };
    const issues = jumpOutliers(s);
    expect(issues).toHaveLength(1);
    expect(issues[0].year).toBe(2002);
  });

  it('finds cross-sectional outliers with a robust z-score', () => {
    const vals = Array.from({ length: 20 }, (_, i) => ({ geoId: `G${i}`, value: 10 + (i % 3) }));
    vals.push({ geoId: 'BIG', value: 1000 });
    expect(robustOutliers(vals)).toEqual(['BIG']);
  });

  it('detects impossible values for the unit', () => {
    expect(unitCheck('urban_pct', '% of total population', 140)?.check).toBe('unit_mismatch');
    expect(unitCheck('trade_pct_gdp', '% of GDP', 300)).toBeNull(); // trade can exceed 100% of GDP
    expect(unitCheck('cbr', 'per 1,000 population', 25)).toBeNull();
  });

  it('aligns comparison years and reports mismatches', () => {
    const mk = (pts: Array<[number, number]>): Series => ({ indicator: 'gdp', sourceId: 'wb', lastUpdated: null, points: pts.map(([year, value]) => ({ year, value, quality: 'OFFICIAL' as const })) });
    const same = alignYears({ A: mk([[2022, 1], [2023, 2]]), B: mk([[2022, 3], [2023, 4]]) });
    expect(same.year).toBe(2023);
    expect(same.issues).toHaveLength(0);
    const diff = alignYears({ A: mk([[2023, 2]]), B: mk([[2021, 4]]) });
    expect(diff.values.A?.year).toBe(2023);
    expect(diff.values.B?.year).toBe(2021);
    expect(diff.issues.some((i) => i.check === 'year_mismatch')).toBe(true);
  });

  it('separates estimates from projections', () => {
    expect(wppQuality(2024, 2024)).toBe('ESTIMATE');
    expect(wppQuality(2025, 2024)).toBe('PROJECTION');
    expect(wppQuality(2025, 2024, true)).toBe('DERIVED');
  });
});
