# Fieldlight

A standalone, local bird photography planner. Explore nearby eBird hotspots with or without a target bird, and compare hourly weather with solar direction and timing.

## Run on Windows

Requires Node.js 22.11 or newer and internet access for sightings, forecasts and map tiles.

```powershell
cd path\to\bird-photography-planner
npm install
npm start
```

Open the localhost URL printed by the server (normally http://127.0.0.1:3210). If the port is occupied, the server selects an available port. Stop with Ctrl+C.

For Git Bash or another Bash shell, run `bash launch.sh` from this folder, or pass its full path from any directory. The script changes to the project directory before loading the local environment and starting Node.

Before the first launch, copy `.env.example` to `.env` and set `EBIRD_API_KEY` to a key obtained from https://ebird.org/api/keygen. Restart the server after changing the key. Keep `.env` private and excluded from version control. With no valid key, map-point weather and light still work, but hotspot and bird-report queries are unavailable.

Open this folder directly in VS Code for the standalone workspace. A `Run Fieldlight` task is provided; it runs `npm start` without a debugger. No extensions or build step are required.

## Planning an outing

- Start with a location or a species. Leave **Target bird** empty to browse nearby hotspots, or choose a bird from the suggestions to find its recent reports. The clear icon removes the target and searches nearby hotspots. The initial map area is Seattle; the last searched target (including no target) is remembered.
- Click an empty spot on the map to set the search center and select that coordinate for weather and light. Searching for a US/Canadian town or using the location button also sets the center. Panning does not change the chosen center or trigger eBird requests. Set a 1-250 km radius and a 3/7/14/30-day report window, then select **Search this area**. The dashed circle identifies the last completed search area; the center marker identifies the chosen center.
- Select a result to see that hotspot's recent species, weather and light. Target searches also show the matching bird's report; location-first searches do not imply a target sighting. Enable **Other hotspots** during a target search to explore nearby sites without target reports. Click the map to select any coordinate independently of hotspot membership.
- Automatic hotspot markers, including **Other hotspots**, only show sites with a latest reported observation within 14 local calendar days of today, regardless of the outing date or report-window selector. Older sites and sites with unknown activity dates remain searchable in lists but are hidden from the map. An explicitly selected location still appears as the blue point. This uses eBird's latest observation date as an activity proxy, not a complete checklist-history lookup.
- Double-click a map point or hotspot to set the search center and run **Search this area**. Searches update results without replacing the selected point. Click a recent species to open the latest checklist returned for it at that hotspot in a new tab; entries without a checklist identifier remain plain text.
- The location list defaults to **Recently active**, using the hotspot's latest observation date with nearest distance as a tie-breaker. This measures recency, not checklist frequency or bird abundance. Missing dates sort last. **Target recency** sorts by the selected bird's report date; **Nearest** sorts by distance.
- Type at least two characters in **Hotspot name (US / Canada)** to search hotspot names across both countries, independently of radius and target species. Multiple words can match anywhere in a name, regardless of case. The first lookup downloads both country inventories; subsequent queries reuse them for up to 24 hours in server memory. Up to 100 matches are displayed; refine broad names to narrow them. Selecting a match moves the map and search center there and loads its conditions. Double-click a match or use **Search this area** to search around it with the current radius and bird filter. Name matches are separate from nearby target reports and do not imply a target sighting.
- Use a hotspot's star in either results list, or the star beside the bookmark in its details panel, to give it personal priority. Clicking a list star does not select the location or start a search. Priority hotspots appear first in the nearby list under every sort, retaining the chosen ordering within the priority and non-priority groups. Use the star again to remove priority. Priorities are stored locally, independently of saved places, and only promote locations returned by the current area search; they do not bypass radius or species filters. Country-wide name matches remain alphabetical.
- Choose a date and hour, or use the sunrise/sunset buttons to jump near low-sun periods. The chosen calendar date stays selected when changing locations, including across time zones. Dates outside a location's forecast remain available for light calculation, with weather shown as unavailable. Map rays point toward the sun. Weather values correspond to the selected hour; direction is wind **from** that bearing. Use the units selector for Fahrenheit/mph or Celsius/km/h.
- Save places with the bookmark button and add access notes. The header bookmark opens saved places. Preferences, notes and favourites are stored only in this browser's localStorage. Clearing browser storage removes them.
- Drag the column dividers to resize the location list or location info column; the map takes the remaining width. Drag the handle below the map to change its height. Focus a handle and use arrow keys for 10-pixel adjustments (Shift for 50); double-click to restore its default size. Sizes are remembered locally. Column handles are hidden when their panels stack on smaller screens; map-height resizing remains available.

## Scope and data limitations

- eBird results are recent public reports, **not encounter probabilities**. Reporting effort is uneven. Missing reports do not demonstrate absence. Bird counts are individual report counts, not numbers of observers or independent detections. Reports use source-provided local dates/times; no browser-zone conversion is applied to those strings.
- Target results are matched by exact hotspot identifiers and limited to US/Canada. Searches above 50 km combine overlapping provider queries, deduplicate locations, and filter them to the chosen radius. Larger searches take longer and use more API requests. Up to 1,000 target records are requested per provider query; a warning appears if any query reaches this limit. A broad map viewport is not an exhaustive area search. Distances are straight-line, not driving distances. Nearby reports are never assigned to a custom pin.
- The nearby-hotspot inventory provides no public/private-land guarantee. Verify hours, permits and access using the external map/eBird links. Respect closures, sensitive species and bird welfare. This app does not reconstruct hidden or sensitive locations.
- Open-Meteo supplies a seven-day forecast, not observations of on-site conditions. Forecasts and reported birds may change. Null weather values remain unavailable rather than becoming zero. The time zone is resolved offline with tz-lookup and refined by the forecast response. The time slider uses absolute hourly instants and handles DST days with 23 or 25 hours.
- SunCalc 2.1.4 returns degrees clockwise from north. Times are calculated geometrically, with no terrain, building, vegetation or cloud model. Missing solar events at northern latitudes are shown as not occurring. Low-sun periods do not promise warm or unobstructed light. Rays do not imply front/back lighting without a camera/subject bearing.
- This version has no tides, seasonal occurrence model, drive-time routing, offline map downloads, cloud storage or multi-species optimisation.

## Architecture and security

Plain browser modules, Leaflet, Lucide, SunCalc, Temporal and tz-lookup; no framework or bundler. The Node server uses native HTTP/fetch, validated provider routes, 20-second provider timeouts, in-memory caching and request deduplication. Taxonomy and country-wide hotspot inventories are cached for up to 24 hours, other provider data for 10 minutes; refresh clears the provider cache. Failed weather refreshes preserve the current forecast and show a warning. Superseded browser requests cannot overwrite newer selected-place conditions.

The server binds only to `127.0.0.1`, rejects foreign Host/Origin headers, serves an explicit public/vendor file allowlist, and uses the eBird key only in outbound request headers. This is a local-only tool, not a hardened public service; do not expose its port through a tunnel or deploy it publicly without additional security work. `.env` must remain private. API errors never return upstream bodies or credentials.

Map tiles are ordinary interactive OpenStreetMap requests with visible attribution and normal browser caching. No bulk fetching or offline tile storage is implemented. Fonts load from Google Fonts with local fallbacks. Node dependencies are served locally, not from a JavaScript CDN.

## Checks

```powershell
npm test
npm run smoke
```

Unit and local HTTP tests use fixtures, require no credentials, and cover query bounds, wider-area coverage, exact hotspot matching, latest-report selection, missing counts, auth failure, cache deduplication/expiry, local-only serving, time zones, DST, polar night, compass conventions, priorities, hotspot-name matching, checklist URLs and selected-date/point preservation. The optional live smoke check uses the local key and prints only response counts/field names and forecast zones, never credentials. It contacts real providers and is subject to their availability and rate limits.

## Sources

- eBird API documentation: https://documenter.getpostman.com/view/664302/S1ENwy59
- eBird terms: https://www.birds.cornell.edu/home/ebird-api-terms-of-use/
- Open-Meteo forecast documentation/terms: https://open-meteo.com/en/docs and https://open-meteo.com/en/terms (free endpoint for non-commercial use within usage limits).
- SunCalc: https://github.com/mourner/suncalc
- OpenStreetMap tile policy: https://operations.osmfoundation.org/policies/tiles/

Review provider terms before redistribution or public hosting. This project does not include a redistribution licence for third-party data.