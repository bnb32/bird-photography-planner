import assert from 'node:assert/strict';
import test from 'node:test';
import { createMap } from '../public/map.js';

test('selection and solar overlays cannot intercept the second click', () => {
  const markers = [];
  const rays = [];
  const handlers = {};
  const point = { lat: 47.68, lng: -122.25, locName: 'Test point' };
  const layer = () => ({
    addTo() { return this; }, bindTooltip() { return this; }, on() { return this; },
    clearLayers() {}, eachLayer() {}, setLatLng() { return this; }, setRadius() { return this; }, bringToFront() {}
  });
  const bounds = {
    contains: () => true,
    getNorthEast: () => ({ distanceTo: () => 6000 }),
    getSouthWest: () => ({})
  };
  const leafletMap = {
    setView() { return this; }, on(name, callback) { handlers[name] = callback; },
    getBounds: () => bounds, invalidateSize() {}
  };
  const original = { L: globalThis.L, document: globalThis.document, ResizeObserver: globalThis.ResizeObserver };
  globalThis.L = {
    map: () => leafletMap, tileLayer: layer, layerGroup: layer, circle: layer,
    circleMarker(position, options) { markers.push(options); return layer(); },
    polyline(position, options) { rays.push(options); return layer(); }
  };
  globalThis.document = { getElementById: () => ({}), createElement: () => ({}) };
  globalThis.ResizeObserver = class { observe() {} };
  try {
    let searched;
    const map = createMap(point, () => {}, () => {}, selected => { searched = selected; });
    map.select(point);
    map.light(point, { sunrise: new Date('2026-11-20T15:30:00Z'), sunset: new Date('2026-11-21T00:30:00Z') }, Date.parse('2026-11-20T20:00:00Z'));
    assert.equal(markers.at(-1).interactive, false);
    assert.ok(rays.length >= 2);
    assert.ok(rays.every(options => options.interactive === false));
    handlers.dblclick({ latlng: point });
    assert.equal(searched.lat, point.lat);
    assert.equal(searched.lng, point.lng);
    const today = new Date().toISOString().slice(0, 10);
    const fresh = { ...point, latestObsDt: today };
    const old = { ...point, latestObsDt: '2000-01-01' };
    const before = markers.length;
    map.results({
      results: [{ ...fresh, locId: 'L1' }, { ...old, locId: 'L2' }],
      hotspots: [{ ...fresh, locId: 'L3' }, { ...old, locId: 'L4' }, { ...point, locId: 'L5' }]
    }, point, 25);
    assert.equal(markers.length - before, 2);
    assert.equal(markers.at(-2).radius, 4);
    assert.equal(markers.at(-1).radius, 6);
  } finally {
    Object.assign(globalThis, original);
  }
});