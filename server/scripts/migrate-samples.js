#!/usr/bin/env node

/**
 * Migration script to copy samples from one server to another
 * 
 * Fetches samples from source URL and posts them to destination URL.
 * Decodes geohashes to lat/lon coordinates for the API.
 * 
 * Usage:
 *   node scripts/migrate-samples.js
 *   node scripts/migrate-samples.js --source <url> --dest <url>
 */

const geo = require('ngeohash');

// Default URLs
const DEFAULT_SOURCE = 'https://source.domain.com/get-samples';
const DEFAULT_DEST = 'http://dest.domain.com/put-sample';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    source: DEFAULT_SOURCE,
    dest: DEFAULT_DEST,
    delay: 0 // milliseconds between requests
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) {
      config.source = args[i + 1];
      i++;
    } else if (args[i] === '--dest' && args[i + 1]) {
      config.dest = args[i + 1];
      i++;
    } else if (args[i] === '--delay' && args[i + 1]) {
      config.delay = parseInt(args[i + 1], 10) || 0;
      i++;
    }
  }
  
  return config;
}

// Fetch samples from source URL
async function fetchSamples(sourceUrl) {
  console.log(`Fetching samples from ${sourceUrl}...`);
  
  try {
    const response = await fetch(sourceUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.keys || !Array.isArray(data.keys)) {
      throw new Error('Invalid response format: expected { keys: [...] }');
    }
    
    console.log(`✓ Fetched ${data.keys.length} samples`);
    return data.keys;
  } catch (error) {
    console.error(`✗ Failed to fetch samples: ${error.message}`);
    throw error;
  }
}

// Decode geohash to lat/lon
function decodeGeohash(geohash) {
  try {
    const { latitude, longitude } = geo.decode(geohash);
    return { lat: latitude, lon: longitude };
  } catch (error) {
    throw new Error(`Invalid geohash "${geohash}": ${error.message}`);
  }
}

// Post a single sample to destination URL
async function postSample(destUrl, sample) {
  const { name: geohash, metadata } = sample;
  
  // Decode geohash to lat/lon
  const { lat, lon } = decodeGeohash(geohash);
  
  // Build request body
  const body = {
    lat: lat,
    lon: lon,
    path: metadata.path || [],
    snr: metadata.snr ?? null,
    rssi: metadata.rssi ?? null,
    observed: metadata.observed ?? (metadata.path && metadata.path.length > 0)
  };
  
  // Remove null values (optional, but cleaner)
  if (body.snr === null) delete body.snr;
  if (body.rssi === null) delete body.rssi;
  
  try {
    const response = await fetch(destUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }
    
    return true;
  } catch (error) {
    throw new Error(`Failed to post sample ${geohash}: ${error.message}`);
  }
}

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main migration function
async function migrate(config) {
  console.log('Starting sample migration...');
  console.log(`Source: ${config.source}`);
  console.log(`Destination: ${config.dest}`);
  if (config.delay > 0) {
    console.log(`Delay between requests: ${config.delay}ms`);
  }
  console.log('');
  
  // Fetch samples
  let samples;
  try {
    samples = await fetchSamples(config.source);
  } catch (error) {
    console.error('Migration failed: Could not fetch samples');
    process.exit(1);
  }
  
  if (samples.length === 0) {
    console.log('No samples to migrate.');
    return;
  }
  
  // Migrate each sample
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const progress = `[${i + 1}/${samples.length}]`;
    
    try {
      await postSample(config.dest, sample);
      successCount++;
      
      if ((i + 1) % 100 === 0 || i === samples.length - 1) {
        console.log(`${progress} Migrated ${successCount} samples (${errorCount} errors)`);
      }
    } catch (error) {
      errorCount++;
      errors.push({ sample: sample.name || 'unknown', error: error.message });
      
      // Show error immediately for first few, then batch
      if (errorCount <= 10) {
        console.error(`${progress} ✗ ${error.message}`);
      }
    }
    
    // Add delay between requests if specified
    if (config.delay > 0 && i < samples.length - 1) {
      await sleep(config.delay);
    }
  }
  
  // Print summary
  console.log('');
  console.log('Migration complete!');
  console.log(`  ✓ Successfully migrated: ${successCount}`);
  console.log(`  ✗ Failed: ${errorCount}`);
  
  if (errors.length > 0) {
    console.log('');
    console.log('Errors:');
    const displayErrors = errors.slice(0, 20); // Show first 20 errors
    displayErrors.forEach(({ sample, error }) => {
      console.log(`  ${sample}: ${error}`);
    });
    if (errors.length > 20) {
      console.log(`  ... and ${errors.length - 20} more errors`);
    }
  }
  
  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run migration
const config = parseArgs();
migrate(config).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
