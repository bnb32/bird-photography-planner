import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('search results preserve the selected point even when a different hotspot ranks first', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function search() {');
  const end = source.indexOf("element('search').addEventListener", start);
  assert.ok(start >= 0 && end > start);
  for (const results of [[], [{ locId: 'L1', locName: 'Olympic Sculpture Park', lat: 47.616, lng: -122.355, distanceKm: 1 }]]) {
    const selected = { lat: 47.7, lng: -122.2, locName: 'Custom point', custom: true };
    const state = { selected, center: { lat: selected.lat, lng: selected.lng }, taxonomy: [], searchVersion: 0 };
    const fields = new Map();
    const element = id => {
      if (!fields.has(id)) fields.set(id, {
        value: id === 'bird' ? '' : id === 'sort' ? 'activity' : id === 'radius' ? '25' : '14',
        checkValidity: () => true, querySelector: () => ({})
      });
      return fields.get(id);
    };
    let selections = 0;
    let renders = 0;
    const context = vm.createContext({
      state, element, AbortController, message() {}, persist() {}, text() {},
      api: async () => ({ results, hotspots: [], truncated: false }),
      map: { results() {} }, renderResults() { renders++; },
      selectPlace(place) { selections++; state.selected = place; }
    });
    await vm.runInContext(`${source.slice(start, end)}\nsearch();`, context);
    assert.equal(state.selected, selected);
    assert.equal(selections, 0);
    assert.equal(renders, 1);
    assert.equal(state.results, results);
    assert.equal(element('search').disabled, false);
  }
});