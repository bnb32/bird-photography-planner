import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviders } from '../providers.mjs';

test('nationwide hotspot lookup ignores radius/species, searches both countries, and caches inventories', async () => {
  const calls = [];
  const provider = createProviders({ key: 'test', fetcher: async url => {
    calls.push(url);
    const country = new URL(url).pathname.split('/').pop();
    return { ok: true, json: async () => [{ locId: country === 'US' ? 'L1' : 'L2', locName: `${country} Union Bay`, countryCode: country, lat: 49, lng: -123 }] };
  } });
  const first = await provider.route('/api/hotspots', new URLSearchParams('q=union+bay&radius=1&species=baleag'));
  assert.equal(first.total, 2);
  assert.equal(first.results.length, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(url => !url.includes('radius') && !url.includes('species')));
  const second = await provider.route('/api/hotspots', new URLSearchParams('q=CA+union'));
  assert.equal(second.results[0].locId, 'L2');
  assert.equal(calls.length, 2);
  await assert.rejects(provider.route('/api/hotspots', new URLSearchParams('q=a')), /between 2 and 100/);
});