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
    clearLayers() {}, eachLayer() {}, setLatLng() {}, setRadius() {}, bringToFront() {}
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
  globalThis.document = { getElementById: () => ({}) };
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
  } finally {
    Object.assign(globalThis, original);
  }
});