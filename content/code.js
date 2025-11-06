// Global Init
const map = L.map('map', { worldCopyJump: true }).setView([47.76837, -122.06078], 12);
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let sampleLayer = L.layerGroup().addTo(map);
let repeaterLayer = L.layerGroup().addTo(map);
let edgeLayer = L.layerGroup().addTo(map);

function setStatus(msg, isError = false) {
  if (isError === false) {
    console.log(msg);
  } else {
    console.error(msg);
  }
}

function renderGraph(graph) {
  // Clear old
  pointsLayer.remove(); pointsLayer = L.layerGroup().addTo(map);
  clusterLayer.remove(); clusterLayer = L.markerClusterGroup({ showCoverageOnHover: false, spiderfyOnMaxZoom: true });
  pathLayer.setLatLngs([]);
  edgesLayer.clearLayers();

  const useCluster = $('#chkCluster').checked;
  const drawEdges = $('#chkEdges').checked;
  const autoFit = $('#chkFit').checked;

  const bounds = [];

  // Markers
  graph.points.forEach(rec => {
    const marker = markerFor(rec);
    bounds.push([rec.lat, rec.lng]);
    if (useCluster) clusterLayer.addLayer(marker); else pointsLayer.addLayer(marker);
  });
  if (useCluster) clusterLayer.addTo(map);

  // Edges
  if (drawEdges) {
    let ok = 0, miss = 0;
    graph.edges.forEach(pair => {
      const [a, b] = pair.split(',').map(s => s.trim());
      const A = graph.idToLatLng.get(a), B = graph.idToLatLng.get(b);
      if (A && B) {
        L.polyline([A, B], { weight: 2, opacity: 0.8, dashArray: '4,6' }).addTo(edgesLayer);
        ok++;
      } else {
        miss++;
      }
    });
    if (ok > 0) edgesLayer.bringToFront();
    setStatus(`Plotted ${graph.points.length} points. Drew ${ok} edge(s)${miss ? `, ${miss} missing id(s)` : ''}.`);
  } else {
    setStatus(`Plotted ${graph.points.length} points.`);
  }

  if (autoFit && bounds.length) {
    if (bounds.length === 1) map.setView(bounds[0], 14); else map.fitBounds(bounds, { padding: [24, 24] });
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function sampleMarker(s) {
  const color = s.heard !== null ? '#07ac07' : '#e96767';
  const style = { radius: 6, weight: 1, color: color, fillOpacity: .9 };
  const marker = L.circleMarker([s.lat, s.lon], style);
  const details = `${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`;
  marker.bindPopup(details, { maxWidth: 320 });
  return marker;
}

function repeaterMarker(r) {
  const color = '#0a66c2';
  const style = { radius: 6, weight: 2, color: color, fillOpacity: .25 };
  const marker = L.circleMarker([r.lat, r.lon], style);
  const details = [
    `<strong>${escapeHtml(r.name)}</strong>`,
    `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`
  ].join('<br/>');
  marker.bindPopup(details, { maxWidth: 320 });
  return marker;
}

function renderData(data) {
  sampleLayer.clearLayers();
  repeaterLayer.clearLayers();

  data.samples.forEach(s => {
    sampleLayer.addLayer(sampleMarker(s));
  });

  data.repeaters.forEach(s => {
    repeaterLayer.addLayer(repeaterMarker(s));
  });

  // TODO: Edges need index built.
}

async function refreshCoverage() {
  const endpoint = "/getdata";
  const resp = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });

  if (!resp.ok)
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

  const data = await resp.json();
  renderData(data);
}
