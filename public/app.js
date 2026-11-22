import { createMap } from './map.js';
import { activityDate, checklistUrl, sortLocations } from './locations.js';
import { localDate, dayHours, lightForDay, sunPosition, nearestHour, formatTime, compass } from './light.js';

const element = id => document.getElementById(id);
const icons = () => window.lucide?.createIcons();
const text = (id, value) => { element(id).textContent = value; };
function load(name, fallback) { try { return JSON.parse(localStorage.getItem(name)) ?? fallback; } catch { return fallback; } }
function store(name, value) { try { localStorage.setItem(name, JSON.stringify(value)); } catch {} }
const preferences = load('fieldlight.preferences', {});
const state = {
  center: preferences.center || { lat: 47.68, lng: -122.25 },
  species: preferences.species || null,
  taxonomy: [], results: [], selected: null, weather: null, hours: [], times: null,
  zone: 'America/Los_Angeles', date: null, selectionVersion: 0, searchVersion: 0,
  saved: load('fieldlight.saved', []), notes: load('fieldlight.notes', {}), weatherController: null,
  priorities: load('fieldlight.priorities', []),
  priorityPlaces: load('fieldlight.priorityPlaces', {}), locationView: 'nearby',
  searchController: null, units: preferences.units || 'imperial'
};

function message(value = '') { text('global-message', value); element('global-message').hidden = !value; }
function persist() { store('fieldlight.preferences', { center: state.center, species: state.species, units: state.units, radius: element('radius').value, back: element('lookback').value }); }
async function api(path, params = {}, signal) {
  const response = await fetch(`${path}?${new URLSearchParams(params)}`, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request failed.');
  return data;
}
function node(tag, content, className) {
  const result = document.createElement(tag);
  if (content !== undefined) result.textContent = content;
  if (className) result.className = className;
  return result;
}
function iconButton(name, label) {
  const button = node('button', undefined, 'icon-button');
  button.title = label; button.setAttribute('aria-label', label);
  const icon = document.createElement('i'); icon.dataset.lucide = name; button.append(icon);
  return button;
}
function placeKey(place) { return place.locId || `${place.lat.toFixed(5)},${place.lng.toFixed(5)}`; }
function updateCenter(center) {
  state.center = center;
  map.searchCenter(center);
  text('center-label', `${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}`);
  persist();
}
function searchPlace(place) {
  updateCenter({ lat: place.lat, lng: place.lng });
  if (!state.selected || placeKey(state.selected) !== placeKey(place)) selectPlace(place);
  search();
}
const map = createMap(state.center, selectPlace, updateCenter, searchPlace);
updateCenter(state.center);
element('bird').value = state.species?.comName || '';
element('radius').value = preferences.radius || 25;
element('lookback').value = preferences.back || 14;
element('units').value = state.units;

const priorityButton = iconButton('star', 'Prioritize hotspot');
priorityButton.id = 'priority'; priorityButton.disabled = true;
element('save').before(priorityButton);
function updatePriorityButton() {
  const prioritized = state.priorities.includes(state.selected?.locId);
  priorityButton.disabled = !state.selected?.locId;
  priorityButton.setAttribute('aria-pressed', String(prioritized));
  priorityButton.title = prioritized ? 'Remove hotspot priority' : state.selected?.locId ? 'Prioritize hotspot' : 'Select a hotspot to prioritize';
  priorityButton.setAttribute('aria-label', priorityButton.title);
  priorityButton.classList.toggle('prioritized', prioritized);
}
function rememberPriority(place) {
  if (!place?.locId || !state.priorities.includes(place.locId)) return;
  const { locId, locName, lat, lng, countryCode, subnational1Code, latestObsDt } = place;
  state.priorityPlaces[locId] = { locId, locName, lat, lng, countryCode, subnational1Code, latestObsDt };
  store('fieldlight.priorityPlaces', state.priorityPlaces);
}
function togglePriority(id, place) {
  if (!id) return;
  state.priorities = state.priorities.includes(id) ? state.priorities.filter(priority => priority !== id) : [...state.priorities, id];
  store('fieldlight.priorities', state.priorities);
  rememberPriority(place);
  updatePriorityButton(); renderResults();
  for (const button of element('hotspot-name-results').querySelectorAll('.list-priority')) updateListPriority(button);
}
priorityButton.addEventListener('click', () => togglePriority(state.selected?.locId, state.selected));
function updateListPriority(button) {
  const prioritized = state.priorities.includes(button.dataset.hotspotId);
  button.classList.toggle('prioritized', prioritized);
  button.setAttribute('aria-pressed', String(prioritized));
  button.title = `${prioritized ? 'Remove priority from' : 'Prioritize'} ${button.dataset.hotspotName}`;
  button.setAttribute('aria-label', button.title);
}
function priorityRow(place, locationButton) {
  const row = node('div', undefined, 'result-row');
  const star = iconButton('star', `Prioritize ${place.locName}`);
  star.type = 'button'; star.classList.add('list-priority');
  star.dataset.hotspotId = place.locId; star.dataset.hotspotName = place.locName;
  updateListPriority(star);
  star.addEventListener('click', event => { event.stopPropagation(); togglePriority(place.locId, place); });
  star.addEventListener('dblclick', event => event.stopPropagation());
  row.append(locationButton, star);
  return row;
}

const layout = load('fieldlight.layout', {});
const workspace = document.querySelector('.workspace');
function applyLayout() {
  const width = workspace.clientWidth;
  const desktop = width > 1150;
  const conditions = Math.max(280, Math.min(Number(layout.conditions) || (width >= 1700 ? 370 : 330), width - 500));
  const locations = Math.max(200, Math.min(Number(layout.locations) || (width >= 1700 ? 320 : desktop ? 280 : 250), width - (desktop ? conditions : 0) - 300));
  workspace.style.setProperty('--locations-width', `${locations}px`);
  workspace.style.setProperty('--conditions-width', `${conditions}px`);
  if (Number.isFinite(layout.height)) element('map').style.setProperty('--map-height', `${Math.max(240, Math.min(1200, layout.height))}px`);
}
function addResizeHandle(container, axis, label) {
  const handle = node('button', undefined, `resize-handle ${axis === 'height' ? 'height-resize' : 'column-resize'}`);
  handle.type = 'button'; handle.title = label; handle.setAttribute('aria-label', label);
  const measure = () => axis === 'height' ? element('map').getBoundingClientRect().height : container.getBoundingClientRect().width;
  const change = value => {
    const width = workspace.clientWidth;
    const maximum = axis === 'height' ? 1200 : width - 300 - (axis === 'conditions' ? document.querySelector('.locations').clientWidth : width > 1150 ? document.querySelector('.conditions').clientWidth : 0);
    layout[axis] = Math.max(axis === 'height' ? 240 : axis === 'conditions' ? 280 : 200, Math.min(maximum, value));
    applyLayout();
  };
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); handle.setPointerCapture(event.pointerId);
    const start = axis === 'height' ? event.clientY : event.clientX;
    const original = measure();
    document.body.classList.add('resizing');
    const move = event => change(original + ((axis === 'height' ? event.clientY : event.clientX) - start) * (axis === 'conditions' ? -1 : 1));
    const finish = () => {
      document.body.classList.remove('resizing'); store('fieldlight.layout', layout);
      handle.removeEventListener('pointermove', move); handle.removeEventListener('lostpointercapture', finish);
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('lostpointercapture', finish);
  });
  handle.addEventListener('keydown', event => {
    const directions = axis === 'height' ? { ArrowUp: -1, ArrowDown: 1 } : { ArrowLeft: axis === 'conditions' ? 1 : -1, ArrowRight: axis === 'conditions' ? -1 : 1 };
    if (!(event.key in directions)) return;
    event.preventDefault(); change(measure() + directions[event.key] * (event.shiftKey ? 50 : 10)); store('fieldlight.layout', layout);
  });
  handle.addEventListener('dblclick', () => {
    delete layout[axis];
    if (axis === 'height') element('map').style.removeProperty('--map-height');
    applyLayout(); store('fieldlight.layout', layout);
  });
  if (axis === 'height') element('map').after(handle); else container.append(handle);
}
addResizeHandle(document.querySelector('.locations'), 'locations', 'Resize locations column');
addResizeHandle(document.querySelector('.conditions'), 'conditions', 'Resize location info column');
addResizeHandle(document.querySelector('.map-column'), 'height', 'Resize map height');
window.addEventListener('resize', applyLayout);
applyLayout();

function speciesSuggestions() {
  const query = element('bird').value.trim().toLowerCase();
  const matches = state.taxonomy.filter(bird => bird.comName.toLowerCase().includes(query) || bird.sciName.toLowerCase().includes(query)).slice(0, 15);
  element('bird-options').replaceChildren(...matches.map(bird => { const option = node('option'); option.value = bird.comName; option.label = bird.sciName; return option; }));
}
element('bird').addEventListener('input', speciesSuggestions);
element('clear-bird').addEventListener('click', () => {
  element('bird').value = ''; speciesSuggestions(); element('bird').focus(); search();
});
element('bird-form').addEventListener('submit', event => { event.preventDefault(); search(); });

let placeRequest = 0;
element('place-form').addEventListener('submit', async event => {
  event.preventDefault();
  const version = ++placeRequest;
  const container = element('place-results');
  container.hidden = false; container.replaceChildren(node('p', 'Finding places...', 'empty-message'));
  try {
    const places = await api('/api/geocode', { q: element('place').value });
    if (version !== placeRequest) return;
    container.replaceChildren(...places.map(place => {
      const button = node('button', `${place.name}, ${place.admin1 || place.country} (${place.country_code})`);
      button.addEventListener('click', () => {
        const point = { lat: place.latitude, lng: place.longitude };
        map.center(point); updateCenter(point); container.hidden = true;
        element('place').value = `${place.name}, ${place.admin1 || place.country}`;
        selectPlace({ ...point, locName: place.name, custom: true });
      });
      return button;
    }));
    if (!places.length) container.append(node('p', 'No US or Canadian places found.', 'empty-message'));
  } catch (error) { if (version === placeRequest) container.replaceChildren(node('p', error.message, 'empty-message')); }
});
document.addEventListener('click', event => { if (!element('place-form').contains(event.target)) element('place-results').hidden = true; });

async function search() {
  const query = element('bird').value.trim().toLowerCase();
  const bird = query ? state.taxonomy.find(bird => bird.comName.toLowerCase() === query) : null;
  if (query && !bird) { message(state.taxonomy.length ? 'Choose a target bird from the suggestions, or clear it to browse hotspots.' : 'Species list is unavailable. Clear the bird to browse hotspots, or select a map point for weather and light.'); return; }
  if (!element('radius').checkValidity()) { element('radius').reportValidity(); return; }
  state.species = bird; persist(); message();
  const version = ++state.searchVersion;
  state.searchController?.abort(); state.searchController = new AbortController();
  const center = { ...state.center };
  const radius = element('radius').value;
  const back = element('lookback').value;
  element('search').disabled = true;
  text('results-message', Number(radius) > 50 ? `Searching ${radius} km using overlapping areas; this may take a while...` : bird ? `Searching for ${bird.comName}...` : 'Finding nearby hotspots...'); element('results-message').hidden = false;
  try {
    const data = await api('/api/search', { ...center, ...(bird ? { species: bird.speciesCode } : {}), radius, back }, state.searchController.signal);
    if (version !== state.searchVersion) return;
    state.results = data.results;
    map.results(data, center, radius);
    const recentOption = element('sort').querySelector('[value="recent"]');
    recentOption.disabled = !bird; recentOption.hidden = !bird;
    if (!bird && element('sort').value === 'recent') element('sort').value = 'activity';
    text('result-legend', bird ? 'Target reports' : 'Hotspots');
    text('search-summary', bird ? `${bird.comName} · ${radius} km · last ${back} days` : `Nearby hotspots · ${radius} km`);
    text('result-count', String(data.results.length));
    text('results-message', data.results.length ? '' : bird ? 'No matching recent hotspot reports in this area.' : 'No hotspots returned in this area.');
    element('results-message').hidden = data.results.length > 0;
    renderResults();
    if (state.locationView === 'preferred') element('results-message').hidden = true;
    if (data.truncated) message('An eBird query area reached its 1,000-record limit; results may be incomplete. Try a smaller radius or shorter lookback.');
  } catch (error) {
    if (version !== state.searchVersion || error.name === 'AbortError') return;
    text('results-message', error.message); element('results-message').hidden = false;
    text('search-summary', state.results.length ? 'Showing previous search results' : 'Search unavailable');
  } finally { if (version === state.searchVersion) element('search').disabled = false; }
}
element('search').addEventListener('click', search);
element('sort').addEventListener('change', renderResults);
let recoveringPriorities = false;
async function showLocationView(view) {
  state.locationView = view;
  for (const name of ['nearby', 'preferred']) element(`${name}-tab`).setAttribute('aria-selected', String(name === view));
  element('search-summary').hidden = view === 'preferred';
  element('results-message').hidden = view === 'preferred' || Boolean(state.results.length);
  renderResults();
  if (view !== 'preferred' || recoveringPriorities) return;
  const missing = state.priorities.filter(id => !state.priorityPlaces[id]?.locName);
  if (!missing.length) return;
  recoveringPriorities = true;
  text('preferred-status', 'Loading details for previously preferred hotspots...');
  try {
    for (let offset = 0; offset < missing.length; offset += 500) {
      const data = await api('/api/hotspots', { ids: missing.slice(offset, offset + 500).join(',') });
      data.results.forEach(rememberPriority);
    }
    if (state.locationView === 'preferred') renderResults();
  } catch (error) {
    if (state.locationView === 'preferred') text('preferred-status', `Some hotspot details are unavailable. ${error.message}`);
  } finally { recoveringPriorities = false; }
}
for (const view of ['nearby', 'preferred']) {
  element(`${view}-tab`).addEventListener('click', () => showLocationView(view));
  element(`${view}-tab`).addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); const next = view === 'nearby' ? 'preferred' : 'nearby';
    element(`${next}-tab`).focus(); showLocationView(next);
  });
}
let hotspotTimer;
let hotspotVersion = 0;
let hotspotController;
element('hotspot-query').addEventListener('input', () => {
  clearTimeout(hotspotTimer); hotspotController?.abort();
  const version = ++hotspotVersion;
  const query = element('hotspot-query').value.trim();
  element('hotspot-name-results').replaceChildren();
  element('hotspot-match-status').hidden = !query;
  if (query.length < 2) { text('hotspot-match-status', 'Enter at least two characters.'); return; }
  text('hotspot-match-status', 'Searching US and Canadian hotspots...');
  hotspotTimer = setTimeout(async () => {
    hotspotController = new AbortController();
    try {
      const data = await api('/api/hotspots', { q: query }, hotspotController.signal);
      if (version !== hotspotVersion) return;
      text('hotspot-match-status', data.total ? `${data.results.length} of ${data.total} matches${data.total > data.results.length ? '; refine the name' : ''}` : 'No matching hotspots in the US or Canada.');
      element('hotspot-name-results').replaceChildren(...data.results.map(place => {
        const button = node('button', undefined, 'result-item');
        button.append(node('span', place.locName, 'result-name'), node('span', `${place.subnational1Code || place.countryCode} · ${place.countryCode}`, 'result-date'));
        button.addEventListener('click', () => {
          map.center(place); updateCenter({ lat: place.lat, lng: place.lng }); selectPlace(place);
        });
        button.addEventListener('dblclick', () => searchPlace(place));
        return priorityRow(place, button);
      }));
      icons();
    } catch (error) {
      if (version === hotspotVersion && error.name !== 'AbortError') text('hotspot-match-status', error.message);
    }
  }, 350);
});
element('clear-hotspot-query').addEventListener('click', () => {
  clearTimeout(hotspotTimer); hotspotVersion++; hotspotController?.abort();
  element('hotspot-query').value = ''; element('hotspot-name-results').replaceChildren();
  element('hotspot-match-status').hidden = true; element('hotspot-query').focus();
});
element('show-hotspots').addEventListener('change', event => map.showHotspots(event.target.checked));
element('locate').addEventListener('click', () => {
  if (!navigator.geolocation) { message('Location services are unavailable. Search for a town instead.'); return; }
  navigator.geolocation.getCurrentPosition(position => {
    const point = { lat: position.coords.latitude, lng: position.coords.longitude };
    if (point.lat < 24 || point.lat > 84 || point.lng < -180 || point.lng > -50) { message('This version searches US and Canadian areas.'); return; }
    map.center(point); updateCenter(point); selectPlace({ ...point, custom: true, locName: 'Current location' });
  }, () => message('Location access was unavailable. Search for a town instead.'), { timeout: 15000 });
});

function renderResults() {
  state.results.forEach(rememberPriority);
  const preferred = state.locationView === 'preferred';
  const source = preferred ? state.priorities.map(id => state.priorityPlaces[id] || { locId: id, locName: `Hotspot ${id}`, unresolved: true }) : state.results;
  const mode = preferred && element('sort').value === 'recent' ? 'activity' : element('sort').value;
  const results = sortLocations(source.map(place => preferred ? { ...place, distanceKm: Number.isFinite(place.lat) && Number.isFinite(place.lng) ? distanceFromCenter(place) : Infinity } : place), mode, state.priorities);
  element('preferred-status').hidden = !preferred;
  if (preferred) text('preferred-status', !results.length ? 'No preferred hotspots yet. Star a hotspot in either search list.' : results.some(place => place.unresolved) ? 'Some hotspot details are unavailable; you can still remove their stars.' : `${results.length} preferred hotspots · all locations`);
  text('result-count', String(results.length));
  element('results').replaceChildren(...results.map(place => {
    const active = state.selected && placeKey(place) === placeKey(state.selected);
    const button = node('button', undefined, `result-item${active ? ' active' : ''}`);
    button.dataset.placeKey = placeKey(place);
    button.setAttribute('aria-pressed', String(Boolean(active)));
    button.append(node('span', place.locName, 'result-name'), node('span', place.obsDt ? `Reported ${place.obsDt} local` : activityDate(place) ? `Last active ${activityDate(place)} local` : 'Activity date unavailable', 'result-date'));
    const bottom = node('span', undefined, 'result-bottom');
    bottom.append(node('span', place.obsDt ? place.howMany == null ? 'Count not reported' : `${place.howMany} reported` : place.subnational1Code || place.countryCode, 'bird-count'), node('span', Number.isFinite(place.distanceKm) ? `${place.distanceKm.toFixed(1)} km` : 'Details unavailable'));
    button.disabled = Boolean(place.unresolved);
    button.append(bottom); button.addEventListener('click', () => {
      if (preferred) { map.center(place); updateCenter({ lat: place.lat, lng: place.lng }); }
      if (!state.selected || placeKey(state.selected) !== placeKey(place)) selectPlace(place);
    });
    button.addEventListener('dblclick', () => searchPlace(place));
    return priorityRow(place, button);
  }));
  icons();
}

function distanceFromCenter(place) {
  const radians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = radians(place.lat - state.center.lat);
  const longitudeDelta = radians(place.lng - state.center.lng);
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(state.center.lat)) * Math.cos(radians(place.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, value)));
}

function selectPlace(place) {
  state.selected = place; state.weather = null;
  const version = ++state.selectionVersion;
  state.weatherController?.abort();
  try { state.zone = window.tzlookup(place.lat, place.lng); } catch { message('Could not determine the time zone at this point.'); return; }
  state.date ??= localDate(Date.now(), state.zone);
  map.select(place);
  for (const button of element('results').querySelectorAll('.result-item')) {
    const active = button.dataset.placeKey === placeKey(place);
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  }
  text('location-name', place.locName);
  text('location-meta', `${place.custom ? 'Custom point' : 'eBird hotspot'} · ${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`);
  text('location-report', place.obsDt ? `${place.comName}: ${place.howMany ?? 'count not reported'} · ${place.obsDt} local` : place.custom ? 'Nearby hotspot reports are separate from this point.' : 'Recent species reports are listed below.');
  element('ebird-link').hidden = !place.locId;
  if (place.locId) element('ebird-link').href = `https://ebird.org/hotspot/${encodeURIComponent(place.locId)}`;
  element('map-link').hidden = false;
  element('map-link').href = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  element('notes').disabled = false; element('notes').value = state.notes[placeKey(place)] || '';
  element('save').disabled = false; element('refresh').disabled = false;
  updateSaveButton();
  updatePriorityButton();
  populateDates(); setDay(true); fetchWeather(version);
  text('other-species', place.locId ? 'Loading recent reports...' : 'Select a hotspot to see its recent reports.');
  if (place.locId) api('/api/location', { id: place.locId }).then(birds => {
    if (version !== state.selectionVersion) return;
    const others = birds;
    element('other-species').replaceChildren(...others.slice(0, 12).map(bird => {
      const href = checklistUrl(bird);
      const row = node(href ? 'a' : 'div', undefined, 'species-row');
      if (href) {
        row.href = href; row.target = '_blank'; row.rel = 'noopener noreferrer';
        row.title = `Latest reported checklist including ${bird.comName}`;
      }
      row.append(node('span', bird.comName), node('span', bird.obsDt.split(' ')[0]));
      return row;
    }));
    if (!others.length) text('other-species', 'No recent reports returned.');
    else if (others.length > 12) element('other-species').append(node('p', `${others.length - 12} more in eBird`, 'muted'));
  }).catch(error => { if (version === state.selectionVersion) text('other-species', error.message); });
}

function populateDates() {
  let dates;
  if (state.weather) dates = [...new Set(state.weather.hourly.time.map(time => localDate(time * 1000, state.zone)))];
  else {
    const today = localDate(Date.now(), state.zone);
    dates = Array.from({ length: 7 }, (_, index) => new Date(Date.parse(`${today}T12:00:00Z`) + index * 86400000).toISOString().slice(0, 10));
  }
  if (!state.date) state.date = dates[0];
  if (!dates.includes(state.date)) dates = [...dates, state.date].sort();
  element('date').replaceChildren(...dates.map(date => {
    const option = node('option', new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)));
    option.value = date; return option;
  }));
  element('date').value = state.date; element('date').disabled = false;
}

function setDay(resetTime = false) {
  if (!state.selected) return;
  const previous = state.hours[Number(element('time').value)];
  const place = state.selected;
  state.hours = dayHours(state.date, state.zone);
  state.times = lightForDay(state.date, state.zone, place.lat, place.lng);
  element('time').max = state.hours.length - 1; element('time').disabled = false;
  const target = resetTime ? Number(state.times.sunrise || state.hours[8]) + 1800000 : previous || state.hours[8];
  element('time').value = nearestHour(state.hours, target);
  renderHours(); updateTime();
}
element('date').addEventListener('change', () => { state.date = element('date').value; setDay(true); });
element('time').addEventListener('input', updateTime);
element('morning').addEventListener('click', () => jumpTo(state.times?.sunrise));
element('evening').addEventListener('click', () => jumpTo(state.times?.goldenHour));
function jumpTo(moment) { if (!moment) return; element('time').value = nearestHour(state.hours, Number(moment) + 1800000); updateTime(); }

function renderHours() {
  element('hours').replaceChildren(...state.hours.map((instant, index) => {
    const position = sunPosition(instant, state.selected.lat, state.selected.lng);
    const weatherIndex = state.weather?.hourly.time.indexOf(instant / 1000) ?? -1;
    const cloud = weatherIndex >= 0 ? state.weather.hourly.cloud_cover[weatherIndex] : null;
    const rain = weatherIndex >= 0 ? state.weather.hourly.precipitation_probability[weatherIndex] : null;
    const button = node('button', undefined, 'hour');
    const label = formatTime(instant, state.zone);
    const zoneName = new Intl.DateTimeFormat('en-US', { timeZone: state.zone, timeZoneName: 'short' }).formatToParts(new Date(instant)).find(part => part.type === 'timeZoneName')?.value || '';
    button.title = `${label} ${zoneName} · sun ${position.altitude.toFixed(0)}°${cloud === null ? '' : ` · cloud ${cloud}%`}${rain === null ? '' : ` · rain chance ${rain}%`}`;
    button.setAttribute('aria-label', button.title);
    const sky = node('span', undefined, `sky${position.altitude < 0 ? ' night' : position.altitude <= 6 ? ' low-sun' : ''}`);
    sky.style.height = `${cloud === null ? 20 : 8 + cloud * .26}px`;
    const rainBar = node('span', undefined, 'rain-bar'); rainBar.style.opacity = rain === null ? 0 : rain / 100;
    const hourLabel = node('span', index % 3 === 0 ? new Intl.DateTimeFormat('en-US', { timeZone: state.zone, hour: 'numeric', hour12: false }).format(new Date(instant)) : '');
    button.append(sky, rainBar, hourLabel);
    button.addEventListener('click', () => { element('time').value = index; updateTime(); });
    return button;
  }));
}

function updateTime() {
  if (!state.selected || !state.hours.length) return;
  const instant = state.hours[Number(element('time').value)];
  const position = sunPosition(instant, state.selected.lat, state.selected.lng);
  text('selected-time', formatTime(instant, state.zone));
  const zoneName = new Intl.DateTimeFormat('en-US', { timeZone: state.zone, timeZoneName: 'short' }).formatToParts(new Date(instant)).find(part => part.type === 'timeZoneName')?.value;
  text('timezone', `${zoneName || ''} · ${state.zone.split('/').pop().replaceAll('_', ' ')}`);
  element('time').setAttribute('aria-valuetext', `${formatTime(instant, state.zone)} ${zoneName}`);
  text('azimuth', `${position.azimuth.toFixed(0)}° ${compass(position.azimuth)}`);
  text('elevation', `${position.altitude.toFixed(1)}°`);
  text('light-state', position.altitude < -6 ? 'Night' : position.altitude < 0 ? 'Twilight' : position.altitude <= 6 ? 'Low sun' : 'Daylight');
  for (const name of ['dawn', 'sunrise', 'sunset', 'dusk']) text(name, formatTime(state.times[name], state.zone));
  const range = (first, last) => first && last ? `${formatTime(first, state.zone)} – ${formatTime(last, state.zone)}` : 'Not occurring';
  text('golden-am', range(state.times.sunrise, state.times.goldenHourEnd));
  text('golden-pm', range(state.times.goldenHour, state.times.sunset));
  element('morning').disabled = !state.times.sunrise; element('evening').disabled = !state.times.goldenHour;
  [...element('hours').children].forEach((hour, index) => { const active = index === Number(element('time').value); hour.classList.toggle('active', active); hour.setAttribute('aria-pressed', String(active)); });
  map.light(state.selected, state.times, instant);
  updateWeather(instant);
}

async function fetchWeather(version = state.selectionVersion, refresh = false) {
  const place = state.selected;
  if (!place) return;
  state.weatherController?.abort();
  const controller = new AbortController(); state.weatherController = controller;
  text('forecast-status', 'Loading hourly forecast...');
  try {
    const data = await api('/api/weather', { lat: place.lat, lng: place.lng, ...(refresh ? { refresh: 1 } : {}) }, controller.signal);
    if (version !== state.selectionVersion || controller !== state.weatherController) return;
    state.weather = data; state.zone = data.timezone;
    populateDates(); setDay();
    text('forecast-status', `Open-Meteo · fetched ${formatTime(Date.parse(data.fetchedAt), state.zone)} local`);
  } catch (error) {
    if (error.name === 'AbortError' || version !== state.selectionVersion || controller !== state.weatherController) return;
    text('forecast-status', state.weather ? `Refresh failed; showing previous forecast. ${error.message}` : `Weather unavailable. ${error.message}`);
  }
}
element('refresh').addEventListener('click', () => fetchWeather(state.selectionVersion, true));
element('units').addEventListener('change', event => { state.units = event.target.value; persist(); updateTime(); });
function updateWeather(instant) {
  const index = state.weather?.hourly.time.indexOf(instant / 1000) ?? -1;
  const value = name => index < 0 ? null : state.weather.hourly[name]?.[index] ?? null;
  const imperial = state.units === 'imperial';
  const temperature = value('temperature_2m'); const wind = value('wind_speed_10m'); const gusts = value('wind_gusts_10m'); const visibility = value('visibility');
  const percent = number => number === null ? '--' : `${number}%`;
  const speed = number => number === null ? '--' : `${(imperial ? number / 1.609344 : number).toFixed(0)} ${imperial ? 'mph' : 'km/h'}`;
  text('temperature', temperature === null ? '--' : `${(imperial ? temperature * 1.8 + 32 : temperature).toFixed(0)}°${imperial ? 'F' : 'C'}`);
  text('cloud', percent(value('cloud_cover'))); text('rain', percent(value('precipitation_probability')));
  text('wind', speed(wind)); text('gusts', speed(gusts));
  text('visibility', visibility === null ? '--' : `${(visibility / (imperial ? 1609.344 : 1000)).toFixed(1)} ${imperial ? 'mi' : 'km'}`);
  const precipitation = value('precipitation'); const direction = value('wind_direction_10m');
  text('weather-detail', index < 0 ? 'No forecast for this hour.' : `Wind from ${direction === null ? '--' : `${compass(direction)} ${direction}°`} · Precipitation ${precipitation === null ? '--' : (imperial ? precipitation / 25.4 : precipitation).toFixed(2)} ${imperial ? 'in' : 'mm'}`);
}

function renderSaved() {
  element('saved-list').replaceChildren(...state.saved.map(place => {
    const row = node('div', undefined, 'saved-row');
    const select = node('button', place.locName); select.addEventListener('click', () => { map.center(place); selectPlace(place); });
    const remove = iconButton('x', `Remove ${place.locName}`);
    remove.addEventListener('click', () => { state.saved = state.saved.filter(saved => placeKey(saved) !== placeKey(place)); store('fieldlight.saved', state.saved); renderSaved(); updateSaveButton(); });
    row.append(select, remove); return row;
  }));
  if (!state.saved.length) element('saved-list').append(node('p', 'No saved places yet.', 'empty-message'));
  icons();
}
function updateSaveButton() {
  const saved = state.selected && state.saved.some(place => placeKey(place) === placeKey(state.selected));
  element('save').setAttribute('aria-pressed', String(Boolean(saved)));
  element('save').title = saved ? 'Remove saved place' : 'Save place';
  element('save').setAttribute('aria-label', element('save').title);
  element('save').style.color = saved ? 'var(--green)' : '';
  element('save').style.background = saved ? 'var(--green-light)' : '';
}
element('save').addEventListener('click', () => {
  if (!state.selected) return;
  const exists = state.saved.some(place => placeKey(place) === placeKey(state.selected));
  state.saved = exists ? state.saved.filter(place => placeKey(place) !== placeKey(state.selected)) : [...state.saved, state.selected];
  store('fieldlight.saved', state.saved); renderSaved(); updateSaveButton();
});
element('saved-toggle').addEventListener('click', () => { const panel = element('saved-panel'); panel.hidden = !panel.hidden; element('saved-toggle').setAttribute('aria-expanded', String(!panel.hidden)); renderSaved(); if (!panel.hidden) panel.scrollIntoView({ block: 'nearest' }); });
element('notes').addEventListener('input', () => { if (state.selected) { state.notes[placeKey(state.selected)] = element('notes').value; store('fieldlight.notes', state.notes); } });

async function initialize() {
  icons();
  selectPlace({ ...state.center, locName: 'Map center', custom: true });
  try {
    const status = await api('/api/status');
    text('connection', status.ebirdConfigured ? 'eBird key configured' : 'eBird key needed');
    if (!status.ebirdConfigured) throw new Error('Add an eBird key to the local .env file and restart. Map-point weather and light remain available.');
    state.taxonomy = await api('/api/taxonomy');
    text('connection', 'eBird connected'); element('connection').classList.add('ready');
    speciesSuggestions(); await search();
  } catch (error) { message(error.message); text('results-message', 'Bird reports unavailable.'); }
}
initialize();