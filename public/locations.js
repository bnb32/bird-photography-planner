export function activityDate(place) {
  return place.latestObsDt || place.obsDt || '';
}

export function hasRecentActivity(place, now = Date.now(), timeZone = 'UTC') {
  const date = activityDate(place).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const observed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(observed) || new Date(observed).toISOString().slice(0, 10) !== date) return false;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  const value = name => parts.find(part => part.type === name).value;
  const today = Date.parse(`${value('year')}-${value('month')}-${value('day')}T00:00:00Z`);
  const age = (today - observed) / 86400000;
  return age >= 0 && age <= 14;
}

export function checklistUrl(report) {
  return /^S\d+$/.test(report.subId || '') ? `https://ebird.org/checklist/${report.subId}` : null;
}

export function filterLocations(places, query = '') {
  const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return places.filter(place => {
    const name = normalize(place.locName || '');
    return terms.every(term => name.includes(term));
  });
}

export function sortLocations(places, mode = 'activity', priorities = []) {
  const priorityIds = new Set(priorities);
  return [...places].sort((first, second) => {
    const priorityOrder = Number(priorityIds.has(second.locId)) - Number(priorityIds.has(first.locId));
    if (priorityOrder) return priorityOrder;
    if (mode === 'distance') return first.distanceKm - second.distanceKm;
    const firstDate = mode === 'recent' ? first.obsDt || '' : activityDate(first);
    const secondDate = mode === 'recent' ? second.obsDt || '' : activityDate(second);
    return secondDate.localeCompare(firstDate) || first.distanceKm - second.distanceKm;
  });
}