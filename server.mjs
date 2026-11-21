import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ApiError, createProviders } from './providers.mjs';

export const publicRoot = new URL('./public/', import.meta.url);

export function createServer(providers = createProviders()) {
  return http.createServer(async (request, response) => {
    const host = request.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) || (request.headers.origin && request.headers.origin !== `http://${host}`)) {
      response.writeHead(403).end();
      return;
    }
    const url = new URL(request.url, `http://${host}`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    if (url.pathname === '/api/status') {
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify({ ebirdConfigured: providers.configured }));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      try {
        response.end(JSON.stringify(await providers.route(url.pathname, url.searchParams)));
      } catch (error) {
        response.writeHead(error instanceof ApiError ? error.status : 500);
        response.end(JSON.stringify({ error: error instanceof ApiError ? error.message : 'Unexpected server error.' }));
      }
      return;
    }
    const vendors = {
      '/vendor/leaflet.js': ['leaflet/dist/leaflet.js', 'text/javascript'],
      '/vendor/leaflet.css': ['leaflet/dist/leaflet.css', 'text/css'],
      '/vendor/images/layers.png': ['leaflet/dist/images/layers.png', 'image/png'],
      '/vendor/images/layers-2x.png': ['leaflet/dist/images/layers-2x.png', 'image/png'],
      '/vendor/images/marker-icon.png': ['leaflet/dist/images/marker-icon.png', 'image/png'],
      '/vendor/images/marker-icon-2x.png': ['leaflet/dist/images/marker-icon-2x.png', 'image/png'],
      '/vendor/images/marker-shadow.png': ['leaflet/dist/images/marker-shadow.png', 'image/png'],
      '/vendor/lucide.js': ['lucide/dist/umd/lucide.js', 'text/javascript'],
      '/vendor/suncalc.js': ['suncalc/index.js', 'text/javascript'],
      '/vendor/temporal.js': ['@js-temporal/polyfill/dist/index.esm.js', 'text/javascript'],
      '/vendor/jsbi.js': ['jsbi/dist/jsbi.mjs', 'text/javascript'],
      '/vendor/tz-lookup.js': ['tz-lookup/tz.js', 'text/javascript']
    };
    const vendor = vendors[url.pathname];
    if (vendor) {
      try {
        response.setHeader('Content-Type', vendor[1]);
        response.end(await readFile(new URL(`./node_modules/${vendor[0]}`, import.meta.url)));
      } catch { response.writeHead(404).end(); }
      return;
    }
    const files = { '/': 'index.html', '/styles.css': 'styles.css', '/app.js': 'app.js', '/map.js': 'map.js', '/light.js': 'light.js', '/locations.js': 'locations.js' };
    const name = files[url.pathname];
    if (!name) {
      response.writeHead(404).end();
      return;
    }
    try {
      const content = await readFile(new URL(name, publicRoot));
      response.setHeader('Content-Type', name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css' : 'text/javascript');
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3210);
  const server = createServer();
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') server.listen(0, '127.0.0.1');
    else { console.error('Could not start the local server:', error.code); process.exitCode = 1; }
  });
  server.on('listening', () => console.log(`Planner: http://127.0.0.1:${server.address().port}`));
  server.listen(port, '127.0.0.1');
}