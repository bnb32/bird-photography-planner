export function activityDate(place) {
  return place.latestObsDt || place.obsDt || '';
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