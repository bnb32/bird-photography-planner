import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('changing location preserves the chosen date even across calendar-day boundaries', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('function selectPlace(place) {');
  const end = source.indexOf('  map.select(place);', start);
  assert.ok(start >= 0 && end > start);
  const state = { date: '2026-11-22', selectionVersion: 0 };
  const context = vm.createContext({ state, window: { tzlookup: () => 'America/Toronto' }, localDate: () => '2026-11-21', Date, message() {} });
  const body = source.slice(start, end) + '\n}';
  vm.runInContext(`${body}\nselectPlace({lat:49,lng:-123});`, context);
  assert.equal(state.date, '2026-11-22');
  state.date = null;
  vm.runInContext('selectPlace({lat:49,lng:-123});', context);
  assert.equal(state.date, '2026-11-21');
});