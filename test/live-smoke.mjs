const headers = { 'x-ebirdapitoken': process.env.EBIRD_API_KEY };
const checks = [
  ['taxonomy', 'https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&cat=species', headers],
  ['hotspots', 'https://api.ebird.org/v2/ref/hotspot/geo?lat=47.68&lng=-122.25&dist=25&fmt=json', headers],
  ['target observations', 'https://api.ebird.org/v2/data/obs/geo/recent/baleag?lat=47.68&lng=-122.25&dist=25&back=14&hotspot=true&maxResults=1000', headers],
  ['US weather', 'https://api.open-meteo.com/v1/forecast?latitude=47.68&longitude=-122.25&hourly=temperature_2m,cloud_cover,precipitation_probability,wind_speed_10m&timezone=auto&timeformat=unixtime&forecast_days=7'],
  ['Canada weather', 'https://api.open-meteo.com/v1/forecast?latitude=49.28&longitude=-123.12&hourly=temperature_2m&timezone=auto&timeformat=unixtime&forecast_days=7']
];
for (const [name, url, requestHeaders] of checks) {
  try {
    const response = await fetch(url, { headers: requestHeaders, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    console.log(name, Array.isArray(data) ? { count: data.length, fields: Object.keys(data[0] || {}) } : { timezone: data.timezone, hours: data.hourly?.time.length });
  } catch (error) {
    console.error(name, error.message);
    process.exitCode = 1;
  }
}