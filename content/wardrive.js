import { WebBleConnection, Constants } from "/content/mc/index.js";
import {
  centerPos,
  coverageKey,
  geo,
  haversineMiles,
  isValidLocation
} from "/content/shared.js";

// --- DOM helpers ---
const $ = id => document.getElementById(id);
const statusEl = $("status");
const deviceNameEl = $("deviceName");
const channelInfoEl = $("channelInfo");
const lastSampleInfoEl = $("lastSampleInfo");
const currentTileEl = $("currentTileHash");
const currentNeedsPingEl = $("currentNeedsPing");
const mapEl = $("map");
const controlsSection = $("controls");
const intervalSection = $("interval-controls");
const ignoredRepeaterId = $("ignoredRepeaterId");
const logBody = $("logBody");
const debugConsole = $("debugConsole");

const connectBtn = $("connectBtn");
const disconnectBtn = $("disconnectBtn");
const sendPingBtn = $("sendPingBtn");
const autoToggleBtn = $("autoToggleBtn");
const clearLogBtn = $("clearLogBtn");
const pingModeSelect = $("pingModeSelect");
const intervalSelect = $("intervalSelect");
const minDistanceSelect = $("minDistanceSelect");
const ignoredRepeaterBtn = $("ignoredRepeaterBtn");

const wardriveChannelName = "#wardrive";

// --- Global Init ---
const map = L.map('map', {
  worldCopyJump: true,
  dragging: true,
  scrollWheelZoom: true,
  touchZoom: true,
  boxZoom: false,
  keyboard: false,
  tap: false,
  zoomControl: false,
  doubleClickZoom: false
}).setView(centerPos, 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 13,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);
const coverageLayer = L.layerGroup().addTo(map);
const currentLocMarker = L.circleMarker([0, 0], {
  radius: 3,
  weight: 0,
  color: "red",
  fillOpacity: .8
}).addTo(map);

function setStatus(text, color = null) {
  statusEl.textContent = text;
  log(`status: ${text}`);
  statusEl.className = "font-semibold " + (color ?? "");
}

function log(msg) {
  // const entry = document.createElement('pre');
  // entry.textContent = msg;
  // debugConsole.appendChild(entry);

  console.log(msg);
}

// --- State ---
const LOG_KEY = "meshcoreWardriveLogV1";
const IGNORED_ID_KEY = "meshcoreWardriveIgnoredIdV1"

const state = {
  connection: null,
  selfInfo: null,
  wardriveChannel: null,
  pingMode: "fill",
  running: false,
  autoTimerId: null,
  lastSample: null, // { lat, lon, timestamp }
  wakeLock: null,
  ignoredId: null, // Allows a repeater to be ignored.
  coveredTiles: new Set(),
  locationTimer: null,
  lastPosUpdate: 0, // Timestamp of last location update.
  currentPos: [0, 0],
  log: [],
};

// --- Utility functions ---
function getIntervalMinutes() {
  return parseFloat(intervalSelect.value || "0.5");
}

function getMinDistanceMiles() {
  return parseFloat(minDistanceSelect.value || "0.5");
}

function formatIsoLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

// --- Coverage Functions ---
async function refreshCoverageData() {
  try {
    const resp = await fetch("/get-wardrive-coverage");
    const coveredTiles = (await resp.json()) ?? [];
    log(`Got ${coveredTiles.length} covered tiles from service.`);
    coveredTiles.forEach(x => state.coveredTiles.add(x));
  } catch (e) {
    console.error("Getting coverage failed", e);
    setStatus("Get coverage failed", "text-red-300");
  }
}

function getCoverageBoxMarker(tileId) {
  const [minLat, minLon, maxLat, maxLon] = geo.decode_bbox(tileId);
  const style = {
    color: "#FFAB77",
    weight: 1,
    fillOpacity: 0.4,
  };
  return L.rectangle([[minLat, minLon], [maxLat, maxLon]], style);
}

function addCoverageBox(tileId) {
  coverageLayer.addLayer(getCoverageBoxMarker(tileId));
}

function redrawCoverage() {
  coverageLayer.clearLayers();
  state.coveredTiles.forEach(c => {
    addCoverageBox(c);
  });
}

// --- Local storage log ---
function loadLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (raw) {
      state.log = JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Failed to load wardrive log", e);
  }
  renderLog();
}

function saveLog() {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(state.log));
  } catch (e) {
    console.warn("Failed to save wardrive log", e);
  }
}

function addLogEntry(entry) {
  state.log.push(entry);
  // Keep it from growing forever
  const maxEntries = 50;
  if (state.log.length > maxEntries) {
    state.log.splice(0, state.log.length - maxEntries);
  }
  saveLog();
  renderLog();
}

function renderLog() {
  logBody.innerHTML = "";
  const rows = state.log.reverse(); // Newest first
  for (const entry of rows) {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-900/60";
    const skipped = entry.skipped ?? false;

    const cells = [
      formatIsoLocal(entry.timestamp),
      entry.lat?.toFixed(4) ?? "",
      entry.lon?.toFixed(4) ?? "",
      entry.mode ?? "",
      entry.distanceMiles != null ? entry.distanceMiles.toFixed(1) : "",
      entry.sentToMesh ? "✅" : skipped ? "⊗" : "❌",
      entry.sentToService ? "✅" : skipped ? "⊗" : "❌",
      entry.notes ?? "",
    ];

    for (const text of cells) {
      const td = document.createElement("td");
      td.className = "px-2 py-1 align-top";
      td.textContent = text;
      tr.appendChild(td);
    }

    logBody.appendChild(tr);
  }
}

function updateLastSampleInfo() {
  if (!state.lastSample) {
    lastSampleInfoEl.textContent = "None yet";
    return;
  }
  const { lat, lon, timestamp } = state.lastSample;
  lastSampleInfoEl.textContent =
    `${lat.toFixed(4)}, ${lon.toFixed(4)} @ ` + formatIsoLocal(timestamp);
}

// --- Ignored Id ---
function loadIgnoredId() {
  try {
    state.ignoredId = null;
    const id = localStorage.getItem(IGNORED_ID_KEY);
    state.ignoredId = id ? id : null;
  } catch (e) {
    console.warn("Failed to load ignored id", e);
  }

  updateIgnoreId();
}

function promptIgnoredId() {
  const id = prompt("Enter repeater id to ignore.", state.ignoredId ?? '');

  // Was prompt cancelled?
  if (id === null)
    return;

  if (id && id.length !== 2) {
    alert(`Invalid id '${id}'. Must be 2 hex digits.`);
    return;
  }

  state.ignoredId = id ? id : null;
  localStorage.setItem(IGNORED_ID_KEY, id);
  updateIgnoreId();
}

function updateIgnoreId() {
  ignoredRepeaterId.innerText = state.ignoredId ?? "<none>";
}

// --- Geolocation ---
async function startLocationTracking() {
  stopLocationTracking();
  await updateCurrentPosition(); // Run immediately, then on timer.
  state.locationTimer = setInterval(updateCurrentPosition, 1000);
}

function stopLocationTracking() {
  if (state.locationTimer) {
    clearInterval(state.locationTimer);
    state.locationTimer = null;
  }
}

async function updateCurrentPosition() {
  const pos = await getCurrentPosition();
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  state.currentPos = [lat, lon];

  currentLocMarker.setLatLng(state.currentPos);
  map.panTo(state.currentPos);

  const coverageTileId = coverageKey(lat, lon);
  const needsPing = !state.coveredTiles.has(coverageTileId);
  currentTileEl.innerText = coverageTileId;
  currentNeedsPingEl.innerText = needsPing ? "✅" : "⛔";

  state.lastPosUpdate = Date.now();
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not available in this browser"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(err),
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 5000,
      }
    );
  });
}

// Helper to ensure the location tracking timer stays running.
async function ensureCurrentPositionIsFresh() {
  const dt = Date.now() - state.lastPosUpdate;
  if (dt > 3000) {
    await startLocationTracking();
  }
}

// --- WakeLock helpers ---
async function acquireWakeLock() {
  // Bluefy-specfic -- it's a bit better when available.
  if ('setScreenDimEnabled' in navigator.bluetooth) {
    // This name is bad. setScreenDimEnabled(true) prevents screen locking.
    navigator.bluetooth.setScreenDimEnabled(true);
    log('setScreenDimEnabled(true)');
  } else {
    try {
      if ('wakeLock' in navigator) {
        state.wakeLock = await navigator.wakeLock.request('screen');
        log('navigator.wakeLock acquired');

        state.wakeLock.addEventListener('release',
          () => log('navigator.wakeLock released'));

      } else {
        log('navigator.wakeLock not supported');
      }
    } catch (err) {
      console.error(`Could not obtain wake lock: ${err.name}, ${err.message}`);
    }
  }
}

async function releaseWakeLock() {
  if ('setScreenDimEnabled' in navigator.bluetooth) {
    navigator.bluetooth.setScreenDimEnabled(false);
    log('setScreenDimEnabled(false)');
  } else {
    if (state.wakeLock !== null) {
      state.wakeLock.release();
      state.wakeLock = null;
    }
  }
}

// --- Wardrive channel helpers ---
async function createWardriveChannel() {
  const create = window.confirm(
    `Channel "${wardriveChannelName}" not found on this device. Create it now?`
  );

  if (!create) {
    channelInfoEl.textContent = `No "${wardriveChannelName}" channel; ping disabled.`;
    throw new Error("Wardrive channel not created");
  }

  // Find a free channel index.
  const channels = await state.connection.getChannels();
  let idx = 0;
  while (idx < channels.length) {
    if (channels[idx].name === '')
      break;
    ++idx;
  }

  if (idx >= channels.length) {
    throw new Error("No free channel slots available");
  }

  // Derived secret for #wardrive 4076c315c1ef385fa93f066027320fe5
  const wardriveKey = new Uint8Array([
    0x40, 0x76, 0xC3, 0x15, 0xC1, 0xEF, 0x38, 0x5F,
    0xA9, 0x3F, 0x06, 0x60, 0x27, 0x32, 0x0F, 0xE5
  ]);

  // Create and set the connection.
  const channel = { channelIdx: idx, name: wardriveChannelName, wardriveKey };
  await state.connection.setChannel(idx, wardriveChannelName, wardriveKey);
  return channel;
}

async function ensureWardriveChannel() {
  if (!state.connection) {
    throw new Error("Not connected");
  }

  if (state.wardriveChannel) {
    return state.wardriveChannel;
  }

  // Look for existing channel by name.
  let channel = await state.connection.findChannelByName(wardriveChannelName);

  if (!channel) {
    channel = await createWardriveChannel();
  }

  channelInfoEl.textContent = `Using ${channel.name} on slot ${channel.channelIdx}`;
  state.wardriveChannel = channel;
  return channel;
}

// --- Ping logic ---
async function sendPing({ auto = false } = {}) {
  if (!state.connection) {
    setStatus("Not connected", "text-red-300");
    return;
  }

  // Get the channel.
  let channel;
  try {
    channel = await ensureWardriveChannel();
  } catch (e) {
    console.warn(`Channel "${wardriveChannelName}" not available`, e);
    setStatus(`No "${wardriveChannelName}" channel`, "text-amber-300");
    return;
  }

  try {
    await ensureCurrentPositionIsFresh();
  } catch (e) {
    console.error("Get location failed", e);
    setStatus("Get location failed", "text-amber-300");
    return;
  }

  let pos = state.currentPos;
  if (!isValidLocation(pos)) {
    setStatus("Outside coverage area", "text-red-300");
    return;
  }

  const [lat, lon] = pos;
  const coverageTileId = coverageKey(lat, lon);
  let distanceMilesValue = null;

  if (state.pingMode === "interval") {
    // Ensure minimum distance met for interval auto ping.
    const minMiles = getMinDistanceMiles();
    if (auto && state.lastSample && minMiles > 0) {
      distanceMilesValue = haversineMiles(
        [state.lastSample.lat, state.lastSample.lon], [lat, lon]);
      if (distanceMilesValue < minMiles) {
        log(`Min distance not met ${distanceMilesValue}, skipping.`);
        setStatus("Skipped ping", "text-amber-300");
        addLogEntry({
          timestamp: new Date().toISOString(),
          lat,
          lon,
          mode: "auto",
          distanceMiles: distanceMilesValue,
          skipped: true,
          sentToMesh: false,
          sentToService: false,
        });
        return;
      }
    }
  } else {
    // Ensure ping is needed in the current tile.
    const needsPing = !state.coveredTiles.has(coverageTileId);
    if (auto && !needsPing) {
      setStatus("No ping needed", "text-amber-300");
      return;
    }
  }

  setStatus("Sending ping…", "text-sky-300");

  let text = `${lat.toFixed(4)} ${lon.toFixed(4)}`;
  if (state.ignoredId !== null) text += ` ${state.ignoredId}`;
  let sentToMesh = false;
  let sentToService = false;
  let notes = "";

  try {
    // Send mesh message: "<lat> <lon> [<id>]".
    await state.connection.sendChannelTextMessage(channel.channelIdx, text);
    sentToMesh = true;
    log("Sent MeshCore wardrive ping:", text);
  } catch (e) {
    console.error("Mesh send failed", e);
    setStatus("Mesh send failed", "text-red-300");
    notes = "Mesh Fail: " + e.message;
  }

  if (sentToMesh) {
    // Send sample to service.
    try {
      await fetch("https://mesh-map.pages.dev/put-sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon }),
      });
      sentToService = true;
    } catch (e) {
      console.error("Service POST failed", e);
      setStatus("Web send failed", "text-red-300");
      notes = "Web Fail: " + e.message;
    }

    // Even if sending the sample POST failed, consider this
    // the new 'last sample' to avoid spam.
    const nowIso = new Date().toISOString();
    state.lastSample = { lat, lon, timestamp: nowIso };
    updateLastSampleInfo();

    if (!state.coveredTiles.has(coverageTileId)) {
      state.coveredTiles.add(coverageTileId);
      addCoverageBox(coverageTileId);
    }
  }

  // Log result.
  const entry = {
    timestamp: new Date().toISOString(),
    lat,
    lon,
    mode: auto ? "auto" : "manual",
    distanceMiles: distanceMilesValue,
    sentToMesh,
    sentToService,
    notes,
  };

  addLogEntry(entry);

  if (sentToMesh) {
    setStatus(auto ? "Auto ping sent" : "Ping sent", "text-emerald-300");
  }
}

// --- Auto mode ---
function updateAutoButton() {
  if (state.running) {
    autoToggleBtn.textContent = "Stop Auto Ping";
    autoToggleBtn.classList.remove("bg-indigo-600", "hover:bg-indigo-500");
    autoToggleBtn.classList.add("bg-amber-600", "hover:bg-amber-500");
  } else {
    autoToggleBtn.textContent = "Start Auto Ping";
    autoToggleBtn.classList.add("bg-indigo-600", "hover:bg-indigo-500");
    autoToggleBtn.classList.remove("bg-amber-600", "hover:bg-amber-500");
  }
}

function stopAutoPing() {
  if (state.autoTimerId != null) {
    clearInterval(state.autoTimerId);
    state.autoTimerId = null;
  }
  state.running = false;
  updateAutoButton();
  releaseWakeLock();
}

async function startAutoPing() {
  if (!state.connection) {
    alert("Connect to a MeshCore device first.");
    return;
  }

  const minutes = getIntervalMinutes();
  if (!minutes || minutes <= 0) {
    alert("Please choose a valid ping interval.");
    return;
  }

  stopAutoPing();

  state.running = true;
  updateAutoButton();

  let intervalMs = 10 * 1000;
  if (state.pingMode === "interval") {
    intervalMs = minutes * 60 * 1000;
  }

  // TODO: Maybe this should be fetched periodically.
  await refreshCoverageData();
  redrawCoverage();

  setStatus("Auto mode started", "text-emerald-300");

  // Send first ping immediately, then on interval.
  sendPing({ auto: true }).catch(console.error);
  state.autoTimerId = setInterval(() => {
    sendPing({ auto: true }).catch(console.error);
  }, intervalMs);

  await acquireWakeLock();
}

// --- Connection handling ---
async function handleConnect() {
  if (state.connection) {
    return;
  }

  if (!("bluetooth" in navigator)) {
    alert("Web Bluetooth not supported in this browser.");
    return;
  }

  setStatus("Connecting…", "text-sky-300");
  connectBtn.disabled = true;

  try {
    const connection = await WebBleConnection.open();
    state.connection = connection;

    connection.on("connected", onConnected);
    connection.on("disconnected", onDisconnected);
  } catch (e) {
    console.error("Failed to open BLE connection", e);
    setStatus("Failed to connect", "text-red-300");
    connectBtn.disabled = false;
  }
}

async function handleDisconnect() {
  if (!state.connection) return;
  try {
    await state.connection.close();
  } catch (e) {
    console.warn("Error closing connection", e);
  }
  // onDisconnected will be called from the BLE event
}

async function onConnected() {
  setStatus("Connected (syncing…)", "text-emerald-300");
  disconnectBtn.disabled = false;
  connectBtn.disabled = true;
  controlsSection.classList.remove("hidden");

  try {
    try {
      await state.connection.syncDeviceTime();
    } catch {
      // Might not be supported.
    }

    const selfInfo = await state.connection.getSelfInfo();
    state.selfInfo = selfInfo;
    deviceNameEl.textContent = selfInfo?.name
      ? `Device: ${selfInfo.name}`
      : "Device connected";
    setStatus(
      `Connected to ${selfInfo?.name ?? "MeshCore"}`,
      "text-emerald-300"
    );

    // Try to ensure channel exists.
    try {
      await ensureWardriveChannel();
    } catch {
      // Will attempt again on ping.
    }
  } catch (e) {
    console.error("Error during initial sync", e);
    setStatus("Connected, but failed to init", "text-amber-300");
    await handleDisconnect();
  }
}

function onDisconnected() {
  stopAutoPing();

  deviceNameEl.textContent = "";
  channelInfoEl.textContent = "";
  disconnectBtn.disabled = true;
  connectBtn.disabled = false;
  controlsSection.classList.add("hidden");

  state.connection = null;
  state.wardriveChannel = null;

  log("Disconnected");
  setStatus("Disconnected", "text-red-300");
}

// --- Event bindings ---
connectBtn.addEventListener("click", () => {
  handleConnect().catch(console.error);
});

disconnectBtn.addEventListener("click", () => {
  handleDisconnect().catch(console.error);
});

sendPingBtn.addEventListener("click", () => {
  sendPing({ auto: false }).catch(console.error);
});

autoToggleBtn.addEventListener("click", async () => {
  if (state.running) {
    stopAutoPing();
    setStatus("Auto mode stopped", "text-slate-300");
  } else {
    await startAutoPing();
  }
});

pingModeSelect.addEventListener("change", async () => {
  const pingMode = pingModeSelect.value;

  if (state.pingMode === pingMode) {
    return;
  }

  stopAutoPing();
  state.pingMode = pingMode;
  if (pingMode === "interval") {
    intervalSection.classList.remove("hidden");
  } else {
    intervalSection.classList.add("hidden");
  }
});

ignoredRepeaterBtn.addEventListener("click", promptIgnoredId);

clearLogBtn.addEventListener("click", () => {
  if (!confirm("Clear local wardrive log?")) return;
  state.log = [];
  state.lastSample = null;
  updateLastSampleInfo();
  saveLog();
  renderLog();
});

// Automatically release wake lock when the page is hidden.
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    releaseWakeLock();
    stopLocationTracking();
  } else {
    await startLocationTracking();

    if (state.running)
      await acquireWakeLock();
  }
});

// Bluefy-specific.
if ('bluetooth' in navigator) {
  navigator.bluetooth.addEventListener('backgroundstatechanged',
    (e) => {
      const isBackground = e.target.value;
      if (isBackground == true && state.running) {
        stopAutoPing();
        setStatus('Lost focus, Stopped', 'text-amber-300');
      }
    });
}

export async function onLoad() {
  try {
    loadLog();
    loadIgnoredId();
    updateLastSampleInfo();
    updateAutoButton();

    await refreshCoverageData();
    redrawCoverage();

    await startLocationTracking();
  } catch (e) {
    alert(e);
  }
}
