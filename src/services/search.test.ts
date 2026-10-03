import { describe, expect, it } from 'vitest';
import { norm, parseQuery } from './search';

describe('smart search query parsing', () => {
  it('detects statistic + location queries in English', () => {
    expect(parseQuery('population Malaysia')).toMatchObject({ indicator: 'population', locationText: 'malaysia' });
    expect(parseQuery('birth rate Japan')).toMatchObject({ indicator: 'cbr', locationText: 'japan' });
    expect(parseQuery('GDP per capita of Thailand')).toMatchObject({ indicator: 'gdp_per_capita', locationText: 'thailand' });
  });

  it('detects statistic + location queries in Malay', () => {
    expect(parseQuery('kadar kelahiran Jepun')).toMatchObject({ indicator: 'cbr', locationText: 'jepun' });
    expect(parseQuery('penduduk Selangor')).toMatchObject({ indicator: 'population', locationText: 'selangor' });
    expect(parseQuery('jangka hayat di Indonesia')).toMatchObject({ indicator: 'e0', locationText: 'indonesia' });
  });

  it('prefers the longest phrase', () => {
    expect(parseQuery('population density Singapore').indicator).toBe('density');
    expect(parseQuery('crude death rate Rwanda').indicator).toBe('cdr');
  });

  it('treats plain names as location / landmark queries', () => {
    expect(parseQuery('Mount Fuji')).toMatchObject({ indicator: null, locationText: 'mount fuji' });
    expect(parseQuery('Kuala Lumpur').indicator).toBeNull();
  });

  it('normalises accents and punctuation', () => {
    expect(norm('São Tomé & Príncipe')).toBe('sao tome principe');
  });
});
