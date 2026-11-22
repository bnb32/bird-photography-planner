import { bearingEnd, sunPosition } from './light.js';
import { hasRecentActivity } from './locations.js';

export function createMap(center, onSelect, onMove, onSearch) {
  const map = L.map('map', { doubleClickZoom: false }).setView([center.lat, center.lng], 11);
  new ResizeObserver(() => map.invalidateSize({ pan: false, debounceMoveend: true })).observe(document.getElementById('map'));
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  const targets = L.layerGroup().addTo(map);
  const background = L.layerGroup();
  const solar = L.layerGroup().addTo(map);
  const selected = L.layerGroup().addTo(map);
  const searchCenter = L.circleMarker([center.lat, center.lng], { radius: 5, color: '#24332e', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).bindTooltip('Search center').addTo(map);
  const searchArea = L.circle([center.lat, center.lng], { radius: 25000, color: '#226149', weight: 1, fillOpacity: .02, dashArray: '5 5', interactive: false }).addTo(map);
  map.on('click', event => {
    const point = { lat: event.latlng.lat, lng: event.latlng.lng };
    onMove(point);
    onSelect({ ...point, locName: 'Custom point', custom: true });
  });
  map.on('dblclick', event => onSearch({ lat: event.latlng.lat, lng: event.latlng.lng, locName: 'Custom point', custom: true }));

  function searchMarker(marker, place) {
    marker.on('dblclick', event => { L.DomEvent.stopPropagation(event); onSearch(place); });
    return marker;
  }

  function tooltip(name) {
    const element = document.createElement('span');
    element.textContent = name;
    return element;
  }

  return {
    searchCenter(point) { searchCenter.setLatLng([point.lat, point.lng]); searchCenter.bringToFront(); },
    center(point) { map.setView([point.lat, point.lng], Math.max(11, map.getZoom())); },
    select(point) {
      selected.clearLayers();
      L.circleMarker([point.lat, point.lng], { radius: 9, color: '#ffffff', weight: 3, fillColor: '#366b9a', fillOpacity: 1, interactive: false }).addTo(selected);
      if (!map.getBounds().contains([point.lat, point.lng])) map.panTo([point.lat, point.lng]);
    },
    results(data, center, radius) {
      targets.clearLayers(); background.clearLayers();
      searchArea.setLatLng([center.lat, center.lng]).setRadius(radius * 1000);
      if (radius > 50) map.fitBounds(searchArea.getBounds(), { padding: [20, 20] });
      const targetIds = new Set(data.results.map(place => place.locId));
      const now = Date.now();
      const recent = place => hasRecentActivity(place, now, globalThis.window?.tzlookup?.(place.lat, place.lng) || 'UTC');
      for (const place of data.hotspots) {
        if (targetIds.has(place.locId) || !recent(place)) continue;
        searchMarker(L.circleMarker([place.lat, place.lng], { radius: 4, color: '#87958d', weight: 1, fillOpacity: .45 }).bindTooltip(tooltip(place.locName)).on('click', event => { L.DomEvent.stopPropagation(event); onSelect(place); }), place).addTo(background);
      }
      for (const place of data.results) {
        if (!recent(place)) continue;
        searchMarker(L.circleMarker([place.lat, place.lng], { radius: 6, color: '#fff', weight: 1.5, fillColor: '#226149', fillOpacity: .9 }).bindTooltip(tooltip(place.locName)).on('click', event => { L.DomEvent.stopPropagation(event); onSelect(place); }), place).addTo(targets);
      }
    },
    showHotspots(show) { if (show) background.addTo(map); else map.removeLayer(background); },
    light(point, times, instant) {
      solar.clearLayers();
      const length = Math.max(.4, Math.min(15, map.getBounds().getNorthEast().distanceTo(map.getBounds().getSouthWest()) / 6000));
      const draw = (moment, color, dashed, name) => {
        if (!moment) return;
        const position = sunPosition(moment, point.lat, point.lng);
        L.polyline([[point.lat, point.lng], bearingEnd(point.lat, point.lng, position.azimuth, length)], { color, weight: dashed ? 2 : 3, dashArray: dashed ? '6 5' : null, opacity: .95, interactive: false }).addTo(solar);
      };
      draw(times.sunrise, '#cb9a48', true, 'Toward sun at sunrise');
      draw(times.sunset, '#be574c', true, 'Toward sun at sunset');
      if (sunPosition(instant, point.lat, point.lng).altitude >= 0) draw(instant, '#bf790b', false, 'Toward sun at selected hour');
      selected.eachLayer(layer => layer.bringToFront());
    }
  };
}