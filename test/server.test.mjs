import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from '../server.mjs';

test('only public files and safe status are served', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/.env', '/package.json', '/server.mjs', '/node_modules/', '/%2e%2e/.env']) {
      assert.equal((await fetch(base + path)).status, 404);
    }
    const status = await (await fetch(base + '/api/status')).json();
    assert.deepEqual(Object.keys(status), ['ebirdConfigured']);
    assert.equal((await fetch(base + '/api/status', { headers: { Origin: 'https://example.org' } })).status, 403);
    assert.equal((await fetch(base + '/api/status', { method: 'POST' })).status, 405);
    for (const path of ['/', '/styles.css', '/app.js', '/map.js', '/light.js', '/vendor/leaflet.js', '/vendor/leaflet.css', '/vendor/lucide.js', '/vendor/suncalc.js', '/vendor/temporal.js', '/vendor/jsbi.js', '/vendor/tz-lookup.js']) {
      assert.equal((await fetch(base + path)).status, 200, path);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});