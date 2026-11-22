import assert from 'node:assert/strict';
import test from 'node:test';
import { checklistUrl, filterLocations, hasRecentActivity, sortLocations } from '../public/locations.js';

test('map activity cutoff uses local calendar days and hides old, unknown, or invalid activity', () => {
  const now = Date.parse('2026-11-22T02:00:00Z');
  const zone = 'America/Los_Angeles';
  assert.equal(hasRecentActivity({ latestObsDt: '2026-11-07 08:00' }, now, zone), true);
  assert.equal(hasRecentActivity({ latestObsDt: '2026-11-06 23:59' }, now, zone), false);
  assert.equal(hasRecentActivity({ latestObsDt: '2026-11-21' }, now, zone), true);
  assert.equal(hasRecentActivity({ obsDt: '2026-11-20 08:00' }, now, zone), true);
  assert.equal(hasRecentActivity({ latestObsDt: '2026-11-01', obsDt: '2026-11-20' }, now, zone), false);
  for (const latestObsDt of [undefined, '', 'invalid', '2026-02-30', '2026-11-23']) {
    assert.equal(hasRecentActivity({ latestObsDt }, now, zone), false);
  }
});

test('recent species links use only valid returned checklist identifiers', () => {
  assert.equal(checklistUrl({ subId: 'S123456789' }), 'https://ebird.org/checklist/S123456789');
  assert.equal(checklistUrl({}), null);
  assert.equal(checklistUrl({ subId: 'https://example.com' }), null);
});

test('hotspot text search matches case-insensitive words and restores all results when cleared', () => {
  const places = [
    { locId: 'L1', locName: 'Union Bay Natural Area' },
    { locId: 'L2', locName: 'Union Bay--East Trail' },
    { locId: 'L3', locName: 'Other park' },
    { locId: 'L4' }
  ];
  assert.deepEqual(filterLocations(places, ' BAY union ').map(place => place.locId), ['L1', 'L2']);
  assert.deepEqual(filterLocations(places, 'natural').map(place => place.locId), ['L1']);
  assert.deepEqual(filterLocations(places, 'missing'), []);
  assert.deepEqual(filterLocations(places, '  '), places);
  assert.equal(places.length, 4);
});

test('personal priorities lead every sort while preserving each group ordering', () => {
  const places = [
    { locId: 'L1', latestObsDt: '2026-11-20', obsDt: '2026-11-20', distanceKm: 1 },
    { locId: 'L2', latestObsDt: '2026-11-10', obsDt: '2026-11-10', distanceKm: 10 },
    { locId: 'L3', latestObsDt: '2026-11-19', obsDt: '2026-11-19', distanceKm: 5 },
    { locId: 'L4', latestObsDt: '2026-11-09', obsDt: '2026-11-09', distanceKm: 20 }
  ];
  for (const mode of ['activity', 'recent', 'distance']) {
    assert.deepEqual(sortLocations(places, mode, ['L2', 'L4', 'L999']).map(place => place.locId), ['L2', 'L4', 'L1', 'L3']);
    assert.deepEqual(sortLocations(places, mode, []).map(place => place.locId), ['L1', 'L3', 'L2', 'L4']);
  }
  assert.equal(places[0].locId, 'L1');
});

test('activity sorting puts latest hotspot observations first, not species richness or distance', () => {
  const places = [
    { locId: 'L1', latestObsDt: '2026-11-10', distanceKm: 1, numSpeciesAllTime: 300 },
    { locId: 'L2', latestObsDt: '2026-11-20', distanceKm: 10, numSpeciesAllTime: 20 },
    { locId: 'L3', latestObsDt: '2026-11-20', distanceKm: 5 },
    { locId: 'L4', distanceKm: 0 }
  ];
  assert.deepEqual(sortLocations(places).map(place => place.locId), ['L3', 'L2', 'L1', 'L4']);
  assert.equal(places[0].locId, 'L1');
  assert.equal(sortLocations(places, 'distance')[0].locId, 'L4');
});

test('target report sorting remains independent of hotspot activity and handles missing dates', () => {
  const places = [
    { locId: 'L1', latestObsDt: '2026-11-20', obsDt: '2026-11-10 09:00', distanceKm: 1 },
    { locId: 'L2', latestObsDt: '2026-11-19', obsDt: '2026-11-19 09:00', distanceKm: 2 },
    { locId: 'L3', obsDt: '2026-11-18 09:00', distanceKm: 3 }
  ];
  assert.equal(sortLocations(places)[0].locId, 'L1');
  assert.equal(sortLocations(places, 'recent')[0].locId, 'L2');
  assert.deepEqual(sortLocations(places).map(place => place.locId), ['L1', 'L2', 'L3']);
});