// Import from CDN since browsers can't directly import npm packages
// Using unpkg.com with ?module parameter for ES modules
import geo from 'https://unpkg.com/ngeohash@0.6.3/index.js?module';
import aes from 'https://unpkg.com/aes-js@3.1.2/index.js?module';

export { aes, geo };  // export the ngeohash API.

// Generates the key for a sample given lat/lon.
export function sampleKey(lat, lon) {
  return geo.encode(lat, lon, 8);
}

// Generates the key for a coverage tile given lat/lon.
export function coverageKey(lat, lon) {
  return geo.encode(lat, lon, 6);
}

// Gets [lat, lon] for the specified hash.
export function posFromHash(hash) {
  const { latitude: lat, longitude: lon } = geo.decode(hash);
  return [lat, lon];
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
// Note: Distance validation is now handled server-side via environment variables
// Client-side validation only checks lat/lon bounds, not distance
// Default: San Jose, CA (for map display purposes)
export const centerPos = [37.3382, -121.8863];
export const maxDistanceMiles = 0;
export const initialZoom = 10;

export function isValidLocation(p) {
  const [lat, lon] = p;
  // Only validate lat/lon bounds, not distance
  // Distance validation is handled server-side
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return false;
  }
  return true;
}

export function parseLocation(latStr, lonStr) {
  let lat = parseFloat(latStr);
  let lon = parseFloat(lonStr);

  if (isNaN(lat) || isNaN(lon)) {
    throw new Error(`Invalid location ${[latStr, lonStr]}`);
  }

  // Don't round lat/lon - preserve full precision
  // Distance validation is handled server-side based on environment configuration

  if (!isValidLocation([lat, lon])) {
    throw new Error(`Invalid location bounds: ${[lat, lon]}`);
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

export function sigmoid(value, scale = 0.25, center = 0) {
  const g = scale * (value - center)
  return 1 / (1 + Math.exp(-g));
}

// About 1 minute accuracy.
const TIME_TRUNCATION = 100000;

export function truncateTime(time) {
  return Math.round(time / TIME_TRUNCATION);
}

export function fromTruncatedTime(truncatedTime) {
  return truncatedTime * TIME_TRUNCATION;
}

export async function retry(func, maxRetries = 5, retryDelayMs = 500) {
  let attempt = 0;
  const sleep = ms => new Promise(res => setTimeout(res, ms));

  while (true) {
    try {
      await func();
      return;
    } catch (err) {
      attempt++;

      if (attempt >= maxRetries)
        throw new Error(`Exceeded max retries. ${err}`);
      else
        console.log(`Attempt ${attempt} failed with ${err}`);
        await sleep(retryDelayMs * attempt);
    }
  }
}

export function definedOr(fn, a, b) {
  if (a != null && b != null)
    return fn(a, b);

  if (a == null && b == null)
    return null;

  return a != null ? a : b;
}

export function or(a, b) { return a || b; }
export function and(a, b) { return a && b; }