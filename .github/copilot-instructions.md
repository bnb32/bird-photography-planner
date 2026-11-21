# Project Setup

- [x] Verify instructions file exists.
- [x] Clarify requirements: standalone, single-user, target-first bird photography planner for US/Canada.
- [x] Scaffold project: Node 22.11+, native HTTP server, plain browser modules, separate from portfolio.
- [x] Customize project: eBird hotspot search, arbitrary pins, hourly forecast, solar bearings, saved places and notes.
- [x] Install required extensions: none needed.
- [x] Compile project: no build step; syntax checks and unit/HTTP tests pass; pinned dependencies installed.
- [x] Create and run task: launch/test tasks provided; automatic task invocation failed outside the active workspace, so npm start was run directly in the project directory.
- [x] Launch project: server running on loopback; live browser workflows checked without a debugger.
- [x] Complete documentation: README includes setup, key handling, sources, workflow and limitations.

# Engineering Conventions

- Keep the portfolio website unchanged. This is a separate local project.
- Use plain JavaScript modules and existing libraries. Avoid a framework or bundler unless necessary.
- Run `npm test` after edits. `npm run smoke` is optional and uses real providers.
- Treat eBird credentials as secrets. Never serve `.env`, store keys in browser storage, print them, include them in URLs, or commit them. Keep provider errors generic.
- Keep the server bound to 127.0.0.1. Validate query bounds and preserve the public/vendor allowlist and Host/Origin checks.
- Use exact hotspot IDs, not name similarity. Recent reports are not encounter probabilities. Never infer hidden/sensitive locations.
- Use SunCalc 2.x degree conventions and location-aware absolute instants; preserve DST and absent-event tests.
- Scope Lucide icon CSS to `.lucide`, never all SVG elements; Leaflet needs its own overlay dimensions.
- Render provider data as text. Handle null values without converting them to zero.
- Weather failures must not prevent local light calculation; stale asynchronous responses must not overwrite newer selections.
- Keep OpenStreetMap attribution visible. No bulk or offline tile downloading.
- Manual edits use apply_patch. No changes to existing user work, no commits or new branches unless asked.