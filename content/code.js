import { ageInDays, haversineMiles, pushMap, geo } from './shared.js'

// Global Init
const map = L.map('map', { worldCopyJump: true }).setView([47.76837, -122.06078], 10);
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Control state
let repeaterRenderMode = 'hit';
let repeaterSearch = '';
let showEdges = true;

// Data
let nodes = null; // Graph data from the last refresh
let idToRepeaters = null; // Index of id -> [repeater]
let hashToSamples = null; // Index of geohash -> [sample]

// Map layers
let tileLayer = L.layerGroup().addTo(map);
let edgeLayer = L.layerGroup().addTo(map);
let sampleLayer = L.layerGroup().addTo(map);
let repeaterLayer = L.layerGroup().addTo(map);

// Map controls
const mapControl = L.control({ position: 'topright' });
mapControl.onAdd = m => {
  const div = L.DomUtil.create('div', 'mesh-control leaflet-control');

  div.innerHTML = `
    <div class="mesh-control-row">
      <label>
        Repeaters:
        <select id="repeater-filter-select">
          <option value="all">All</option>
          <option value="hit" selected="true">Hit</option>
          <option value="none">None</option>
        </select>
      </label>
    </div>
    <div class="mesh-control-row">
      <label>
        Show Edges:
        <input type="checkbox" checked="true" id="show-edges" />
      </label>
    </div>
    <div class="mesh-control-row">
      <label>
        Find Id:
        <input type="text" id="repeater-search" />
      </label>
    </div>
    <div class="mesh-control-row">
      <button type="button" id="refresh-map-button">Refresh map</button>
    </div>
  `;

  div.querySelector("#repeater-filter-select")
    .addEventListener("change", (e) => {
      repeaterRenderMode = e.target.value;
      renderNodes(nodes);
    });

  div.querySelector("#show-edges")
    .addEventListener("change", (e) => {
      showEdges = e.target.checked;
      renderNodes(nodes);
    });

  div.querySelector("#repeater-search")
    .addEventListener("input", (e) => {
      repeaterSearch = e.target.value.toLowerCase();
      renderNodes(nodes);
    });

  div.querySelector("#refresh-map-button")
    .addEventListener("click", () => refreshCoverage());


  // Don’t let clicks on the control bubble up and pan/zoom the map.
  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);

  return div;
};

mapControl.addTo(map);

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function coverageMarker(hash, paths, samples) {
  const [minLat, minLon, maxLat, maxLon] = geo.decode_bbox(hash);
  const color = paths.size > 0 ? '#07ac07' : '#e96767';
  const latest = samples.reduce((max, curr) => max.time > curr.time ? max : curr, 0);
  let [heard, lost] = [0, 0];
  samples.forEach(s => {
    // TODO: iterate once for everything
    if (s.path.length > 0) heard++;
    else lost++;
  });
  const date = new Date(latest.time);
  const style = {
    color: color,
    weight: 1,
    fillOpacity: .3,
  };
  const rect = L.rectangle([[minLat, minLon], [maxLat, maxLon]], style);
  const details = `
    <strong>${hash}</strong><br/>
    Heard: ${heard} Lost: ${lost} (${(100 * heard / (heard + lost)).toFixed(0)}%)<br/>
    Updated: ${date.toLocaleString()}
    ${paths.size === 0 ? '' : '<br/>Repeaters: ' + Array.from(paths).join(',')}`;
  rect.bindPopup(details, { maxWidth: 320 });
  return rect;
}

function sampleMarker(s) {
  const color = s.path.length > 0 ? '#07ac07' : '#e96767';
  const style = { radius: 5, weight: 1, color: color, fillOpacity: .8 };
  const marker = L.circleMarker([s.lat, s.lon], style);
  const date = new Date(s.time);
  const details = `
    ${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}<br/>
    ${date.toLocaleString()}
    ${s.path.length === 0 ? '' : '<br/>Hit: ' + s.path.join(',')}`;
  marker.bindPopup(details, { maxWidth: 320 });
  return marker;
}

function repeaterMarker(r) {
  const stale = ageInDays(r.time) > 2;
  const dead = ageInDays(r.time) > 8;
  const ageClass = (dead ? "dead" : (stale ? "stale" : ""));
  const icon = L.divIcon({
    className: '', // Don't use default Leaflet style.
    html: `<div class="repeater-dot ${ageClass}"><span>${r.id}</span></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
  const marker = L.marker([r.lat, r.lon], { icon: icon });
  const details = [
    `<strong>${escapeHtml(r.name)} [${r.id}]</strong>`,
    `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)} · <em>${(r.elev).toFixed(0)}m</em>`,
    `${new Date(r.time).toLocaleString()}`
  ].join('<br/>');
  marker.bindPopup(details, { maxWidth: 320 });
  return marker;
}

function getNearestRepeater(fromPos, repeaterList) {
  if (repeaterList.length === 1) {
    return repeaterList[0];
  }

  let minRepeater = null;
  let minDist = 30000; // Bigger than any valid dist.

  repeaterList.forEach(r => {
    const to = [r.lat, r.lon];
    const elev = r.elev ?? 0; // Allow height to impact distance.
    const dist = haversineMiles(fromPos, to) - (0.25 * Math.sqrt(elev));
    if (dist < minDist) {
      minDist = dist;
      minRepeater = r;
    }
  });

  return minRepeater;
}

function renderNodes(nodes) {
  tileLayer.clearLayers();
  edgeLayer.clearLayers();
  sampleLayer.clearLayers();
  repeaterLayer.clearLayers();
  const outEdges = [];

  // Add coverage boxes.
  hashToSamples.entries().forEach(([hash, samples]) => {
    const { latitude: lat, longitude: lon } = geo.decode(hash);
    const allPaths = new Set();

    samples.forEach(s => {
      s.path.forEach(p => allPaths.add(p));
    });
    allPaths.forEach(p => {
      outEdges.push({ id: p, pos: [lat, lon] });
    });

    tileLayer.addLayer(coverageMarker(hash, allPaths, samples));
  });

  // Add samples.
  nodes.samples.forEach(s => {
    if (ageInDays(s.time) > 2)
      return;

    sampleLayer.addLayer(sampleMarker(s));
    // Added by coverage. TODO: Either/or with setting?
    // s.path.forEach(p => {
    //   outEdges.push({ id: p, pos: [s.lat, s.lon] });
    // });
  });

  // Are repeaters/edges needed?
  if (repeaterRenderMode === 'none') return;

  // Helper to decide if a repeater id should be shown.
  const shouldShowId = id =>
    repeaterSearch !== '' ? id.toLowerCase().startsWith(repeaterSearch) : true;

  // TODO: only render paths when hovered over a sample. LayerGroups?
  // TODO: hit list can be computed once, edges can be computed once.
  // Draw edges, determine hit repeaters.
  const hitRepeaters = new Set();
  const showAll = repeaterRenderMode === 'all';
  outEdges.forEach(edge => {
    if (!shouldShowId(edge.id))
      return;

    const candidates = idToRepeaters.get(edge.id);
    if (candidates === undefined)
      return;

    const from = edge.pos;
    const nearest = getNearestRepeater(from, candidates);
    const to = [nearest.lat, nearest.lon];
    hitRepeaters.add(nearest);

    if (showEdges === true) {
      L.polyline([from, to], { weight: 2, opacity: 0.8, dashArray: '1,6' }).addTo(edgeLayer);
    }
  });

  // Add repeaters.
  const repeatersToAdd = showAll ? [...idToRepeaters.values()].flat() : hitRepeaters;
  repeatersToAdd.forEach(r => {
    if (shouldShowId(r.id))
      repeaterLayer.addLayer(repeaterMarker(r));
  });
}

function buildIndex(nodes) {
  hashToSamples = new Map();
  idToRepeaters = new Map();

  // Index samples as precision 6.
  nodes.samples.forEach(s => {
    const key = geo.encode(s.lat, s.lon, 6);
    pushMap(hashToSamples, key, s);
  });

  // Index repeaters.
  nodes.repeaters.forEach(r => {
    pushMap(idToRepeaters, r.id, r);
  });
}

export async function refreshCoverage() {
  const endpoint = "/get-nodes";
  const resp = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });

  if (!resp.ok)
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

  nodes = await resp.json();
  buildIndex(nodes);
  renderNodes(nodes);
}
