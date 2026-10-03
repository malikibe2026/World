// Dumps reference attributes (world-countries, IANA time zones) to data/work/reference
// so the Python steps can join them without a Node dependency at runtime.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = resolve(root, 'data/work/reference');
mkdirSync(out, { recursive: true });

const countries = JSON.parse(readFileSync(require.resolve('world-countries/countries.json'), 'utf8'));
const wcPkg = JSON.parse(readFileSync(require.resolve('world-countries/package.json'), 'utf8'));
const ct = require('countries-and-timezones');
const ctPkg = JSON.parse(readFileSync(resolve(dirname(require.resolve('countries-and-timezones')), '../package.json'), 'utf8'));

const tz = {};
for (const c of countries) {
  const info = ct.getCountry(c.cca2);
  if (!info) continue;
  tz[c.cca2] = info.timezones.map((name) => {
    const t = ct.getTimezone(name);
    return { name, utc: t?.utcOffsetStr ?? null, dst: t?.dstOffsetStr ?? null };
  });
}

writeFileSync(resolve(out, 'world-countries.json'), JSON.stringify({ version: wcPkg.version, countries }));
writeFileSync(resolve(out, 'timezones.json'), JSON.stringify({ version: ctPkg.version, timezones: tz }));
console.log(`reference: ${countries.length} countries (world-countries ${wcPkg.version}), tz for ${Object.keys(tz).length} (countries-and-timezones ${ctPkg.version})`);

// GeoNames populated places (population ≥ 1000) via the all-the-cities package (CC BY 4.0 GeoNames data).
const cities = require('all-the-cities');
const atcPkg = JSON.parse(readFileSync(require.resolve('all-the-cities/package.json'), 'utf8'));
const keep = cities
  .filter((c) => c.population >= 15000 && c.country !== 'MY')
  .map((c) => [c.cityId, c.name, c.country, c.featureCode, c.adminCode, c.population, c.loc.coordinates[0], c.loc.coordinates[1]]);
// Malaysia: the newer monthly GeoNames extract (cities.json: pop > 1000 or admin seats down to PPLA3)
// so that towns such as Kajang are searchable. Population is joined from all-the-cities where available.
const popByKey = new Map(cities.filter((c) => c.country === 'MY').map((c) => [c.name.toLowerCase(), c]));
const cjDir = resolve(here, '../node_modules/cities.json');
const cj = JSON.parse(readFileSync(resolve(cjDir, 'cities.json'), 'utf8'));
const cjPkg = JSON.parse(readFileSync(resolve(cjDir, 'package.json'), 'utf8'));
for (const c of cj) {
  if (c.country !== 'MY') continue;
  const lon = Number(c.lng), lat = Number(c.lat);
  const m = popByKey.get(c.name.toLowerCase());
  const near = m && Math.abs(m.loc.coordinates[0] - lon) < 0.1 && Math.abs(m.loc.coordinates[1] - lat) < 0.1;
  keep.push([near ? m.cityId : null, c.name, 'MY', near ? m.featureCode : null, c.admin1, near ? m.population : null, lon, lat]);
}
console.log(`reference: cities.json ${cjPkg.version} used for Malaysia`);
writeFileSync(resolve(out, 'geonames-places.json'), JSON.stringify({ version: atcPkg.version, fields: ['geonameid', 'name', 'country', 'feature_code', 'admin_code', 'population', 'lon', 'lat'], places: keep }));
console.log(`reference: ${keep.length} GeoNames places (all-the-cities ${atcPkg.version}; ≥15k globally, all ≥1k for MY)`);
