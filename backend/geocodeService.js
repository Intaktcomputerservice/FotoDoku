import fs from 'fs';
import path from 'path';

const DEFAULT_EMPTY_ADDRESS = {};

export function createGeocodeService({
  cacheFile,
  userAgent,
  baseUrl = 'https://nominatim.openstreetmap.org',
  requestIntervalMs = 1100,
  acceptLanguage = 'de',
  reverseZoom = '18',
  requestTimeoutMs = 8000,
  maxRetries = 2,
  retryBaseDelayMs = 700
}) {
  const queue = [];
  let queueRunning = false;
  let lastRequestAt = 0;
  const cache = loadCache(cacheFile);
  const inFlight = new Map();

  async function enqueueReverseGeocode(latitude, longitude) {
    const key = toCacheKey(latitude, longitude);
    if (cache[key]) return cache[key];
    if (inFlight.has(key)) return inFlight.get(key);

    const taskPromise = new Promise((resolve, reject) => {
      queue.push({ key, latitude, longitude, resolve, reject });
      void processQueue();
    });

    inFlight.set(key, taskPromise);
    taskPromise.finally(() => inFlight.delete(key));

    return taskPromise;
  }

  async function processQueue() {
    if (queueRunning) return;
    queueRunning = true;

    try {
      while (queue.length) {
        const job = queue.shift();

        if (cache[job.key]) {
          job.resolve(cache[job.key]);
          continue;
        }

        try {
          await rateLimit();
          const result = await reverseWithRetry(job);
          cache[job.key] = result;
          saveCache(cacheFile, cache);
          job.resolve(result);
        } catch (error) {
          console.error(`Reverse-Geocoding fehlgeschlagen: ${job.latitude},${job.longitude} — ${error.message}`);
          job.reject(error);
        }
      }
    } finally {
      queueRunning = false;
    }
  }

  async function reverseWithRetry(job) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await reverseGeocode(job.latitude, job.longitude);
      } catch (error) {
        lastError = error;
        const shouldRetry = isRetryableError(error) && attempt < maxRetries;
        if (!shouldRetry) break;

        const waitMs = retryBaseDelayMs * (attempt + 1);
        console.warn(`Reverse-Geocoding Retry ${attempt + 1}/${maxRetries}: ${job.latitude},${job.longitude} in ${waitMs}ms — ${error.message}`);
        await delay(waitMs);
      }
    }

    const wrapped = new Error(`Reverse-Geocoding dauerhaft fehlgeschlagen: ${lastError?.message || 'Unbekannter Fehler'}`);
    wrapped.code = 'GEOCODE_FAILED';
    wrapped.cause = lastError;
    throw wrapped;
  }

  async function rateLimit() {
    const wait = Math.max(0, requestIntervalMs - (Date.now() - lastRequestAt));
    if (wait > 0) await delay(wait);
    lastRequestAt = Date.now();
  }

  async function reverseGeocode(latitude, longitude) {
    const url = new URL('/reverse', baseUrl);
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('zoom', reverseZoom);

    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': acceptLanguage,
        Accept: 'application/json'
      }
    }, requestTimeoutMs);

    if (!response.ok) {
      const error = new Error(`Reverse-Geocoding fehlgeschlagen (${response.status})`);
      error.status = response.status;
      error.code = response.status === 429 ? 'GEOCODE_RATE_LIMIT' : 'GEOCODE_HTTP_ERROR';
      throw error;
    }

    const data = await response.json();
    if (!data?.address || typeof data.address !== 'object') return DEFAULT_EMPTY_ADDRESS;

    return data.address;
  }

  return { enqueueReverseGeocode };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Reverse-Geocoding Timeout nach ${timeoutMs}ms`);
      timeoutError.code = 'GEOCODE_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isRetryableError(error) {
  const status = error?.status;
  if (status === 429 || (status >= 500 && status <= 599)) return true;

  const code = error?.code;
  return code === 'GEOCODE_TIMEOUT' || code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'ETIMEDOUT';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toCacheKey(latitude, longitude) {
  return `${Number(latitude).toFixed(6)},${Number(longitude).toFixed(6)}`;
}

function loadCache(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn(`Geocode-Cache konnte nicht geladen werden: ${filePath} — ${error.message}`);
    return {};
  }
}

function saveCache(filePath, cache) {
  const tmp = `${filePath}.tmp`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (error) {
    console.error(`Geocode-Cache konnte nicht gespeichert werden: ${filePath} — ${error.message}`);
    try {
      if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
    } catch (cleanupError) {
      console.warn(`Temporäre Cache-Datei konnte nicht entfernt werden: ${tmp} — ${cleanupError.message}`);
    }
  }
}
