import geo from 'ngeohash';

export { geo };  // export the ngeohash API.

// Generates the key for a sample given lat/lon.
export function sampleKey(lat, lon) {
  return geo.encode(lat, lon, 8);
}

// Haversine distance between two [lat, lon] points, in miles.
export function haversineMiles(a, b) {
  const R = 3958.8; // Earth radius in miles
  const toRad = deg => deg * Math.PI / 180;

  const [lat1, lon1] = a;
  const [lat2, lon2] = b;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

// The center position to use for point filtering.
const centerPos = [47.8033, -122.0427];
const maxDistanceMiles = 300;

function isValidLocation(p) {
  const [lat, lon] = p;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return false;
  }

  return haversineMiles(centerPos, p) < maxDistanceMiles;
}

function roundToFourPlaces(n) {
  // Really, Javascript?
  return Math.round(n * 10000) / 10000;
}

export function parseLocation(latStr, lonStr) {
  let lat = parseFloat(latStr);
  let lon = parseFloat(lonStr);

  if (isNaN(lat) || isNaN(lon)) {
    throw new Error(`Invalid location ${[latStr, lonStr]}`);
  }

  lat = roundToFourPlaces(lat);
  lon = roundToFourPlaces(lon);

  if (!isValidLocation([lat, lon])) {
    throw new Error(`${[lat, lon]} exceeds max distance`);
  }

  return [lat, lon];
}

export function ageInDays(time) {
  const dayInMillis = 24 * 60 * 60 * 1000;
  return (Date.now() - new Date(time)) / dayInMillis;
}

// Adds the value to a list associated with key.
export function pushMap(map, key, value) {
  const items = map.get(key);
  if (items)
    items.push(value);
  else
    map.set(key, [value]);
}