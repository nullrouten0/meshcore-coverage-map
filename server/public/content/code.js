import {
  ageInDays,
  centerPos,
  geo,
  haversineMiles,
  maxDistanceMiles,
  posFromHash,
  pushMap,
  sigmoid,
  fromTruncatedTime,
} from './shared.js'

// Global Init
const map = L.map('map', { worldCopyJump: true }).setView([37.3382, -121.8863], 10);
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors | <a href="/howto" target="_blank">Contribute</a>'
}).addTo(map);

// Control state
let repeaterRenderMode = 'all';
let repeaterSearch = '';
let showSamples = false;

// Data
let nodes = null; // Graph data from the last refresh
let idToRepeaters = null; // Index of id -> [repeater]
let hashToCoverage = null; // Index of geohash -> coverage
let edgeList = null; // List of connected repeater and coverage
let individualSamples = null; // Individual (non-aggregated) samples

// Map layers
const coverageLayer = L.layerGroup().addTo(map);
const edgeLayer = L.layerGroup().addTo(map);
const sampleLayer = L.layerGroup().addTo(map);
const repeaterLayer = L.layerGroup().addTo(map);

// Repeaters list control (top-right corner, below existing controls)
const repeatersControl = L.control({ position: 'topright' });
repeatersControl.onAdd = m => {
  const div = L.DomUtil.create('div', 'leaflet-control');
  div.style.marginTop = '10px'; // Space below existing control box
  div.innerHTML = `
    <button id="repeaters-button" style="
      background: #4a5568;
      color: white;
      border: 1px solid #718096;
      border-radius: 4px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      white-space: nowrap;
      width: 100%;
    ">Top Repeaters</button>
    <div id="repeaters-list" style="
      display: none;
      margin-top: 4px;
      background: #2d3748;
      border: 1px solid #4a5568;
      border-radius: 4px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      width: 100%;
      max-width: 400px;
      max-height: 500px;
      overflow-y: auto;
    ">
      <div style="padding: 12px; background: #1a202c; border-bottom: 1px solid #4a5568; font-weight: 600; color: #e2e8f0; position: sticky; top: 0;">
        Repeaters by Coverage
      </div>
      <div id="repeaters-list-content" style="padding: 0;"></div>
    </div>
  `;
  
  const button = div.querySelector("#repeaters-button");
  const list = div.querySelector("#repeaters-list");
  const content = div.querySelector("#repeaters-list-content");
  
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    if (list.style.display === "none") {
      updateRepeatersList(content);
      list.style.display = "block";
    } else {
      list.style.display = "none";
    }
  });
  
  // Close when clicking outside
  const closeHandler = () => {
    list.style.display = "none";
  };
  map.on("click", closeHandler);
  
  // Prevent clicks inside the list from closing it
  list.addEventListener("click", (e) => {
    e.stopPropagation();
  });
  
  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);
  
  return div;
};
repeatersControl.addTo(map);

// Map controls
const mapControl = L.control({ position: 'topright' });
mapControl.onAdd = m => {
  const div = L.DomUtil.create('div', 'mesh-control leaflet-control');

  div.innerHTML = `
    <div class="mesh-control-row">
      <label>
        Repeaters:
        <select id="repeater-filter-select">
          <option value="all" selected="true">All</option>
          <option value="hit">Hit</option>
          <option value="none">None</option>
        </select>
      </label>
    </div>
    <div class="mesh-control-row">
      <label>
        Find Id:
        <input type="text" id="repeater-search" />
      </label>
    </div>
    <div class="mesh-control-row">
      <label>
        Show Samples:
        <input type="checkbox" id="show-samples" />
      </label>
    </div>
    <div class="mesh-control-row">
      <button type="button" id="refresh-map-button">Refresh map</button>
    </div>
  `;

  div.querySelector("#repeater-filter-select")
    .addEventListener("change", (e) => {
      repeaterRenderMode = e.target.value;
      updateAllRepeaterMarkers();
    });

  div.querySelector("#repeater-search")
    .addEventListener("input", (e) => {
      repeaterSearch = e.target.value.toLowerCase();
      updateAllRepeaterMarkers();
    });

  div.querySelector("#show-samples")
    .addEventListener("change", async (e) => {
      showSamples = e.target.checked;
      if (showSamples) {
        // Fetch and display all individual samples
        await loadIndividualSamples();
      } else {
        // Clear individual samples and show aggregated view
        clearIndividualSamples();
        // Re-render with aggregated samples from nodes
        if (nodes) {
          renderNodes(nodes);
        }
      }
    });

  div.querySelector("#refresh-map-button")
    .addEventListener("click", () => refreshCoverage());

  // Don't let clicks on the control bubble up and pan/zoom the map.
  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);

  return div;
};

mapControl.addTo(map);

// Max radius circle (only show if distance limit is enabled)
if (maxDistanceMiles > 0) {
  L.circle(centerPos, {
    radius: maxDistanceMiles * 1609.34, // meters in mile
    color: '#a13139',
    weight: 3,
    fill: false
  }).addTo(map);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// Convert success rate (0-1) to a color gradient:
// Dark green (100%) -> Light green -> Orange -> Red-orange -> Red (0%)
function successRateToColor(rate) {
  // Clamp rate to 0-1
  const clampedRate = Math.max(0, Math.min(1, rate));
  
  let red, green, blue;
  
  if (clampedRate >= 0.75) {
    // Dark green (0, 100, 0) to lighter green (50, 150, 50) (75-100%)
    // Making light green closer to dark green
    const t = (clampedRate - 0.75) / 0.25; // 0 to 1
    red = Math.round(0 + (50 - 0) * t);     // 0 -> 50
    green = Math.round(100 + (150 - 100) * t); // 100 -> 150
    blue = Math.round(0 + (50 - 0) * t);    // 0 -> 50
  } else if (clampedRate >= 0.5) {
    // Light green (50, 150, 50) to orange (255, 165, 0) (50-75%)
    const t = (clampedRate - 0.5) / 0.25; // 0 to 1
    red = Math.round(50 + (255 - 50) * t);   // 50 -> 255
    green = Math.round(150 + (165 - 150) * t); // 150 -> 165
    blue = Math.round(50 - 50 * t);           // 50 -> 0
  } else if (clampedRate >= 0.25) {
    // Orange (255, 165, 0) to red-orange (255, 100, 0) (25-50%)
    const t = (clampedRate - 0.25) / 0.25; // 0 to 1
    red = 255;                                    // 255
    green = Math.round(165 + (100 - 165) * t);    // 165 -> 100
    blue = 0;                                      // 0
  } else {
    // Red-orange (255, 100, 0) to red (255, 0, 0) (0-25%)
    const t = clampedRate / 0.25; // 0 to 1
    red = 255;                                    // 255
    green = Math.round(100 - 100 * t);            // 100 -> 0
    blue = 0;                                      // 0
  }
  
  // Convert to hex
  const toHex = (n) => {
    const hex = n.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function coverageMarker(coverage) {
  const [minLat, minLon, maxLat, maxLon] = geo.decode_bbox(coverage.id);
  const totalSamples = coverage.rcv + coverage.lost;
  const heardRatio = totalSamples > 0 ? coverage.rcv / totalSamples : 0;
  // Use gradient color based on success rate
  const color = successRateToColor(heardRatio);
  const date = new Date(fromTruncatedTime(coverage.time));
  const opacity = 0.75 * sigmoid(totalSamples, 1.2, 2) * (heardRatio > 0 ? heardRatio : 1);
  const style = {
    color: color,
    weight: 1,
    fillOpacity: Math.max(opacity, 0.1),
  };
  const rect = L.rectangle([[minLat, minLon], [maxLat, maxLon]], style);
  const details = `
    <strong>${coverage.id}</strong><br/>
    Heard: ${coverage.rcv} Lost: ${coverage.lost} (${(100 * heardRatio).toFixed(0)}%)<br/>
    Updated: ${date.toLocaleString()}
    ${coverage.rptr.length === 0 ? '' : '<br/>Repeaters: ' + coverage.rptr.join(',')}`;

  rect.coverage = coverage;
  rect.bindPopup(details, { maxWidth: 320 });
  rect.on('popupopen', e => updateAllEdgeVisibility(e.target.coverage));
  rect.on('popupclose', () => updateAllEdgeVisibility());

  if (window.matchMedia("(hover: hover)").matches) {
    rect.on('mouseover', e => updateAllEdgeVisibility(e.target.coverage));
    rect.on('mouseout', () => updateAllEdgeVisibility());
  }

  coverage.marker = rect;
  return rect;
}

function sampleMarker(s) {
  const [lat, lon] = posFromHash(s.id);
  // Use success rate to determine color (gradient from red 0% to green 100%)
  const successRate = s.successRate ?? (s.total > 0 ? s.heard / s.total : 0);
  const color = successRateToColor(successRate);
  // Scale marker size based on number of samples (min 5, max 15)
  const radius = Math.min(Math.max(5, Math.sqrt(s.total || 1) * 2), 15);
  const style = { 
    radius: radius, 
    weight: 2, 
    color: color, 
    fillColor: color,
    fillOpacity: 0.7 
  };
  const marker = L.circleMarker([lat, lon], style);
  const date = new Date(fromTruncatedTime(s.time));
  const successPercent = (successRate * 100).toFixed(1);
  const repeaters = s.rptr || [];
  const details = `
    <strong>${s.id}</strong><br/>
    ${lat.toFixed(4)}, ${lon.toFixed(4)}<br/>
    Samples: ${s.total || 0} (${s.heard || 0} heard, ${s.lost || 0} lost)<br/>
    Success Rate: ${successPercent}%<br/>
    ${repeaters.length > 0 ? '<br/>Repeaters: ' + repeaters.join(', ') : ''}
    Updated: ${date.toLocaleString()}`;
  marker.bindPopup(details, { maxWidth: 320 });
  marker.on('add', () => updateSampleMarkerVisibility(marker));
  return marker;
}

function individualSampleMarker(sample) {
  const [lat, lon] = posFromHash(sample.name);
  // Individual sample: heard = has path, lost = no path
  const heard = sample.metadata.path && sample.metadata.path.length > 0;
  const color = heard ? successRateToColor(1.0) : successRateToColor(0.0); // Green if heard, red if lost
  const style = { 
    radius: 4, // Smaller for individual samples
    weight: 1, 
    color: color, 
    fillColor: color,
    fillOpacity: 0.8 
  };
  const marker = L.circleMarker([lat, lon], style);
  const date = new Date(sample.metadata.time);
  const repeaters = sample.metadata.path || [];
  const details = `
    <strong>${sample.name}</strong><br/>
    ${lat.toFixed(4)}, ${lon.toFixed(4)}<br/>
    Status: ${heard ? '<span style="color: green;">Heard</span>' : '<span style="color: red;">Lost</span>'}<br/>
    ${repeaters.length > 0 ? '<br/>Repeaters: ' + repeaters.join(', ') : 'No repeaters heard'}<br/>
    Time: ${date.toLocaleString()}`;
  marker.bindPopup(details, { maxWidth: 320 });
  return marker;
}

function repeaterMarker(r) {
  const time = fromTruncatedTime(r.time);
  const stale = ageInDays(time) > 2;
  const dead = ageInDays(time) > 8;
  const ageClass = (dead ? "dead" : (stale ? "stale" : ""));
  const icon = L.divIcon({
    className: '', // Don't use default Leaflet style.
    html: `<div class="repeater-dot ${ageClass}"><span>${r.id}</span></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
  const details = [
    `<strong>${escapeHtml(r.name)} [${r.id}]</strong>`,
    `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)} · <em>${(r.elev).toFixed(0)}m</em>`,
    `${new Date(time).toLocaleString()}`
  ].join('<br/>');
  const marker = L.marker([r.lat, r.lon], { icon: icon });

  marker.repeater = r;
  marker.bindPopup(details, { maxWidth: 320 });
  marker.on('add', () => updateRepeaterMarkerVisibility(marker));
  marker.on('popupopen', e => updateAllEdgeVisibility(e.target.repeater));
  marker.on('popupclose', () => updateAllEdgeVisibility());

  if (window.matchMedia("(hover: hover)").matches) {
    marker.on('mouseover', e => updateAllEdgeVisibility(e.target.repeater));
    marker.on('mouseout', () => updateAllEdgeVisibility());
  }

  r.marker = marker;
  return marker;
}

function getBestRepeater(fromPos, repeaterList) {
  if (repeaterList.length === 1) {
    return repeaterList[0];
  }

  let minRepeater = null;
  let minDist = 30000; // Bigger than any valid dist.

  repeaterList.forEach(r => {
    const to = [r.lat, r.lon];
    const elev = r.elev ?? 0; // Allow height to impact distance.
    const dist = haversineMiles(fromPos, to) - (0.5 * Math.sqrt(elev));
    if (dist < minDist) {
      minDist = dist;
      minRepeater = r;
    }
  });

  return minRepeater;
}

function shouldShowRepeater(r) {
  // Prioritize searching
  if (repeaterSearch !== '') {
    return r.id.toLowerCase().startsWith(repeaterSearch);
  } else if (repeaterRenderMode === "hit") {
    return r.hitBy.length > 0;
  } else if (repeaterRenderMode === 'none') {
    return false;
  }
  return true;
}

function updateSampleMarkerVisibility(s) {
  const el = s.getElement();
  if (showSamples) {
    el.classList.remove("hidden");
    el.classList.add("leaflet-interactive");
  } else {
    el.classList.add("hidden");
    el.classList.remove("leaflet-interactive");
  }
}

function updateRepeaterMarkerVisibility(m, forceVisible = false, highlight = false) {
  const el = m.getElement();
  if (forceVisible || shouldShowRepeater(m.repeater)) {
    el.classList.remove("hidden");
    el.classList.add("leaflet-interactive");
  } else {
    el.classList.add("hidden");
    el.classList.remove("leaflet-interactive");
  }

  if (highlight) {
    el.querySelector(".repeater-dot").classList.add("highlighted");
  } else {
    el.querySelector(".repeater-dot").classList.remove("highlighted");
  }
}

function updateAllRepeaterMarkers() {
  repeaterLayer.eachLayer(m => updateRepeaterMarkerVisibility(m));
}

function updateCoverageMarkerHighlight(m, highlight = false) {
  const el = m.getElement();
  if (highlight) {
    el.classList.add("highlighted-path");
  } else {
    el.classList.remove("highlighted-path");
  }
}

function updateAllCoverageMarkers() {
  coverageLayer.eachLayer(m => updateCoverageMarkerHighlight(m));
}

function updateAllEdgeVisibility(end) {
  const markersToOverride = [];
  const coverageToHighlight = [];

  // Reset markers to default.
  updateAllRepeaterMarkers();
  updateAllCoverageMarkers();

  edgeLayer.eachLayer(e => {
    if (end !== undefined && e.ends.includes(end)) {
      // e.ends is [repeater, coverage]
      markersToOverride.push(e.ends[0].marker);
      coverageToHighlight.push(e.ends[1].marker);
      e.setStyle({ opacity: 0.6 });
    } else {
      e.setStyle({ opacity: 0 });
    }
  });

  // Force connected repeaters to be shown.
  markersToOverride.forEach(m => updateRepeaterMarkerVisibility(m, true, true));

  // Highlight connected coverage markers.
  coverageToHighlight.forEach(m => updateCoverageMarkerHighlight(m, true));
}

function renderNodes(nodes) {
  coverageLayer.clearLayers();
  edgeLayer.clearLayers();
  sampleLayer.clearLayers();
  repeaterLayer.clearLayers();

  // Add coverage boxes.
  hashToCoverage.entries().forEach(([key, coverage]) => {
    coverageLayer.addLayer(coverageMarker(coverage));
  });

  // Add samples (aggregated if showSamples is false, individual if true)
  if (showSamples && individualSamples) {
    // Show individual samples
    individualSamples.keys.forEach(s => {
      sampleLayer.addLayer(individualSampleMarker(s));
    });
  } else {
    // Show aggregated samples
    nodes.samples.forEach(s => {
      sampleLayer.addLayer(sampleMarker(s));
    });
  }

  // Add repeaters.
  const repeatersToAdd = [...idToRepeaters.values()].flat();
  repeatersToAdd.forEach(r => {
    repeaterLayer.addLayer(repeaterMarker(r));
  });

  // Add edges.
  edgeList.forEach(e => {
    const style = {
      weight: 2,
      opacity: 0,
      dashArray: '2,4',
      interactive: false,
    };
    const line = L.polyline([e.repeater.pos, e.coverage.pos], style);
    line.ends = [e.repeater, e.coverage];
    line.addTo(edgeLayer);
  });
}

function buildIndexes(nodes) {
  hashToCoverage = new Map();
  idToRepeaters = new Map();
  edgeList = [];

  // Index coverage items.
  nodes.coverage.forEach(c => {
    const { latitude: lat, longitude: lon } = geo.decode(c.id);
    c.pos = [lat, lon];
    if (c.rptr === undefined) c.rptr = [];
    hashToCoverage.set(c.id, c);
  });

  // Add aggregated samples to coverage items.
  // Samples are now already aggregated by geohash prefix on the server
  nodes.samples.forEach(s => {
    const key = s.id; // Already a 6-char geohash prefix from server
    let coverage = hashToCoverage.get(key);
    if (!coverage) {
      const { latitude: lat, longitude: lon } = geo.decode(key);
      coverage = {
        id: key,
        pos: [lat, lon],
        rcv: s.heard || 0,
        lost: s.lost || 0,
        time: s.time || 0,
        rptr: s.rptr ? [...s.rptr] : [],
      };
      hashToCoverage.set(key, coverage);
    } else {
      // Merge sample data into existing coverage
      coverage.rcv = (coverage.rcv || 0) + (s.heard || 0);
      coverage.lost = (coverage.lost || 0) + (s.lost || 0);
      if (s.time > (coverage.time || 0)) {
        coverage.time = s.time;
      }
      // Merge repeaters (avoid duplicates)
      if (s.rptr) {
        s.rptr.forEach(r => {
          const rLower = r.toLowerCase();
          if (!coverage.rptr.includes(rLower)) {
            coverage.rptr.push(rLower);
          }
        });
      }
    }
  });

  // Index repeaters.
  nodes.repeaters.forEach(r => {
    r.hitBy = [];
    r.pos = [r.lat, r.lon];
    pushMap(idToRepeaters, r.id, r);
  });

  // Build connections.
  hashToCoverage.entries().forEach(([key, coverage]) => {
    coverage.rptr.forEach(r => {
      const candidateRepeaters = idToRepeaters.get(r);
      if (candidateRepeaters === undefined)
        return;

      const bestRepeater = getBestRepeater(coverage.pos, candidateRepeaters);
      bestRepeater.hitBy.push(coverage);
      edgeList.push({ repeater: bestRepeater, coverage: coverage });
    });
  });
}

// Update repeaters list content
function updateRepeatersList(contentDiv) {
  if (!nodes || !idToRepeaters) {
    contentDiv.innerHTML = '<div style="padding: 20px; color: #e2e8f0; text-align: center;">No repeater data available.<br/>Please refresh the map first.</div>';
    return;
  }

  // Count geohashes per repeater
  const repeaterGeohashCount = new Map();
  
  let coverageWithRepeaters = 0;
  hashToCoverage.forEach((coverage) => {
    if (coverage.rptr && coverage.rptr.length > 0) {
      coverageWithRepeaters++;
      coverage.rptr.forEach(repeaterId => {
        const idLower = repeaterId.toLowerCase();
        repeaterGeohashCount.set(idLower, (repeaterGeohashCount.get(idLower) || 0) + 1);
      });
    }
  });

  // Get all repeaters with their geohash counts
  const repeaterStats = [];
  idToRepeaters.forEach((repeaters, id) => {
    const count = repeaterGeohashCount.get(id.toLowerCase()) || 0;
    if (count > 0) {
      repeaterStats.push({
        id: id,
        name: repeaters[0]?.name || id,
        geohashCount: count
      });
    }
  });

  // Sort by geohash count (descending)
  repeaterStats.sort((a, b) => b.geohashCount - a.geohashCount);

  if (repeaterStats.length === 0) {
    const totalRepeaters = idToRepeaters.size;
    const totalCoverage = hashToCoverage.size;
    contentDiv.innerHTML = `<div style="padding: 20px; color: #e2e8f0; text-align: center;">
      No repeaters with coverage data found.<br/><br/>
      <div style="font-size: 11px; color: #9ca3af; margin-top: 8px;">
        Total repeaters: ${totalRepeaters}<br/>
        Total coverage areas: ${totalCoverage}<br/>
        Coverage with repeaters: ${coverageWithRepeaters}
      </div>
      <div style="font-size: 11px; color: #9ca3af; margin-top: 12px;">
        Tip: Add samples with repeater paths to populate this list.
      </div>
    </div>`;
    return;
  }

  // Create clean list
  let html = '<table style="width: 100%; border-collapse: collapse; font-size: 13px;">';
  html += '<thead><tr style="background: #1a202c; color: #cbd5e0;">';
  html += '<th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid #4a5568; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">#</th>';
  html += '<th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid #4a5568; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">ID</th>';
  html += '<th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid #4a5568; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Name</th>';
  html += '<th style="padding: 10px 12px; text-align: right; border-bottom: 1px solid #4a5568; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Geohashes</th>';
  html += '</tr></thead><tbody>';
  
  repeaterStats.forEach((repeater, index) => {
    const rowColor = index % 2 === 0 ? '#2d3748' : '#1a202c';
    html += `<tr style="background: ${rowColor}; color: #e2e8f0; border-bottom: 1px solid #4a5568; transition: background 0.2s;">
      <td style="padding: 10px 12px; color: #9ca3af; font-weight: 500;">${index + 1}</td>
      <td style="padding: 10px 12px; font-family: 'Courier New', monospace; font-weight: 600; color: #60a5fa;">${escapeHtml(repeater.id)}</td>
      <td style="padding: 10px 12px;">${escapeHtml(repeater.name)}</td>
      <td style="padding: 10px 12px; text-align: right; color: #34d399; font-weight: 700; font-size: 14px;">${repeater.geohashCount}</td>
    </tr>`;
  });
  
  html += '</tbody></table>';
  contentDiv.innerHTML = html;
}

async function loadIndividualSamples() {
  try {
    const endpoint = "/get-samples";
    const resp = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });

    if (!resp.ok)
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

    individualSamples = await resp.json();
    
    // Clear sample layer and render with individual samples
    sampleLayer.clearLayers();
    individualSamples.keys.forEach(s => {
      sampleLayer.addLayer(individualSampleMarker(s));
    });
  } catch (error) {
    console.error("Error loading individual samples:", error);
    alert("Failed to load individual samples: " + error.message);
  }
}

function clearIndividualSamples() {
  individualSamples = null;
  // Don't clear the layer here - renderNodes will handle it
}

export async function refreshCoverage() {
  const endpoint = "/get-nodes";
  const resp = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });

  if (!resp.ok)
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

  nodes = await resp.json();
  buildIndexes(nodes);
  renderNodes(nodes);
}
