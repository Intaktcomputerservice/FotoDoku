import fs from 'fs';
import { exiftool } from 'exiftool-vendored';

export async function readExif(filePath) {
  return exiftool.read(filePath);
}

export function extractCoordinates(tags) {
  if (typeof tags.GPSLatitude === 'number' && typeof tags.GPSLongitude === 'number') {
    return { latitude: tags.GPSLatitude, longitude: tags.GPSLongitude };
  }
  if (typeof tags.CompositeGPSLatitude === 'number' && typeof tags.CompositeGPSLongitude === 'number') {
    return { latitude: tags.CompositeGPSLatitude, longitude: tags.CompositeGPSLongitude };
  }
  return null;
}

export function getImageDate(tags, filePath) {
  const exifDate = tags.DateTimeOriginal || tags.CreateDate;
  if (exifDate) return new Date(exifDate);

  const stat = fs.statSync(filePath);
  return stat.birthtime || stat.mtime;
}

export async function shutdownExiftool() {
  await exiftool.end();
}
