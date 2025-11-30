import { parseLocation } from '../content/shared.js'
// TODO: move to geohash

async function getElevation(lat, lon) {
  try {
    const apiUrl = `https://api.opentopodata.org/v1/ned10m?locations=${lat},${lon}`;
    const resp = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await resp.json();
    return data.results[0].elevation;
  } catch (e) {
    console.log(`Error getting elevation for [${lat},${lon}]. ${e}`);
    return null;
  }
}

export async function onRequest(context) {
  const request = context.request;
  const data = await request.json();
  const store = context.env.REPEATERS;
  
  const [lat, lon] = parseLocation(data.lat, data.lon);
  const time = Date.now();
  const id = data.id.toLowerCase();
  const name = data.name;

  const key = `${id}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
  const metadata = { time: time, id: id, name: name, lat: lat, lon: lon, elev: null };
  const resp = await store.getWithMetadata(key);

  if (resp.value !== null && resp.metadata !== null) {
    metadata.elev = resp.metadata.elev ?? null;
  }

  if (metadata.elev === null) {
    metadata.elev = await getElevation(lat, lon);
  }

  await store.put(key, "", {
    metadata: metadata
  });

  return new Response('OK');
}
