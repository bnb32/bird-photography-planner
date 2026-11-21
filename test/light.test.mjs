import assert from 'node:assert/strict';
import test from 'node:test';
import { localDate, dayHours, lightForDay, sunPosition, bearingEnd, nearestHour, compass } from '../public/light.js';

test('location calendar dates do not depend on the machine timezone', () => {
  const instant = Date.parse('2026-11-20T03:00:00Z');
  assert.equal(localDate(instant, 'America/Los_Angeles'), '2026-11-19');
  assert.equal(localDate(instant, 'America/New_York'), '2026-11-19');
  assert.equal(localDate(instant, 'Europe/London'), '2026-11-20');
});

test('DST days have 23 or 25 absolute hourly slots', () => {
  assert.equal(dayHours('2026-03-08', 'America/New_York').length, 23);
  assert.equal(dayHours('2026-11-01', 'America/New_York').length, 25);
  assert.equal(dayHours('2026-11-20', 'America/Vancouver').length, 24);
});

test('sun times and direction follow SunCalc 2 degree conventions', () => {
  const light = lightForDay('2026-06-20', 'America/Vancouver', 49.28, -123.12);
  assert.ok(light.sunrise < light.sunset);
  assert.ok(light.sunrise < light.goldenHourEnd);
  assert.ok(light.goldenHour < light.sunset);
  const sunrise = sunPosition(light.sunrise, 49.28, -123.12);
  assert.ok(sunrise.azimuth > 0 && sunrise.azimuth < 180);
  const north = bearingEnd(49, -123, 0);
  const east = bearingEnd(49, -123, 90);
  assert.ok(north[0] > 49);
  assert.ok(east[1] > -123);
  assert.equal(compass(90), 'E');
  assert.equal(compass(270), 'W');
});

test('polar night is handled as absent events and nearest time uses absolute instants', () => {
  const light = lightForDay('2026-12-20', 'America/Iqaluit', 79, -85);
  assert.equal(light.sunrise, null);
  assert.equal(light.sunset, null);
  assert.equal(nearestHour([0, 3600000, 7200000], 4000000), 1);
});