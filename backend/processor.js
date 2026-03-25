import fs from 'fs';
import path from 'path';
import { buildFilenameProposal, uniqueTargetPath } from './fileName.js';
import { readExif, extractCoordinates, getImageDate } from './exifService.js';

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic']);

export function isSupportedImage(filePath) {
  return ALLOWED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function pickStreet(address) {
  return address.road || address.pedestrian || address.footway || '';
}

export async function prepareBatch({ filePaths, company, extraText, geocodeService }) {
  const proposals = [];
  let sequence = 1;

  for (const filePath of filePaths) {
    const baseName = path.basename(filePath);

    if (!isSupportedImage(filePath)) {
      proposals.push({ sourcePath: filePath, originalName: baseName, status: 'rejected', reason: 'Nicht unterstützter Dateityp' });
      continue;
    }

    try {
      const tags = await readExif(filePath);
      const coords = extractCoordinates(tags);
      if (!coords) {
        proposals.push({ sourcePath: filePath, originalName: baseName, status: 'rejected', reason: 'Bild enthält keine Standortdaten' });
        continue;
      }

      const address = await geocodeService.enqueueReverseGeocode(coords.latitude, coords.longitude);
      const extension = path.extname(baseName).toLowerCase() || '.jpg';
      const imageDate = getImageDate(tags, filePath);
      const proposal = buildFilenameProposal({
        date: imageDate,
        firma: company,
        street: pickStreet(address),
        houseNumber: address.house_number || '',
        sequence,
        extension,
        extraText
      });

      proposals.push({
        sourcePath: filePath,
        originalName: baseName,
        status: 'ready',
        reason: '',
        proposedName: proposal,
        date: imageDate.toISOString(),
        company,
        extraText,
        metadata: {
          street: pickStreet(address),
          houseNumber: address.house_number || ''
        }
      });
      sequence += 1;
    } catch (error) {
      proposals.push({ sourcePath: filePath, originalName: baseName, status: 'rejected', reason: `Fehler beim Lesen: ${error.message}` });
    }
  }

  return proposals;
}

export async function processBatch({ items, targetRoot }) {
  const successes = [];
  const rejected = [];

  for (const item of items) {
    if (item.status !== 'ready') {
      rejected.push({ originalName: item.originalName, reason: item.reason || 'Nicht verarbeitbar' });
      continue;
    }

    const fileDate = new Date(item.finalDate || item.date || new Date());
    const year = String(fileDate.getFullYear());
    const month = String(fileDate.getMonth() + 1).padStart(2, '0');
    const targetDir = path.join(targetRoot, year, month);
    fs.mkdirSync(targetDir, { recursive: true });

    const desiredName = item.finalName || item.proposedName;
    const destination = await uniqueTargetPath(fs, targetDir, desiredName);

    try {
      fs.renameSync(item.sourcePath, destination);
      successes.push({ originalName: item.originalName, newName: path.basename(destination), folder: targetDir });
    } catch (error) {
      if (fs.existsSync(destination)) {
        fs.rmSync(destination, { force: true });
      }
      rejected.push({ originalName: item.originalName, reason: `Verschieben fehlgeschlagen: ${error.message}` });
    }
  }

  return { successes, rejected, total: items.length };
}
