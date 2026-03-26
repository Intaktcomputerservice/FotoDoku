import fs from 'fs';
import path from 'path';
import { exiftool } from 'exiftool-vendored';

const FILENAME_DATE_PATTERNS = [
  /(?<year>20\d{2}|19\d{2})[-_:.]?(?<month>0[1-9]|1[0-2])[-_:.]?(?<day>0[1-9]|[12]\d|3[01])(?:[-_ T]?(?<hour>[01]\d|2[0-3])[-_:.]?(?<minute>[0-5]\d)(?:[-_:.]?(?<second>[0-5]\d))?)?/,
  /IMG[-_ ]?(?<year>20\d{2})(?<month>0[1-9]|1[0-2])(?<day>0[1-9]|[12]\d|3[01])[-_ ]?(?<hour>[01]\d|2[0-3])(?<minute>[0-5]\d)(?<second>[0-5]\d)/i
];

export async function readExif(filePath) {
  try {
    return await exiftool.read(filePath);
  } catch (error) {
    const wrapped = new Error(`EXIF konnte nicht gelesen werden: ${error.message}`);
    wrapped.code = 'EXIF_READ_FAILED';
    wrapped.cause = error;
    throw wrapped;
  }
}

export function extractCoordinates(tags) {
  const lat = pickNumber(tags?.GPSLatitude, tags?.CompositeGPSLatitude);
  const lon = pickNumber(tags?.GPSLongitude, tags?.CompositeGPSLongitude);

  if (lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  return { latitude: lat, longitude: lon };
}

function pickNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function parseExifDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return asDate;

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function parseDateFromFilename(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  for (const pattern of FILENAME_DATE_PATTERNS) {
    const match = base.match(pattern);
    if (!match?.groups) continue;

    const year = Number(match.groups.year);
    const month = Number(match.groups.month);
    const day = Number(match.groups.day);
    const hour = Number(match.groups.hour || 0);
    const minute = Number(match.groups.minute || 0);
    const second = Number(match.groups.second || 0);

    const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export function getImageDate(tags, filePath) {
  const exifCandidates = [
    tags?.DateTimeOriginal,
    tags?.CreateDate,
    tags?.ModifyDate
  ];

  for (const candidate of exifCandidates) {
    const parsed = parseExifDate(candidate);
    if (parsed) return parsed;
  }

  const fileNameDate = parseDateFromFilename(filePath);
  if (fileNameDate) return fileNameDate;

  const stat = fs.statSync(filePath);
  const fsDate = parseExifDate(stat.birthtime) || parseExifDate(stat.mtime);
  if (fsDate) return fsDate;

  return new Date();
}

export async function shutdownExiftool() {
  await exiftool.end();
}
