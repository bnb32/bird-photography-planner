import { filterLocations } from './public/locations.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function numberParam(params, name, minimum, maximum, fallback) {
  const raw = params.get(name);
  const value = raw === null ? fallback : Number(raw);
  if (raw === '' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ApiError(400, `${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function coordinates(params) {
  return {
    lat: numberParam(params, 'lat', 24, 84),
    lng: numberParam(params, 'lng', -180, -50)
  };
}

export function distanceKm(first, second) {
  const radians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.lat - first.lat);
  const longitudeDelta = radians(second.lng - first.lng);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function searchAreas(center, radius) {
  if (radius <= 50) return [{ ...center, dist: radius }];
  const areas = [];
  const extent = Math.ceil((radius + 43) / 60);
  const latitude = center.lat * Math.PI / 180;
  const longitude = center.lng * Math.PI / 180;
  for (let row = -extent; row <= extent; row++) {
    for (let column = -extent; column <= extent; column++) {
      const distance = Math.hypot(row * 60, column * 60);
      if (distance > radius + 43) continue;
      const angle = distance / 6371;
      const bearing = Math.atan2(column, row);
      const lat = Math.asin(Math.sin(latitude) * Math.cos(angle) + Math.cos(latitude) * Math.sin(angle) * Math.cos(bearing));
      const lng = longitude + Math.atan2(Math.sin(bearing) * Math.sin(angle) * Math.cos(latitude), Math.cos(angle) - Math.sin(latitude) * Math.sin(lat));
      areas.push({ lat: lat * 180 / Math.PI, lng: ((lng * 180 / Math.PI + 540) % 360) - 180, dist: 50 });
    }
  }
  return areas.sort((first, second) => distanceKm(center, first) - distanceKm(center, second));
}

export function matchHotspots(observations, hotspots, center) {
  const lookup = new Map(hotspots.filter(hotspot => ['US', 'CA'].includes(hotspot.countryCode)).map(hotspot => [hotspot.locId, hotspot]));
  const results = new Map();
  for (const observation of observations) {
    const hotspot = lookup.get(observation.locId);
    if (!hotspot) continue;
    const existing = results.get(observation.locId);
    if (existing && existing.obsDt >= observation.obsDt) continue;
    results.set(observation.locId, {
      locId: hotspot.locId, locName: hotspot.locName,
      lat: hotspot.lat, lng: hotspot.lng,
      countryCode: hotspot.countryCode,
      latestObsDt: hotspot.latestObsDt,
      obsDt: observation.obsDt, howMany: observation.howMany ?? null,
      comName: observation.comName, speciesCode: observation.speciesCode,
      subId: observation.subId,
      distanceKm: distanceKm(center, hotspot)
    });
  }
  return [...results.values()].sort((first, second) => second.obsDt.localeCompare(first.obsDt) || first.distanceKm - second.distanceKm);
}

export function createProviders({ fetcher = fetch, key = process.env.EBIRD_API_KEY, now = Date.now } = {}) {
  const cache = new Map();
  const inflight = new Map();
  async function json(url, ebird = false, ttl = 600000) {
    if (ebird && !key) throw new ApiError(503, 'Add EBIRD_API_KEY to the local .env file and restart. Weather and light are still available.');
    const cached = cache.get(url);
    if (cached && now() - cached.at < ttl) return cached.data;
    if (inflight.has(url)) return inflight.get(url);
    const promise = (async () => {
      let response;
      try {
        response = await fetcher(url, {
          headers: ebird ? { 'x-ebirdapitoken': key } : {},
          signal: AbortSignal.timeout(20000)
        });
      } catch {
        throw new ApiError(502, 'The data provider could not be reached. Try again shortly.');
      }
      if (!response.ok) {
        if (ebird && [401, 403].includes(response.status)) throw new ApiError(401, 'eBird rejected the API key. Update the local .env file and restart.');
        if (response.status === 429) throw new ApiError(429, 'The provider is rate limiting requests. Please wait before searching again.');
        throw new ApiError(502, `The data provider returned HTTP ${response.status}.`);
      }
      let data;
      try { data = await response.json(); } catch { throw new ApiError(502, 'The provider returned an unreadable response.'); }
      if (cache.size > 150) cache.delete(cache.keys().next().value);
      cache.set(url, { at: now(), data });
      return data;
    })();
    inflight.set(url, promise);
    try { return await promise; } finally { inflight.delete(url); }
  }

  function ebird(path, params = {}) {
    const url = new URL(`https://api.ebird.org/v2/${path}`);
    url.search = new URLSearchParams(params).toString();
    return json(url.href, true, path.includes('taxonomy') ? 86400000 : 600000);
  }

  return {
    configured: Boolean(key),
    async route(path, params) {
      if (params.get('refresh') === '1') cache.clear();
      if (path === '/api/taxonomy') {
        const data = await ebird('ref/taxonomy/ebird', { fmt: 'json', cat: 'species' });
        return data.map(({ comName, sciName, speciesCode }) => ({ comName, sciName, speciesCode }));
      }
      if (path === '/api/hotspots') {
        const query = (params.get('q') || '').trim();
        const ids = params.get('ids')?.split(',');
        if (ids && (ids.length > 500 || ids.some(id => !/^L\d{1,12}$/.test(id)))) throw new ApiError(400, 'Invalid hotspot identifiers.');
        if (!ids && (query.length < 2 || query.length > 100)) throw new ApiError(400, 'Enter a hotspot name between 2 and 100 characters.');
        const countries = await Promise.all(['US', 'CA'].map(country => json(`https://api.ebird.org/v2/ref/hotspot/${country}?fmt=json`, true, 86400000)));
        const unique = new Map(countries.flat().filter(place => ['US', 'CA'].includes(place.countryCode)).map(place => [place.locId, place]));
        if (ids) return { results: ids.map(id => unique.get(id)).filter(Boolean) };
        const matches = filterLocations([...unique.values()], query).sort((first, second) => first.locName.localeCompare(second.locName));
        return { results: matches.slice(0, 100), total: matches.length };
      }
      if (path === '/api/search') {
        const center = coordinates(params);
        const dist = numberParam(params, 'radius', 1, 250, 25);
        const back = numberParam(params, 'back', 1, 30, 14);
        if (!Number.isInteger(back)) throw new ApiError(400, 'back must be a whole number of days.');
        const species = params.get('species') || '';
        if (species && !/^[a-z0-9]{2,20}$/.test(species)) throw new ApiError(400, 'Choose a target species from the suggestions.');
        const areas = searchAreas(center, dist);
        const hotspotLookup = new Map();
        const observations = [];
        let truncated = false;
        for (let offset = 0; offset < areas.length; offset += 2) {
          const batches = await Promise.all(areas.slice(offset, offset + 2).map(async geo => {
            const [hotspots, reports] = await Promise.all([
              ebird('ref/hotspot/geo', { ...geo, fmt: 'json' }),
              species ? ebird(`data/obs/geo/recent/${species}`, { ...geo, back, hotspot: 'true', maxResults: 1000 }) : []
            ]);
            return { hotspots, reports };
          }));
          for (const batch of batches) {
            for (const hotspot of batch.hotspots) {
              if (['US', 'CA'].includes(hotspot.countryCode) && distanceKm(center, hotspot) <= dist) hotspotLookup.set(hotspot.locId, hotspot);
            }
            observations.push(...batch.reports);
            truncated ||= batch.reports.length >= 1000;
          }
        }
        const hotspots = [...hotspotLookup.values()];
        const results = species ? matchHotspots(observations, hotspots, center) : hotspots.map(hotspot => ({ ...hotspot, distanceKm: distanceKm(center, hotspot) }))
          .sort((first, second) => first.distanceKm - second.distanceKm);
        return { results, hotspots, truncated, areas: areas.length, fetchedAt: new Date(now()).toISOString() };
      }
      if (path === '/api/location') {
        const id = params.get('id') || '';
        if (!/^L\d{1,12}$/.test(id)) throw new ApiError(400, 'Invalid hotspot identifier.');
        return ebird(`data/obs/${id}/recent`, { back: 14, maxResults: 100 });
      }
      if (path === '/api/weather') {
        const { lat, lng } = coordinates(params);
        const url = new URL('https://api.open-meteo.com/v1/forecast');
        url.search = new URLSearchParams({
          latitude: lat, longitude: lng, timezone: 'auto', timeformat: 'unixtime', forecast_days: 7,
          hourly: 'temperature_2m,cloud_cover,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility'
        }).toString();
        return { ...await json(url.href), fetchedAt: new Date(now()).toISOString() };
      }
      if (path === '/api/geocode') {
        const query = (params.get('q') || '').trim();
        if (query.length < 2 || query.length > 100) throw new ApiError(400, 'Enter a place name between 2 and 100 characters.');
        const responses = await Promise.all(['US', 'CA'].map(countryCode => json(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: query, count: 8, language: 'en', format: 'json', countryCode })}`)));
        return responses.flatMap(data => data.results || []).filter(place => ['US', 'CA'].includes(place.country_code));
      }
      throw new ApiError(404, 'Unknown endpoint.');
    }
  };
}