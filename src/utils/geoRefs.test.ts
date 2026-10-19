import { describe, expect, it } from 'vitest';
import { divisionOf, divisionSuffix, dosmLevelFor, isDun, isParlimen, stateIdOf } from './geoRefs';

describe('Malaysia divisions', () => {
  it('tells districts, parlimen and DUN ids apart', () => {
    expect(divisionOf('MY-10-hulu-langat')).toBe('district');
    expect(divisionOf('MY-10-p094')).toBe('parlimen');
    expect(divisionOf('MY-10-n25')).toBe('dun');
    expect(isParlimen('MY-10-n25')).toBe(false);
    expect(isDun('MY-10-p094')).toBe(false);
    // a district whose slug starts with n or p is still a district
    expect(divisionOf('MY-05-nilai')).toBe('district');
    expect(divisionOf('MY-08-perak-tengah')).toBe('district');
  });

  it('maps each unit to its geometry file and DOSM file', () => {
    expect(divisionSuffix('district')).toBe('');
    expect(divisionSuffix('dun')).toBe('-dun');
    expect(dosmLevelFor({ id: 'MYS', level: 'country' })).toBe('national');
    expect(dosmLevelFor({ id: 'MY-10', level: 'admin1' })).toBe('admin1');
    expect(dosmLevelFor({ id: 'MY-10-hulu-langat', level: 'admin2' })).toBe('admin2');
    expect(dosmLevelFor({ id: 'MY-10-p102', level: 'admin2' })).toBe('parlimen');
    expect(dosmLevelFor({ id: 'MY-10-n25', level: 'admin2' })).toBe('dun');
  });

  it('finds the state in a DUN parent chain that runs through its parlimen', () => {
    expect(stateIdOf(['WORLD', 'UN_142', 'MYS', 'MY-10', 'MY-10-p102'])).toBe('MY-10');
    expect(stateIdOf(['WORLD', 'MYS'])).toBeUndefined();
  });
});
