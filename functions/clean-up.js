import * as util from '../content/shared.js';

async function cleanCoverage(context, result) {
  const store = context.env.COVERAGE;
  let cursor = null;

  result.coverage_deduped = 0;

  do {
    const coverage = await store.list({ cursor: cursor });
    cursor = coverage.cursor ?? null;

    for (const key of coverage.keys) {
      try {
        const values = await store.get(key.name, "json");
        const groups = Object.groupBy(values, ({ time }) => time);

        // If there are dupes, there will be fewer groups than values.
        const groupCount = Object.keys(groups).length
        const hasDupes = groupCount !== values.length

        const metadata = key.metadata;
        const samplesCount = metadata.heard + metadata.lost;
        const hasMismatchCounts = groupCount !== samplesCount;

        if (!(hasDupes || hasMismatchCounts)) {
          // All good.
          continue;
        }

        // Take the first item from each group.
        const newValue = Object.entries(groups).map(
          ([k, v]) => {
            return { time: k, path: v[0].path };
          });

        // Fixup metadata counts.
        metadata.heard = 0;
        metadata.lost = 0;
        metadata.lastHeard = 0
        newValue.forEach(s => {
          const heard = s.path.length > 0
          metadata.heard += heard ? 1 : 0;
          metadata.lost += !heard ? 1 : 0;
          metadata.lastHeard = Math.max(metadata.lastHeard, s.time);
        });

        const newValueJson = JSON.stringify(newValue)
        console.log(`Putting ${key.name} ${newValueJson}`);
        await store.put(key.name, newValueJson, {
          metadata: key.metadata
        });
        result.coverage_deduped++;
        
      } catch (e) {
        console.log(`Error handling ${key}: ${e}`);
      }
    }
  } while (cursor !== null);
}

async function cleanSamples(context, result) {
  // This should mostly be done by consolidate.js
}

function overlaps(a, b) {
  const dist = util.haversineMiles(a, b);
  return dist <= 0.25;  // Consider anything under 1/4 mile overlapped.
}

function groupByOverlap(items) {
  const groups = [];

  for (const i of items) {
    let found = false;
    const loc = [i.metadata.lat, i.metadata.lon];

    // Look for an existing overlap group.
    // TODO: Technically should compute a group center for comparison.
    for (const g of groups) {
      if (overlaps(g.loc, loc)) {
        g.items.push(i);
        found = true;
        break;
      }
    }

    if (!found) {
      // Add a new group.
      groups.push({ id: i.metadata.id, loc: loc, items: [i] });
    }
  }

  return groups;
}

async function deduplicateGroup(group, store) {
  let deletedRepeaters = 0;

  if (group.items.length === 1) {
    //console.log(`Group ${group.id} ${group.loc} only has 1 item.`);
    return deletedRepeaters;
  }

  // In groups with duplicates, keep the newest.
  const itemsToDelete = [];
  group.items.reduce((max, current) => {
    if (max === null) {
      return current;
    }
    itemsToDelete.push(max.metadata.time > current.metadata.time ? current : max);
    return max.metadata.time > current.metadata.time ? max : current;
  }, null);

  // Delete all the older items.
  await Promise.all(itemsToDelete.map(async i => {
    console.log(`Deleting duplicate of [${group.id} ${group.loc}] ${i.name}`);
    await store.delete(i.name);
    deletedRepeaters++;
  }));

  return deletedRepeaters;
}

async function cleanRepeaters(context, result) {
  const store = context.env.REPEATERS;
  const repeatersList = await store.list();
  const indexed = new Map();

  result.deleted_stale_repeaters = 0;
  result.deleted_dupe_repeaters = 0;

  // Delete stale entries.
  await Promise.all(repeatersList.keys.map(async r => {
    const time = r.metadata.time ?? 0;
    if (util.ageInDays(time) > 10) {
      console.log(`Deleting stale ${r.name}`);
      await store.delete(r.name);
      result.deleted_stale_repeaters++;
    }
  }));

  // Index repeaters by Id.
  repeatersList.keys.forEach(r => {
    const metadata = r.metadata;
    const items = indexed.get(metadata.id) ?? [];
    items.push(r);
    indexed.set(metadata.id, items);
  });

  // Compute overlap groups and deduplicate.
  await Promise.all(indexed.entries().map(async ([key, val]) => {
    if (val.length >= 1) {
      const groups = groupByOverlap(val);
      await Promise.all(groups.map(async g => {
        result.deleted_dupe_repeaters += await deduplicateGroup(g, store);
      }));
    }
  }));
}

export async function onRequest(context) {
  const result = {};

  await cleanCoverage(context, result);
  await cleanSamples(context, result);
  await cleanRepeaters(context, result);

  return new Response(JSON.stringify(result));
}
