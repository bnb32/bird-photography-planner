import * as SunCalc from 'suncalc';
import { Temporal } from '@js-temporal/polyfill';

export function localDate(instant, timeZone) {
  return Temporal.Instant.fromEpochMilliseconds(Number(instant)).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

export function dayHours(date, timeZone) {
  const midnight = Temporal.PlainDate.from(date).toZonedDateTime({ timeZone, plainTime: '00:00' });
  const next = midnight.add({ days: 1 }).epochMilliseconds;
  const instants = [];
  for (let instant = midnight.epochMilliseconds; instant < next; instant += 3600000) instants.push(instant);
  return instants;
}

export function lightForDay(date, timeZone, lat, lng) {
  const noon = Temporal.PlainDate.from(date).toZonedDateTime({ timeZone, plainTime: '12:00' });
  return SunCalc.getTimes(new Date(noon.epochMilliseconds), lat, lng, 0, noon.offsetNanoseconds / 60000000000);
}

export function sunPosition(instant, lat, lng) {
  return SunCalc.getPosition(new Date(instant), lat, lng);
}

export function bearingEnd(lat, lng, bearing, distance = 1.5) {
  const latitude = lat * Math.PI / 180;
  const longitude = lng * Math.PI / 180;
  const direction = bearing * Math.PI / 180;
  const angularDistance = distance / 6371;
  const destinationLat = Math.asin(Math.sin(latitude) * Math.cos(angularDistance) + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(direction));
  const destinationLng = longitude + Math.atan2(Math.sin(direction) * Math.sin(angularDistance) * Math.cos(latitude), Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLat));
  return [destinationLat * 180 / Math.PI, destinationLng * 180 / Math.PI];
}

export function nearestHour(instants, target) {
  return instants.reduce((best, instant, index) => Math.abs(instant - target) < Math.abs(instants[best] - target) ? index : best, 0);
}

export function formatTime(instant, timeZone) {
  if (instant === null || instant === undefined || !Number.isFinite(Number(instant))) return 'Not occurring';
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(instant));
}

export function compass(bearing) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
}