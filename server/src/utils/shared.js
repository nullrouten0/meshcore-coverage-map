const geo = require('ngeohash');
require('dotenv').config();

// Generates the key for a sample given lat/lon.
function sampleKey(lat, lon) {
  return geo.encode(lat, lon, 8);
}

// Generates the key for a coverage tile given lat/lon.
function coverageKey(lat, lon) {
  return geo.encode(lat, lon, 6);
}

// Gets [lat, lon] for the specified hash.
function posFromHash(hash) {
  const { latitude: lat, longitude: lon } = geo.decode(hash);
  return [lat, lon];
}

// Haversine distance between two [lat, lon] points, in miles.
function haversineMiles(a, b) {
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

// The center position to use for point filtering (configurable via env vars)
// Format: "lat,lon" (e.g., "37.3382,-121.8863")
// Default: San Jose, CA
function getCenterPos() {
  const centerStr = process.env.CENTER_POS;
  if (centerStr) {
    const [lat, lon] = centerStr.split(',').map(parseFloat);
    if (!isNaN(lat) && !isNaN(lon)) {
      return [lat, lon];
    }
  }
  // Default: San Jose, CA (37.3382, -121.8863)
  return [37.3382, -121.8863];
}

// Maximum distance in miles from center (configurable via env var)
// Set to 0 or negative to disable distance checking
// Default: 0 (no distance limit)
function getMaxDistanceMiles() {
  const maxDist = process.env.MAX_DISTANCE_MILES;
  if (maxDist !== undefined) {
    const dist = parseFloat(maxDist);
    if (!isNaN(dist)) {
      return dist;
    }
  }
  // Default: 0 (no distance limit)
  return 0;
}

// Initial map zoom level (configurable via env var)
// Set to higher integers to zoom in and lower integers to zoom out
// Default: 10 
function getInitialZoom() {
  const zoomLevel = process.env.INITIAL_ZOOM_LEVEL;
  if (zoomLevel !== undefined) {
    const zoom = parseInt(zoomLevel);
    if (!isNaN(zoom)) {
      return zoom;
    }
  }
  // Default: 10
  return 10;
}

const centerPos = getCenterPos();
const maxDistanceMiles = getMaxDistanceMiles();
const initialZoom = getInitialZoom();

function isValidLocation(p) {
  const [lat, lon] = p;
  
  // Always validate lat/lon bounds
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return false;
  }

  // If max distance is 0 or negative, skip distance check (allow anywhere)
  if (maxDistanceMiles <= 0) {
    return true;
  }

  return haversineMiles(centerPos, p) < maxDistanceMiles;
}

function parseLocation(latStr, lonStr) {
  let lat = parseFloat(latStr);
  let lon = parseFloat(lonStr);

  if (isNaN(lat) || isNaN(lon)) {
    throw new Error(`Invalid location ${[latStr, lonStr]}`);
  }

  // Don't round lat/lon - preserve full precision
  // Database schema uses DECIMAL(10,4) which supports up to 4 decimal places
  // but we'll store the full precision value

  if (!isValidLocation([lat, lon])) {
    throw new Error(`${[lat, lon]} exceeds max distance`);
  }

  return [lat, lon];
}

function ageInDays(time) {
  const dayInMillis = 24 * 60 * 60 * 1000;
  return (Date.now() - new Date(time)) / dayInMillis;
}

// Adds the value to a list associated with key.
function pushMap(map, key, value) {
  const items = map.get(key);
  if (items)
    items.push(value);
  else
    map.set(key, [value]);
}

function sigmoid(value, scale = 0.25, center = 0) {
  const g = scale * (value - center);
  return 1 / (1 + Math.exp(-g));
}

// About 1 minute accuracy.
const TIME_TRUNCATION = 100000;

function truncateTime(time) {
  return Math.round(time / TIME_TRUNCATION);
}

function fromTruncatedTime(truncatedTime) {
  return truncatedTime * TIME_TRUNCATION;
}

function definedOr(fn, a, b) {
  if (a != null && b != null)
    return fn(a, b);
  if (a == null && b == null)
    return null;
  return a != null ? a : b;
}

function or(a, b) {
  return a || b;
}

function and(a, b) {
  return a && b;
}

module.exports = {
  geo,
  sampleKey,
  coverageKey,
  posFromHash,
  haversineMiles,
  centerPos,
  maxDistanceMiles,
  initialZoom,
  isValidLocation,
  parseLocation,
  ageInDays,
  pushMap,
  sigmoid,
  truncateTime,
  fromTruncatedTime,
  definedOr,
  or,
  and,
  getCenterPos,
  getMaxDistanceMiles,
  getInitialZoom,
};

