var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ngeohash/main.js
var require_main = __commonJS({
  "node_modules/ngeohash/main.js"(exports, module) {
    var BASE32_CODES = "0123456789bcdefghjkmnpqrstuvwxyz";
    var BASE32_CODES_DICT = {};
    for (i = 0; i < BASE32_CODES.length; i++) {
      BASE32_CODES_DICT[BASE32_CODES.charAt(i)] = i;
    }
    var i;
    var ENCODE_AUTO = "auto";
    var MIN_LAT = -90;
    var MAX_LAT = 90;
    var MIN_LON = -180;
    var MAX_LON = 180;
    var SIGFIG_HASH_LENGTH = [0, 5, 7, 8, 11, 12, 13, 15, 16, 17, 18];
    var encode = function(latitude, longitude, numberOfChars) {
      if (numberOfChars === ENCODE_AUTO) {
        if (typeof latitude === "number" || typeof longitude === "number") {
          throw new Error("string notation required for auto precision.");
        }
        var decSigFigsLat = latitude.split(".")[1].length;
        var decSigFigsLong = longitude.split(".")[1].length;
        var numberOfSigFigs = Math.max(decSigFigsLat, decSigFigsLong);
        numberOfChars = SIGFIG_HASH_LENGTH[numberOfSigFigs];
      } else if (numberOfChars === void 0) {
        numberOfChars = 9;
      }
      var chars = [], bits = 0, bitsTotal = 0, hash_value = 0, maxLat = MAX_LAT, minLat = MIN_LAT, maxLon = MAX_LON, minLon = MIN_LON, mid;
      while (chars.length < numberOfChars) {
        if (bitsTotal % 2 === 0) {
          mid = (maxLon + minLon) / 2;
          if (longitude > mid) {
            hash_value = (hash_value << 1) + 1;
            minLon = mid;
          } else {
            hash_value = (hash_value << 1) + 0;
            maxLon = mid;
          }
        } else {
          mid = (maxLat + minLat) / 2;
          if (latitude > mid) {
            hash_value = (hash_value << 1) + 1;
            minLat = mid;
          } else {
            hash_value = (hash_value << 1) + 0;
            maxLat = mid;
          }
        }
        bits++;
        bitsTotal++;
        if (bits === 5) {
          var code = BASE32_CODES[hash_value];
          chars.push(code);
          bits = 0;
          hash_value = 0;
        }
      }
      return chars.join("");
    };
    var encode_int = function(latitude, longitude, bitDepth) {
      bitDepth = bitDepth || 52;
      var bitsTotal = 0, maxLat = MAX_LAT, minLat = MIN_LAT, maxLon = MAX_LON, minLon = MIN_LON, mid, combinedBits = 0;
      while (bitsTotal < bitDepth) {
        combinedBits *= 2;
        if (bitsTotal % 2 === 0) {
          mid = (maxLon + minLon) / 2;
          if (longitude > mid) {
            combinedBits += 1;
            minLon = mid;
          } else {
            maxLon = mid;
          }
        } else {
          mid = (maxLat + minLat) / 2;
          if (latitude > mid) {
            combinedBits += 1;
            minLat = mid;
          } else {
            maxLat = mid;
          }
        }
        bitsTotal++;
      }
      return combinedBits;
    };
    var decode_bbox = function(hash_string) {
      var isLon = true, maxLat = MAX_LAT, minLat = MIN_LAT, maxLon = MAX_LON, minLon = MIN_LON, mid;
      var hashValue = 0;
      for (var i2 = 0, l = hash_string.length; i2 < l; i2++) {
        var code = hash_string[i2].toLowerCase();
        hashValue = BASE32_CODES_DICT[code];
        for (var bits = 4; bits >= 0; bits--) {
          var bit = hashValue >> bits & 1;
          if (isLon) {
            mid = (maxLon + minLon) / 2;
            if (bit === 1) {
              minLon = mid;
            } else {
              maxLon = mid;
            }
          } else {
            mid = (maxLat + minLat) / 2;
            if (bit === 1) {
              minLat = mid;
            } else {
              maxLat = mid;
            }
          }
          isLon = !isLon;
        }
      }
      return [minLat, minLon, maxLat, maxLon];
    };
    var decode_bbox_int = function(hashInt, bitDepth) {
      bitDepth = bitDepth || 52;
      var maxLat = MAX_LAT, minLat = MIN_LAT, maxLon = MAX_LON, minLon = MIN_LON;
      var latBit = 0, lonBit = 0;
      var step = bitDepth / 2;
      for (var i2 = 0; i2 < step; i2++) {
        lonBit = get_bit(hashInt, (step - i2) * 2 - 1);
        latBit = get_bit(hashInt, (step - i2) * 2 - 2);
        if (latBit === 0) {
          maxLat = (maxLat + minLat) / 2;
        } else {
          minLat = (maxLat + minLat) / 2;
        }
        if (lonBit === 0) {
          maxLon = (maxLon + minLon) / 2;
        } else {
          minLon = (maxLon + minLon) / 2;
        }
      }
      return [minLat, minLon, maxLat, maxLon];
    };
    function get_bit(bits, position) {
      return bits / Math.pow(2, position) & 1;
    }
    var decode = function(hashString) {
      var bbox = decode_bbox(hashString);
      var lat = (bbox[0] + bbox[2]) / 2;
      var lon = (bbox[1] + bbox[3]) / 2;
      var latErr = bbox[2] - lat;
      var lonErr = bbox[3] - lon;
      return {
        latitude: lat,
        longitude: lon,
        error: { latitude: latErr, longitude: lonErr }
      };
    };
    var decode_int = function(hash_int, bitDepth) {
      var bbox = decode_bbox_int(hash_int, bitDepth);
      var lat = (bbox[0] + bbox[2]) / 2;
      var lon = (bbox[1] + bbox[3]) / 2;
      var latErr = bbox[2] - lat;
      var lonErr = bbox[3] - lon;
      return {
        latitude: lat,
        longitude: lon,
        error: { latitude: latErr, longitude: lonErr }
      };
    };
    var neighbor = function(hashString, direction) {
      var lonLat = decode(hashString);
      var neighborLat = lonLat.latitude + direction[0] * lonLat.error.latitude * 2;
      var neighborLon = lonLat.longitude + direction[1] * lonLat.error.longitude * 2;
      neighborLon = ensure_valid_lon(neighborLon);
      neighborLat = ensure_valid_lat(neighborLat);
      return encode(neighborLat, neighborLon, hashString.length);
    };
    var neighbor_int = function(hash_int, direction, bitDepth) {
      bitDepth = bitDepth || 52;
      var lonlat = decode_int(hash_int, bitDepth);
      var neighbor_lat = lonlat.latitude + direction[0] * lonlat.error.latitude * 2;
      var neighbor_lon = lonlat.longitude + direction[1] * lonlat.error.longitude * 2;
      neighbor_lon = ensure_valid_lon(neighbor_lon);
      neighbor_lat = ensure_valid_lat(neighbor_lat);
      return encode_int(neighbor_lat, neighbor_lon, bitDepth);
    };
    var neighbors = function(hash_string) {
      var hashstringLength = hash_string.length;
      var lonlat = decode(hash_string);
      var lat = lonlat.latitude;
      var lon = lonlat.longitude;
      var latErr = lonlat.error.latitude * 2;
      var lonErr = lonlat.error.longitude * 2;
      var neighbor_lat, neighbor_lon;
      var neighborHashList = [
        encodeNeighbor(1, 0),
        encodeNeighbor(1, 1),
        encodeNeighbor(0, 1),
        encodeNeighbor(-1, 1),
        encodeNeighbor(-1, 0),
        encodeNeighbor(-1, -1),
        encodeNeighbor(0, -1),
        encodeNeighbor(1, -1)
      ];
      function encodeNeighbor(neighborLatDir, neighborLonDir) {
        neighbor_lat = lat + neighborLatDir * latErr;
        neighbor_lon = lon + neighborLonDir * lonErr;
        neighbor_lon = ensure_valid_lon(neighbor_lon);
        neighbor_lat = ensure_valid_lat(neighbor_lat);
        return encode(neighbor_lat, neighbor_lon, hashstringLength);
      }
      return neighborHashList;
    };
    var neighbors_int = function(hash_int, bitDepth) {
      bitDepth = bitDepth || 52;
      var lonlat = decode_int(hash_int, bitDepth);
      var lat = lonlat.latitude;
      var lon = lonlat.longitude;
      var latErr = lonlat.error.latitude * 2;
      var lonErr = lonlat.error.longitude * 2;
      var neighbor_lat, neighbor_lon;
      var neighborHashIntList = [
        encodeNeighbor_int(1, 0),
        encodeNeighbor_int(1, 1),
        encodeNeighbor_int(0, 1),
        encodeNeighbor_int(-1, 1),
        encodeNeighbor_int(-1, 0),
        encodeNeighbor_int(-1, -1),
        encodeNeighbor_int(0, -1),
        encodeNeighbor_int(1, -1)
      ];
      function encodeNeighbor_int(neighborLatDir, neighborLonDir) {
        neighbor_lat = lat + neighborLatDir * latErr;
        neighbor_lon = lon + neighborLonDir * lonErr;
        neighbor_lon = ensure_valid_lon(neighbor_lon);
        neighbor_lat = ensure_valid_lat(neighbor_lat);
        return encode_int(neighbor_lat, neighbor_lon, bitDepth);
      }
      return neighborHashIntList;
    };
    var bboxes = function(minLat, minLon, maxLat, maxLon, numberOfChars) {
      numberOfChars = numberOfChars || 9;
      var hashSouthWest = encode(minLat, minLon, numberOfChars);
      var hashNorthEast = encode(maxLat, maxLon, numberOfChars);
      var latLon = decode(hashSouthWest);
      var perLat = latLon.error.latitude * 2;
      var perLon = latLon.error.longitude * 2;
      var boxSouthWest = decode_bbox(hashSouthWest);
      var boxNorthEast = decode_bbox(hashNorthEast);
      var latStep = Math.round((boxNorthEast[0] - boxSouthWest[0]) / perLat);
      var lonStep = Math.round((boxNorthEast[1] - boxSouthWest[1]) / perLon);
      var hashList = [];
      for (var lat = 0; lat <= latStep; lat++) {
        for (var lon = 0; lon <= lonStep; lon++) {
          hashList.push(neighbor(hashSouthWest, [lat, lon]));
        }
      }
      return hashList;
    };
    var bboxes_int = function(minLat, minLon, maxLat, maxLon, bitDepth) {
      bitDepth = bitDepth || 52;
      var hashSouthWest = encode_int(minLat, minLon, bitDepth);
      var hashNorthEast = encode_int(maxLat, maxLon, bitDepth);
      var latlon = decode_int(hashSouthWest, bitDepth);
      var perLat = latlon.error.latitude * 2;
      var perLon = latlon.error.longitude * 2;
      var boxSouthWest = decode_bbox_int(hashSouthWest, bitDepth);
      var boxNorthEast = decode_bbox_int(hashNorthEast, bitDepth);
      var latStep = Math.round((boxNorthEast[0] - boxSouthWest[0]) / perLat);
      var lonStep = Math.round((boxNorthEast[1] - boxSouthWest[1]) / perLon);
      var hashList = [];
      for (var lat = 0; lat <= latStep; lat++) {
        for (var lon = 0; lon <= lonStep; lon++) {
          hashList.push(neighbor_int(hashSouthWest, [lat, lon], bitDepth));
        }
      }
      return hashList;
    };
    function ensure_valid_lon(lon) {
      if (lon > MAX_LON)
        return MIN_LON + lon % MAX_LON;
      if (lon < MIN_LON)
        return MAX_LON + lon % MAX_LON;
      return lon;
    }
    function ensure_valid_lat(lat) {
      if (lat > MAX_LAT)
        return MAX_LAT;
      if (lat < MIN_LAT)
        return MIN_LAT;
      return lat;
    }
    var geohash = {
      "ENCODE_AUTO": ENCODE_AUTO,
      "encode": encode,
      "encode_uint64": encode_int,
      // keeping for backwards compatibility, will deprecate
      "encode_int": encode_int,
      "decode": decode,
      "decode_int": decode_int,
      "decode_uint64": decode_int,
      // keeping for backwards compatibility, will deprecate
      "decode_bbox": decode_bbox,
      "decode_bbox_uint64": decode_bbox_int,
      // keeping for backwards compatibility, will deprecate
      "decode_bbox_int": decode_bbox_int,
      "neighbor": neighbor,
      "neighbor_int": neighbor_int,
      "neighbors": neighbors,
      "neighbors_int": neighbors_int,
      "bboxes": bboxes,
      "bboxes_int": bboxes_int
    };
    module.exports = geohash;
  }
});

// content/shared_npm.js
var import_ngeohash = __toESM(require_main());
function sampleKey(lat, lon) {
  return import_ngeohash.default.encode(lat, lon, 8);
}
function coverageKey(lat, lon) {
  return import_ngeohash.default.encode(lat, lon, 6);
}
function posFromHash(hash) {
  const { latitude: lat, longitude: lon } = import_ngeohash.default.decode(hash);
  return [lat, lon];
}
function haversineMiles(a, b) {
  const R = 3958.8;
  const toRad = (deg) => deg * Math.PI / 180;
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Default values (will be updated from server config)
var centerPos = [37.3382, -121.8863];
var maxDistanceMiles = 0;
var initialZoom = 10;

// Fetch config from server
let configPromise = null;
async function loadConfig() {
  if (configPromise) return configPromise;
  configPromise = fetch('/config')
    .then(res => res.json())
    .then(config => {
      centerPos = config.centerPos || centerPos;
      maxDistanceMiles = config.maxDistanceMiles || maxDistanceMiles;
      initialZoom = config.initialZoom || initialZoom;
      return config;
    })
    .catch(err => {
      console.warn('Failed to load config from server, using defaults:', err);
      return { centerPos, maxDistanceMiles, initialZoom };
    });
  return configPromise;
}
function isValidLocation(p) {
  const [lat, lon] = p;
  // Only validate lat/lon bounds, not distance
  // Distance validation is handled server-side based on environment configuration
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return false;
  }
  return true;
}
function parseLocation(latStr, lonStr) {
  let lat = parseFloat(latStr);
  let lon = parseFloat(lonStr);
  if (isNaN(lat) || isNaN(lon)) {
    throw new Error(`Invalid location ${[latStr, lonStr]}`);
  }
  // Don't round lat/lon - preserve full precision
  // Distance validation is handled server-side
  if (!isValidLocation([lat, lon])) {
    throw new Error(`Invalid location bounds: ${[lat, lon]}`);
  }
  return [lat, lon];
}
function ageInDays(time) {
  const dayInMillis = 24 * 60 * 60 * 1e3;
  return (Date.now() - new Date(time)) / dayInMillis;
}
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
var TIME_TRUNCATION = 1e5;
function truncateTime(time) {
  return Math.round(time / TIME_TRUNCATION);
}
function fromTruncatedTime(truncatedTime) {
  return truncatedTime * TIME_TRUNCATION;
}
async function retry(func, maxRetries = 5, retryDelayMs = 500) {
  let attempt = 0;
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
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
var export_geo = import_ngeohash.default;
export {
  ageInDays,
  and,
  centerPos,
  coverageKey,
  definedOr,
  fromTruncatedTime,
  export_geo as geo,
  haversineMiles,
  initialZoom,
  isValidLocation,
  loadConfig,
  maxDistanceMiles,
  or,
  parseLocation,
  posFromHash,
  pushMap,
  retry,
  sampleKey,
  sigmoid,
  truncateTime
};
