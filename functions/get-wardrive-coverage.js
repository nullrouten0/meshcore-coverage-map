// Returns the geohashes all coverage cells with recent data.
import * as util from '../content/shared.js';

const LOOK_BACK_DAYS = 3;

export async function onRequest(context) {
  const coverageStore = context.env.COVERAGE;
  const sampleStore = context.env.SAMPLES;
  const covered = new Set();
  let cursor = null;

  do {
    const coverage = await coverageStore.list({ cursor: cursor });
    cursor = coverage.cursor ?? null;
    coverage.keys.forEach(c => {
      const lastHeard = c.metadata.lastHeard ?? 0;
      if (util.ageInDays(lastHeard) < LOOK_BACK_DAYS)
        covered.add(c.name);
      });
  } while (cursor !== null)

  do {
    const samplesList = await sampleStore.list({ cursor: cursor });
    cursor = samplesList.cursor ?? null;
    samplesList.keys.forEach(s => {
      // All samples are assumed recent.
      covered.add(s.name.substring(0, 6));
    });
  } while (cursor !== null)

  return new Response(JSON.stringify(Array.from(covered)));
}
