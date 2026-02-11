#!/usr/bin/env node

/**
 * Build "Top Repeaters" stats from the /get-samples API.
 *
 * This mirrors the map's Top Repeaters logic:
 * - group samples by 6-char geohash prefix (coverage tile)
 * - for each tile, collect unique repeater IDs seen in sample path
 * - count how many tiles each repeater appears in
 * - sort descending by tile count
 *
 * Usage:
 *   node scripts/top-repeaters-from-samples.js --url http://localhost:3000/get-samples
 *   node scripts/top-repeaters-from-samples.js --url https://example.com/get-samples --limit 25
 *   node scripts/top-repeaters-from-samples.js --url https://example.com/get-samples --prefix c23n
 */

const DEFAULT_URL = 'http://localhost:3000/get-samples';
const DEFAULT_LIMIT = 50;

function parseArgs(argv) {
  const config = {
    url: DEFAULT_URL,
    limit: DEFAULT_LIMIT,
    prefix: null,
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--url' && argv[i + 1]) {
      config.url = argv[++i];
    } else if (arg === '--limit' && argv[i + 1]) {
      config.limit = Math.max(1, parseInt(argv[++i], 10) || DEFAULT_LIMIT);
    } else if (arg === '--prefix' && argv[i + 1]) {
      config.prefix = String(argv[++i]);
    } else if (arg === '--json') {
      config.json = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return config;
}

function printHelp() {
  console.log(`Top Repeaters from /get-samples\n
Options:
  --url <endpoint>   Full /get-samples endpoint URL (default: ${DEFAULT_URL})
  --limit <n>        Max rows to print (default: ${DEFAULT_LIMIT})
  --prefix <p>       Optional geohash prefix filter (sent as ?p=<p>)
  --json             Emit JSON instead of a table
  -h, --help         Show this help\n`);
}

async function fetchSamples(config) {
  const url = new URL(config.url);
  if (config.prefix) {
    url.searchParams.set('p', config.prefix);
  }

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data || !Array.isArray(data.keys)) {
    throw new Error('Invalid response payload (expected { keys: [...] })');
  }

  return { samples: data.keys, url: url.toString() };
}

function getSampleGeohash(sample) {
  if (typeof sample.name === 'string' && sample.name.length > 0) return sample.name;
  if (typeof sample.hash === 'string' && sample.hash.length > 0) return sample.hash;
  return null;
}

function getSamplePath(sample) {
  const metadataPath = sample?.metadata?.path;
  if (Array.isArray(metadataPath)) return metadataPath;

  const flatPath = sample?.path;
  if (Array.isArray(flatPath)) return flatPath;

  const legacyPath = sample?.metadata?.rptr ?? sample?.rptr;
  if (Array.isArray(legacyPath)) return legacyPath;

  return [];
}

function computeTopRepeaters(samples) {
  // geohashPrefix -> Set<repeaterId>
  const tileToRepeaters = new Map();

  for (const sample of samples) {
    const geohash = getSampleGeohash(sample);
    if (!geohash || geohash.length < 6) continue;

    const tile = geohash.substring(0, 6);
    const path = getSamplePath(sample);
    if (!tileToRepeaters.has(tile)) {
      tileToRepeaters.set(tile, new Set());
    }

    const bucket = tileToRepeaters.get(tile);
    for (const rawId of path) {
      if (rawId === null || rawId === undefined) continue;
      const id = String(rawId).toLowerCase();
      if (id) bucket.add(id);
    }
  }

  // repeaterId -> tileCount
  const repeaterTileCounts = new Map();

  for (const repeaterSet of tileToRepeaters.values()) {
    for (const repeaterId of repeaterSet) {
      repeaterTileCounts.set(repeaterId, (repeaterTileCounts.get(repeaterId) || 0) + 1);
    }
  }

  const rows = Array.from(repeaterTileCounts.entries())
    .map(([id, geohashCount]) => ({ id, geohashCount }))
    .sort((a, b) => {
      if (b.geohashCount !== a.geohashCount) return b.geohashCount - a.geohashCount;
      return a.id.localeCompare(b.id);
    });

  return {
    rows,
    stats: {
      sampleCount: samples.length,
      coverageTileCount: tileToRepeaters.size,
      repeaterCount: rows.length,
    },
  };
}

function printTable(topRows, stats, sourceUrl) {
  console.log(`Source: ${sourceUrl}`);
  console.log(`Samples: ${stats.sampleCount}`);
  console.log(`Coverage tiles (6-char geohash): ${stats.coverageTileCount}`);
  console.log(`Repeaters with coverage: ${stats.repeaterCount}`);
  console.log('');

  if (topRows.length === 0) {
    console.log('No repeater coverage found in samples.');
    return;
  }

  const header = `${'#'.padStart(4)}  ${'Repeater'.padEnd(12)}  CoverageTiles`;
  console.log(header);
  console.log('-'.repeat(header.length));

  topRows.forEach((row, index) => {
    console.log(`${String(index + 1).padStart(4)}  ${row.id.padEnd(12)}  ${row.geohashCount}`);
  });
}

async function main() {
  const config = parseArgs(process.argv.slice(2));

  const { samples, url } = await fetchSamples(config);
  const { rows, stats } = computeTopRepeaters(samples);
  const topRows = rows.slice(0, config.limit);

  if (config.json) {
    console.log(JSON.stringify({ source: url, stats, topRepeaters: topRows }, null, 2));
    return;
  }

  printTable(topRows, stats, url);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
