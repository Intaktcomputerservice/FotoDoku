import fs from 'fs';
import path from 'path';

const queue = [];
let queueRunning = false;
let lastRequestAt = 0;

export function createGeocodeService({ cacheFile, userAgent, baseUrl = 'https://nominatim.openstreetmap.org', requestIntervalMs = 1100, acceptLanguage = 'de', reverseZoom = '18' }) {
  const cache = loadCache(cacheFile);

  async function enqueueReverseGeocode(latitude, longitude) {
    return new Promise((resolve, reject) => {
      queue.push({ latitude, longitude, resolve, reject });
      void processQueue();
    });
  }

  async function processQueue() {
    if (queueRunning) return;
    queueRunning = true;

    try {
      while (queue.length) {
        const job = queue.shift();
        const key = `${Number(job.latitude).toFixed(6)},${Number(job.longitude).toFixed(6)}`;
        if (cache[key]) {
          job.resolve(cache[key]);
          continue;
        }

        try {
          await rateLimit();
          const result = await reverseGeocode(job.latitude, job.longitude);
          cache[key] = result;
          saveCache(cacheFile, cache);
          job.resolve(result);
        } catch (error) {
          job.reject(error);
        }
      }
    } finally {
      queueRunning = false;
    }
  }

  async function rateLimit() {
    const wait = Math.max(0, requestIntervalMs - (Date.now() - lastRequestAt));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
  }

  async function reverseGeocode(latitude, longitude) {
    const url = new URL('/reverse', baseUrl);
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('zoom', reverseZoom);

    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': acceptLanguage,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const error = new Error(`Reverse-Geocoding fehlgeschlagen (${response.status})`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    if (!data?.address) return {};
    return data.address;
  }

  return { enqueueReverseGeocode };
}

function loadCache(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache(filePath, cache) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}
