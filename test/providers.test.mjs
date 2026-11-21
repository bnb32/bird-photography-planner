import assert from 'node:assert/strict';
import test from 'node:test';
import { coordinates, numberParam, matchHotspots, distanceKm, searchAreas, createProviders } from '../providers.mjs';

test('query validation rejects invalid coordinates and radius', () => {
  assert.throws(() => coordinates(new URLSearchParams('lat=&lng=-120')), /lat/);
  assert.throws(() => coordinates(new URLSearchParams('lat=90&lng=-120')), /lat/);
  assert.throws(() => numberParam(new URLSearchParams('radius=51'), 'radius', 1, 50), /radius/);
  assert.deepEqual(coordinates(new URLSearchParams('lat=49&lng=-123')), { lat: 49, lng: -123 });
});

test('large searches cover the requested circle using overlapping 50 km queries', () => {
  for (const center of [{ lat: 49, lng: -123 }, { lat: 84, lng: -170 }]) {
    for (const radius of [51, 100, 250]) {
      const areas = searchAreas(center, radius);
      assert.ok(areas.length > 1 && areas.length < 100);
      assert.ok(areas.every(area => area.dist === 50));
      for (let latitudeOffset = -3; latitudeOffset <= 3; latitudeOffset += .1) {
        for (let longitudeOffset = -25; longitudeOffset <= 25; longitudeOffset += .5) {
          const point = { lat: center.lat + latitudeOffset, lng: center.lng + longitudeOffset };
          if (distanceKm(center, point) <= radius) assert.ok(areas.some(area => distanceKm(area, point) <= 50), 'Uncovered point in search circle');
        }
      }
    }
  }
});

test('large searches deduplicate hotspots, filter boundaries, and preserve latest species reports', async () => {
  const hotspots = [
    { locId: 'L1', locName: 'Inside', lat: 49, lng: -123, countryCode: 'CA' },
    { locId: 'L2', locName: 'Outside', lat: 52, lng: -123, countryCode: 'CA' }
  ];
  let active = 0;
  let maximum = 0;
  const provider = createProviders({ key: 'test', fetcher: async url => {
    active++; maximum = Math.max(maximum, active);
    assert.ok(Number(new URL(url).searchParams.get('dist')) <= 50);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return { ok: true, json: async () => url.includes('/data/obs/') ? [{ locId: 'L1', obsDt: '2026-11-20 08:00', comName: 'Bald Eagle' }] : hotspots };
  } });
  for (const species of ['', '&species=baleag']) {
    const data = await provider.route('/api/search', new URLSearchParams(`lat=49&lng=-123&radius=250${species}`));
    assert.deepEqual(data.results.map(place => place.locId), ['L1']);
    assert.equal(data.hotspots.length, 1);
    assert.ok(data.areas > 1);
    if (species) assert.equal(data.results[0].obsDt, '2026-11-20 08:00');
  }
  assert.ok(maximum <= 4);
  await assert.rejects(provider.route('/api/search', new URLSearchParams('lat=49&lng=-123&radius=251')), /radius/);
});

test('matches exact hotspot IDs, latest reports, and US/Canada only', () => {
  const hotspots = [
    { locId: 'L1', locName: 'Park', lat: 49, lng: -123, countryCode: 'CA' },
    { locId: 'L2', locName: 'Park', lat: 49, lng: -123, countryCode: 'MX' }
  ];
  const observations = [
    { locId: 'L1', obsDt: '2026-11-19 08:00', howMany: 2 },
    { locId: 'L1', obsDt: '2026-11-20 08:00' },
    { locId: 'L2', obsDt: '2026-11-20 08:00' },
    { locId: 'L3', obsDt: '2026-11-20 08:00' }
  ];
  const results = matchHotspots(observations, hotspots, { lat: 49, lng: -123 });
  assert.equal(results.length, 1);
  assert.equal(results[0].obsDt, '2026-11-20 08:00');
  assert.equal(results[0].howMany, null);
  assert.equal(results[0].distanceKm, 0);
  assert.ok(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) > 111);
});

test('location-first search fetches only hotspots and sorts US/Canada locations by distance', async () => {
  const urls = [];
  const hotspots = [
    { locId: 'L1', locName: 'Far park', lat: 49.1, lng: -123, countryCode: 'CA' },
    { locId: 'L2', locName: 'Near park', lat: 49, lng: -123, countryCode: 'US' },
    { locId: 'L3', locName: 'Excluded', lat: 49, lng: -123, countryCode: 'MX' }
  ];
  const provider = createProviders({ key: 'test', fetcher: async url => {
    urls.push(new URL(url));
    return { ok: true, json: async () => hotspots };
  } });
  for (const suffix of ['', '&species=']) {
    const data = await provider.route('/api/search', new URLSearchParams(`lat=49&lng=-123${suffix}`));
    assert.deepEqual(data.results.map(place => place.locId), ['L2', 'L1']);
    assert.equal(data.results[0].distanceKm, 0);
    assert.equal(data.results[0].obsDt, undefined);
    assert.equal(data.hotspots.length, 2);
    assert.equal(data.truncated, false);
  }
  assert.equal(urls.length, 1);
  assert.equal(urls[0].pathname, '/v2/ref/hotspot/geo');
  await assert.rejects(provider.route('/api/search', new URLSearchParams('lat=49&lng=-123&species=bad!')), /Choose a target species/);
});

test('missing key does not block weather; credentials are only in eBird headers', async () => {
  const urls = [];
  const fetcher = async (url, options) => {
    urls.push({ url, options });
    return { ok: true, json: async () => ({ timezone: 'America/Vancouver' }) };
  };
  const provider = createProviders({ key: '', fetcher });
  await assert.rejects(provider.route('/api/taxonomy', new URLSearchParams()), /EBIRD_API_KEY/);
  const weather = await provider.route('/api/weather', new URLSearchParams('lat=49&lng=-123'));
  assert.equal(weather.timezone, 'America/Vancouver');
  assert.deepEqual(urls[0].options.headers, {});
});

test('cache deduplicates requests, expires, and reports safe auth errors', async () => {
  let calls = 0;
  let clock = 0;
  const provider = createProviders({ key: 'test-key', now: () => clock, fetcher: async (url, options) => {
    calls++;
    assert.ok(!url.includes('test-key'));
    assert.equal(options.headers['x-ebirdapitoken'], 'test-key');
    return { ok: true, json: async () => [] };
  } });
  await Promise.all([provider.route('/api/taxonomy', new URLSearchParams()), provider.route('/api/taxonomy', new URLSearchParams())]);
  assert.equal(calls, 1);
  clock = 86400001;
  await provider.route('/api/taxonomy', new URLSearchParams());
  assert.equal(calls, 2);
  const rejected = createProviders({ key: 'secret', fetcher: async () => ({ ok: false, status: 403 }) });
  await assert.rejects(rejected.route('/api/taxonomy', new URLSearchParams()), /rejected the API key/);
});

test('empty searches, null weather, and provider failures remain explicit', async () => {
  const empty = createProviders({ key: 'test', fetcher: async () => ({ ok: true, json: async () => [] }) });
  const result = await empty.route('/api/search', new URLSearchParams('lat=49&lng=-123&species=baleag'));
  assert.deepEqual(result.results, []);
  assert.equal(result.truncated, false);
  const weather = createProviders({ fetcher: async () => ({ ok: true, json: async () => ({ hourly: { temperature_2m: [null] } }) }) });
  assert.equal((await weather.route('/api/weather', new URLSearchParams('lat=49&lng=-123'))).hourly.temperature_2m[0], null);
  const throttled = createProviders({ key: 'test', fetcher: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(throttled.route('/api/taxonomy', new URLSearchParams()), /rate limiting/);
  const offline = createProviders({ fetcher: async () => { throw new Error('secret upstream detail'); } });
  await assert.rejects(offline.route('/api/weather', new URLSearchParams('lat=49&lng=-123')), /could not be reached/);
});