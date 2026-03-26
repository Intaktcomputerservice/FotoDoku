import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chokidar from 'chokidar';
import dotenv from 'dotenv';
import { exiftool } from 'exiftool-vendored';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const config = {
  watchDir: resolveEnvPath(process.env.WATCH_DIR || './eingang'),
  outputDir: resolveEnvPath(process.env.OUTPUT_DIR || './verarbeitet'),
  noGpsDir: resolveEnvPath(process.env.NO_GPS_DIR || './ohne_gps'),
  errorDir: resolveEnvPath(process.env.ERROR_DIR || './fehler'),
  logDir: resolveEnvPath(process.env.LOG_DIR || './logs'),
  cacheFile: resolveEnvPath(process.env.CACHE_FILE || './logs/geocode-cache.json'),
  processDelayMs: Number(process.env.PROCESS_DELAY_MS || 3000),
  nominatimBaseUrl: process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org',
  userAgent: process.env.USER_AGENT || 'FotoDokuWatchfolder/1.0 (tim@example.org)',
  requestIntervalMs: Math.max(1000, Number(process.env.REQUEST_INTERVAL_MS || 1100)),
  reverseZoom: String(process.env.REVERSE_ZOOM || '18'),
  retryCount: Math.max(0, Number(process.env.RETRY_COUNT || 2)),
  retryDelayMs: Math.max(1000, Number(process.env.RETRY_DELAY_MS || 2500)),
  acceptLanguage: process.env.ACCEPT_LANGUAGE || 'de'
};

const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp']);
const pendingTimers = new Map();
const processingFiles = new Set();
const processedSignatures = new Map();
const fileQueue = [];
const MAX_RECENT_PROCESSED = 5000;
const FILE_STABILITY_CHECKS = 3;
const FILE_STABILITY_INTERVAL_MS = 400;
let fileQueueRunning = false;

const geocodeQueue = [];
let queueRunning = false;
let lastGeocodeAt = 0;

const geoCache = loadCache(config.cacheFile);

main().catch((error) => {
  console.error('Fataler Fehler beim Start:', error);
  process.exitCode = 1;
});

async function main() {
  ensureDirectory(config.watchDir);
  ensureDirectory(config.outputDir);
  ensureDirectory(config.noGpsDir);
  ensureDirectory(config.errorDir);
  ensureDirectory(config.logDir);
  ensureDirectory(path.dirname(config.cacheFile));

  const watcher = chokidar.watch(config.watchDir, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: config.processDelayMs,
      pollInterval: 300
    },
    depth: 0,
    persistent: true
  });

  watcher.on('add', (filePath) => {
    if (!isSupportedImage(filePath)) {
      console.log(`Übersprungen (kein unterstütztes Bild): ${path.basename(filePath)}`);
      return;
    }
    scheduleProcessing(filePath);
  });

  watcher.on('change', (filePath) => {
    if (!isSupportedImage(filePath)) return;
    scheduleProcessing(filePath);
  });

  watcher.on('unlink', (filePath) => {
    const existing = pendingTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
      pendingTimers.delete(filePath);
    }
    processingFiles.delete(filePath);
    processedSignatures.delete(filePath);
  });

  watcher.on('error', (error) => {
    console.error('Watcher-Fehler:', error);
  });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('Watchfolder läuft.');
  console.log(`Eingang:       ${config.watchDir}`);
  console.log(`Verarbeitet:   ${config.outputDir}`);
  console.log(`Ohne GPS:      ${config.noGpsDir}`);
  console.log(`Fehler:        ${config.errorDir}`);
  console.log(`Logs:          ${config.logDir}`);
  console.log(`Cache:         ${config.cacheFile}`);
  console.log(`Nominatim:     ${config.nominatimBaseUrl}`);
  console.log(`Intervall:     ${config.requestIntervalMs} ms`);
  console.log(`User-Agent:    ${config.userAgent}`);

  async function shutdown() {
    console.log('\nBeende Watchfolder...');
    try {
      await watcher.close();
    } finally {
      await exiftool.end();
      process.exit(0);
    }
  }
}

function scheduleProcessing(filePath) {
  const existing = pendingTimers.get(filePath);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    pendingTimers.delete(filePath);
    enqueueFile(filePath);
  }, config.processDelayMs);

  pendingTimers.set(filePath, timer);
}

function enqueueFile(filePath) {
  if (processingFiles.has(filePath) || fileQueue.includes(filePath)) return;
  fileQueue.push(filePath);
  void runFileQueue();
}

async function runFileQueue() {
  if (fileQueueRunning) return;
  fileQueueRunning = true;

  try {
    while (fileQueue.length > 0) {
      const filePath = fileQueue.shift();
      if (!filePath || processingFiles.has(filePath)) continue;
      processingFiles.add(filePath);

      try {
        await processSingleFile(filePath);
      } finally {
        processingFiles.delete(filePath);
      }
    }
  } finally {
    fileQueueRunning = false;
  }
}

async function processSingleFile(filePath) {
  const originalName = path.basename(filePath);

  try {
    if (!fs.existsSync(filePath)) return;

    const stable = await waitForStableFile(filePath);
    if (!stable) {
      const error = new Error('Datei ist nicht stabil (vermutlich unvollständig geschrieben)');
      error.code = 'FILE_NOT_STABLE';
      throw error;
    }

    const signature = getFileSignature(filePath);
    const knownSignature = processedSignatures.get(filePath);
    if (signature && knownSignature === signature) {
      console.log(`Übersprungen (bereits verarbeitet): ${originalName}`);
      return;
    }

    await processFile(filePath);
    if (signature) rememberProcessedSignature(filePath, signature);
  } catch (error) {
    console.error(`Fehler bei ${originalName}:`, error.message);
    await moveToError(filePath, error.message);
  }
}

async function processFile(filePath) {
  const originalName = path.basename(filePath);
  if (!fs.existsSync(filePath)) return;

  let tags;
  try {
    tags = await exiftool.read(filePath);
  } catch (error) {
    const wrapped = new Error(`EXIF konnte nicht gelesen werden: ${error.message}`);
    wrapped.code = 'EXIF_READ_FAILED';
    throw wrapped;
  }

  const coords = extractCoordinates(tags);

  if (!coords) {
    const destination = await moveUnique(filePath, config.noGpsDir, originalName);
    await appendLog({
      status: 'NO_GPS',
      originalName,
      newName: path.basename(destination),
      latitude: '',
      longitude: '',
      address: '',
      note: 'Keine GPS-Daten gefunden'
    });
    console.log(`Ohne GPS verschoben: ${originalName}`);
    return;
  }

  const address = await enqueueReverseGeocode(coords.latitude, coords.longitude);
  const timestamp = formatDate(tags.DateTimeOriginal || tags.CreateDate || new Date());
  const safeAddress = buildAddressSlug(address);
  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  const baseName = `${timestamp}_${safeAddress}`;
  const destination = await moveUnique(filePath, config.outputDir, `${baseName}${ext}`);
  const finalName = path.basename(destination);

  await appendLog({
    status: 'OK',
    originalName,
    newName: finalName,
    latitude: coords.latitude,
    longitude: coords.longitude,
    address: formatAddressText(address),
    note: ''
  });

  console.log(`Verarbeitet: ${originalName} -> ${finalName}`);
}

function extractCoordinates(tags) {
  if (typeof tags.GPSLatitude === 'number' && typeof tags.GPSLongitude === 'number') {
    return { latitude: tags.GPSLatitude, longitude: tags.GPSLongitude };
  }

  if (typeof tags.CompositeGPSLatitude === 'number' && typeof tags.CompositeGPSLongitude === 'number') {
    return { latitude: tags.CompositeGPSLatitude, longitude: tags.CompositeGPSLongitude };
  }

  return null;
}

function enqueueReverseGeocode(latitude, longitude) {
  return new Promise((resolve, reject) => {
    geocodeQueue.push({ latitude, longitude, resolve, reject });
    void processGeocodeQueue();
  });
}

async function processGeocodeQueue() {
  if (queueRunning) return;
  queueRunning = true;

  try {
    while (geocodeQueue.length > 0) {
      const job = geocodeQueue.shift();
      const cacheKey = buildCacheKey(job.latitude, job.longitude);

      if (geoCache[cacheKey]) {
        job.resolve(geoCache[cacheKey]);
        continue;
      }

      try {
        await enforceRateLimit();
        const result = await reverseGeocodeWithRetry(job.latitude, job.longitude, config.retryCount);
        geoCache[cacheKey] = result;
        saveCache(config.cacheFile, geoCache);
        job.resolve(result);
      } catch (error) {
        job.reject(error);
      }
    }
  } finally {
    queueRunning = false;
  }
}

async function enforceRateLimit() {
  const now = Date.now();
  const waitMs = Math.max(0, config.requestIntervalMs - (now - lastGeocodeAt));
  if (waitMs > 0) {
    await delay(waitMs);
  }
  lastGeocodeAt = Date.now();
}

async function reverseGeocodeWithRetry(latitude, longitude, retriesLeft) {
  try {
    return await reverseGeocode(latitude, longitude);
  } catch (error) {
    const retriable = isRetriableError(error);

    if (!retriable || retriesLeft <= 0) {
      throw error;
    }

    console.warn(
      `Reverse Geocoding fehlgeschlagen für ${latitude}, ${longitude}. Neuer Versuch in ${config.retryDelayMs} ms. Restliche Versuche: ${retriesLeft}`
    );

    await delay(config.retryDelayMs);
    return reverseGeocodeWithRetry(latitude, longitude, retriesLeft - 1);
  }
}

function isRetriableError(error) {
  const status = error?.status;
  if (typeof status !== 'number') return true;
  return status === 403 || status === 408 || status === 429 || status >= 500;
}

async function reverseGeocode(latitude, longitude) {
  const url = new URL('/reverse', config.nominatimBaseUrl);
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', config.reverseZoom);

  const response = await fetch(url, {
    headers: {
      'User-Agent': config.userAgent,
      'Accept-Language': config.acceptLanguage,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const error = new Error(`Reverse Geocoding fehlgeschlagen (${response.status})`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();

  if (!data || !data.address) {
    return {
      road: '',
      house_number: '',
      postcode: '',
      city: '',
      town: '',
      village: '',
      county: '',
      state: '',
      country: '',
      display_name: data?.display_name || ''
    };
  }

  return {
    ...data.address,
    display_name: data.display_name || ''
  };
}

function buildAddressSlug(address) {
  const locality =
    address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    address.municipality ||
    address.county ||
    'unbekannt';

  const road =
    address.road ||
    address.pedestrian ||
    address.footway ||
    address.cycleway ||
    address.path ||
    'ohne_strasse';

  const houseNumber = address.house_number || 'ohne_nr';
  const raw = `${locality}_${road}_${houseNumber}`;
  return slugify(raw).slice(0, 120) || 'unbekannt_unbekannt_ohne_nr';
}

function formatAddressText(address) {
  const locality =
    address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    address.municipality ||
    '';

  return (
    [
      [address.road, address.house_number].filter(Boolean).join(' ').trim(),
      [address.postcode, locality].filter(Boolean).join(' ').trim(),
      address.state,
      address.country
    ]
      .filter(Boolean)
      .join(', ') || address.display_name || 'Unbekannte Adresse'
  );
}

function slugify(input) {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

async function makeUniqueFilename(dir, baseName, ext) {
  let counter = 1;
  let filename = `${baseName}${ext}`;

  while (fs.existsSync(path.join(dir, filename))) {
    filename = `${baseName}_${String(counter).padStart(2, '0')}${ext}`;
    counter += 1;
  }

  return filename;
}

async function moveUnique(sourcePath, targetDir, originalName) {
  ensureDirectory(targetDir);
  const ext = path.extname(originalName);
  const name = path.basename(originalName, ext);
  let candidate = `${name}${ext || '.jpg'}`;
  let counter = 1;

  while (true) {
    const destination = path.join(targetDir, candidate);

    try {
      moveFileSafely(sourcePath, destination);
      return destination;
    } catch (error) {
      if (error?.code === 'EEXIST') {
        candidate = `${name}_${String(counter).padStart(2, '0')}${ext || '.jpg'}`;
        counter += 1;
        continue;
      }
      throw error;
    }
  }
}

function moveFileSafely(sourcePath, destination) {
  try {
    fs.renameSync(sourcePath, destination);
  } catch (error) {
    if (error?.code === 'EXDEV') {
      fs.copyFileSync(sourcePath, destination, fs.constants.COPYFILE_EXCL);
      fs.unlinkSync(sourcePath);
      return;
    }
    throw error;
  }
}

async function moveToError(filePath, message) {
  if (!fs.existsSync(filePath)) return;

  const originalName = path.basename(filePath);
  const destination = await moveUnique(filePath, config.errorDir, originalName);

  await appendLog({
    status: 'ERROR',
    originalName,
    newName: path.basename(destination),
    latitude: '',
    longitude: '',
    address: '',
    note: message
  });
}

async function appendLog(entry) {
  const logFile = path.join(config.logDir, `processing_${new Date().toISOString().slice(0, 10)}.csv`);
  const exists = fs.existsSync(logFile);
  const header = 'timestamp,status,originalName,newName,latitude,longitude,address,note\n';

  const line =
    [
      new Date().toISOString(),
      entry.status,
      csvEscape(entry.originalName),
      csvEscape(entry.newName),
      entry.latitude,
      entry.longitude,
      csvEscape(entry.address),
      csvEscape(entry.note)
    ].join(',') + '\n';

  if (!exists) {
    fs.writeFileSync(logFile, header, 'utf8');
  }

  fs.appendFileSync(logFile, line, 'utf8');
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCacheKey(latitude, longitude) {
  return `${Number(latitude).toFixed(6)},${Number(longitude).toFixed(6)}`;
}

function loadCache(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn(`Cache konnte nicht geladen werden (${filePath}): ${error.message}`);
    return {};
  }
}

function saveCache(filePath, cache) {
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(tempFile, filePath);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStableFile(filePath) {
  let previousSignature = null;
  let stableCount = 0;

  for (let attempt = 0; attempt < FILE_STABILITY_CHECKS + 5; attempt += 1) {
    if (!fs.existsSync(filePath)) return false;
    const signature = getFileSignature(filePath);
    if (!signature) return false;

    if (signature === previousSignature) {
      stableCount += 1;
      if (stableCount >= FILE_STABILITY_CHECKS) return true;
    } else {
      stableCount = 0;
    }

    previousSignature = signature;
    await delay(FILE_STABILITY_INTERVAL_MS);
  }

  return false;
}

function getFileSignature(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return `${stats.size}:${stats.mtimeMs}`;
  } catch {
    return null;
  }
}

function rememberProcessedSignature(filePath, signature) {
  processedSignatures.set(filePath, signature);
  if (processedSignatures.size <= MAX_RECENT_PROCESSED) return;

  const oldestKey = processedSignatures.keys().next().value;
  if (oldestKey) processedSignatures.delete(oldestKey);
}

function resolveEnvPath(value) {
  return path.resolve(__dirname, value);
}

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isSupportedImage(filePath) {
  return allowedExtensions.has(path.extname(filePath).toLowerCase());
}

function formatDate(input) {
  const date = input instanceof Date ? input : new Date(input);

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}
