import { describe, expect, it } from 'vitest';
import { EXPORT_COLUMNS, toCSV, type ExportRow } from './export';

const row: ExportRow = {
  location: 'Malaysia', location_id: 'MYS', geographic_level: 'country', indicator: 'Total population', indicator_code: 'population',
  value: 35344242, unit: 'persons', reference_year: 2024, reference_period: '2024-01-01', quality: 'ESTIMATE',
  source: 'United Nations, DESA, Population Division — World Population Prospects 2024', source_url: 'https://population.un.org/wpp/',
  last_updated: '2024-07-11', methodology_notes: 'De facto population, "1 January"',
};

describe('exports', () => {
  it('always includes the provenance columns required by the spec', () => {
    for (const c of ['location', 'indicator', 'value', 'unit', 'reference_year', 'source', 'last_updated'] as const) {
      expect(EXPORT_COLUMNS).toContain(c);
    }
  });

  it('writes RFC-4180 CSV with a UTF-8 BOM and escaped quotes/commas', () => {
    const csv = toCSV([row]);
    expect(csv.startsWith('﻿')).toBe(true);
    const [header, line] = csv.slice(1).trim().split('\r\n');
    expect(header.split(',')).toEqual(EXPORT_COLUMNS);
    expect(line).toContain('"United Nations, DESA, Population Division — World Population Prospects 2024"');
    expect(line).toContain('"De facto population, ""1 January"""');
  });

  it('leaves missing values empty instead of inventing them', () => {
    const csv = toCSV([{ ...row, value: null }]);
    expect(csv.split('\r\n')[1].split(',')[5]).toBe('');
  });
});
