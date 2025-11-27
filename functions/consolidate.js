// Consolidates old samples into coverage elements and archives them.
import * as util from '../content/shared.js';

// Merge the new coverage data with the previous (if any).
async function mergeCoverage(key, samples, store) {
  // Get existing coverage entry (or defaults).
  const entry = await store.getWithMetadata(key, "json");
  const value = entry?.value ?? [];
  const metadata = {
    heard: entry?.metadata?.heard ?? 0,
    lost: entry?.metadata?.lost ?? 0,
    lastHeard: entry?.metadata?.lastHeard ?? 0,
    hitRepeaters: entry?.metadata?.hitRepeaters ?? []
  };

  // Add new, distinct samples to the value list.
  samples.forEach(s => {
    const found = value.find(v => v.time == s.time);
    if (!found) 
      value.push({ time: s.time, path: s.path });
  });

  // Go through all values and compute stats.
  const pathSet = new Set(metadata.hitRepeaters);
  value.forEach(s => {
    const heard = s.path.length > 0
    metadata.heard += heard ? 1 : 0;
    metadata.lost += !heard ? 1 : 0;
    metadata.lastHeard = Math.max(metadata.lastHeard, s.time);
    s.path.forEach(p => pathSet.add(p));
  });

  metadata.hitRepeaters = [...pathSet];
  await store.put(key, JSON.stringify(value), { metadata: metadata });
}

export async function onRequest(context) {
  const coverageStore = context.env.COVERAGE;
  const sampleStore = context.env.SAMPLES;
  const archiveStore = context.env.ARCHIVE;

  const url = new URL(context.request.url);
  const maxAge = url.searchParams.get('maxAge') ?? 2; // Days

  const result = {
    coverage_entites_to_update: 0,
    samples_to_update: 0,
    merged_ok: 0,
    merged_fail: 0,
    archive_ok: 0,
    archive_fail: 0,
    delete_ok: 0,
    delete_fail: 0,
    delete_skip: 0
  };
  const hashToSamples = new Map();
  let cursor = null;

  // Build index of old samples.
  do {
    const samplesList = await sampleStore.list({ cursor: cursor });
    cursor = samplesList.cursor ?? null;

    // Group samples by 6-digit hash
    samplesList.keys.forEach(s => {
      // Ignore recent samples.
      if (util.ageInDays(s.metadata.time) < maxAge) return;

      result.samples_to_update++;
      const key = s.name.substring(0, 6);
      util.pushMap(hashToSamples, key, {
        key: s.name,
        time: s.metadata.time,
        path: s.metadata.path
      });
    });
  } while (cursor !== null);

  result.coverage_entites_to_update = hashToSamples.size
  const mergedKeys = [];

  // Merge old samples into coverage data.
  await Promise.all(hashToSamples.entries().map(async ([k, v]) => {
    try {
      await mergeCoverage(k, v, coverageStore);
      result.merged_ok++;
      mergedKeys.push(k);
    } catch (e) {
      console.log(`Merge failed. ${e}`);
      result.merged_fail++;
    }
  }));

  // Archive and delete the old samples.
  await Promise.all(mergedKeys.map(async k => {
    const v = hashToSamples.get(k);
    for (const sample of v) {
      try {
        await archiveStore.put(sample.key, "", {
          metadata: { time: sample.time, path: sample.path }
        });
        result.archive_ok++;
        try {
          await sampleStore.delete(sample.key);
          result.delete_ok++;
        } catch (e) {
          console.log(`Delete failed. ${e}`);
          result.delete_fail++;
        }
      } catch (e) {
        console.log(`Archive failed. ${e}`);
        result.archive_fail++;
        result.delete_skip++;
      }
    }
  }));

  return new Response(JSON.stringify(result));
}
