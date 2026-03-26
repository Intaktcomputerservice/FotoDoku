import fs from 'fs';
import path from 'path';
import { buildFilenameProposal, uniqueTargetPath, normalizeFilename } from './fileName.js';
import { readExif, extractCoordinates, getImageDate } from './exifService.js';

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic']);

export function isSupportedImage(filePath) {
  return ALLOWED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function pickStreet(address) {
  return address.road || address.pedestrian || address.footway || '';
}

function classifyError(error, fallbackMessage = 'Unbekannter Fehler') {
  if (!error) return { category: 'technical', reason: fallbackMessage };

  const code = error.code || error.cause?.code;
  if (code === 'NO_GPS_DATA') return { category: 'business', reason: 'Bild enthält keine Standortdaten' };
  if (code === 'GEOCODE_FAILED') return { category: 'technical', reason: `Reverse-Geocoding fehlgeschlagen: ${error.message}` };
  if (code === 'EXIF_READ_FAILED') return { category: 'technical', reason: `EXIF-Auslese fehlgeschlagen: ${error.message}` };

  return { category: 'technical', reason: error.message || fallbackMessage };
}

export async function prepareBatch({ filePaths, geocodeService, onProgress = () => {} }) {
  const proposals = [];
  let sequence = 1;

  for (const [index, filePath] of filePaths.entries()) {
    const baseName = path.basename(filePath);
    onProgress({ stage: 'prepare', index: index + 1, total: filePaths.length, fileName: baseName });

    if (!isSupportedImage(filePath)) {
      proposals.push({ sourcePath: filePath, originalName: baseName, status: 'rejected', reason: 'Nicht unterstützter Dateityp', category: 'business' });
      continue;
    }

    if (!fs.existsSync(filePath)) {
      proposals.push({ sourcePath: filePath, originalName: baseName, status: 'rejected', reason: 'Quelldatei nicht gefunden', category: 'technical' });
      continue;
    }

    try {
      const tags = await readExif(filePath);
      const coords = extractCoordinates(tags);
      if (!coords) {
        const gpsError = new Error('Bild enthält keine gültigen GPS-Koordinaten');
        gpsError.code = 'NO_GPS_DATA';
        throw gpsError;
      }

      const address = await geocodeService.enqueueReverseGeocode(coords.latitude, coords.longitude);
      const extension = path.extname(baseName).toLowerCase() || '.jpg';
      const imageDate = getImageDate(tags, filePath);
      const proposal = buildFilenameProposal({
        date: imageDate,
        street: pickStreet(address),
        houseNumber: address.house_number || '',
        sequence,
        extension
      });

      proposals.push({
        sourcePath: filePath,
        originalName: baseName,
        status: 'ready',
        reason: '',
        proposedName: proposal,
        date: imageDate.toISOString(),
        metadata: {
          street: pickStreet(address),
          houseNumber: address.house_number || ''
        }
      });
      sequence += 1;
    } catch (error) {
      const classified = classifyError(error, 'Fehler bei der Analyse');
      proposals.push({ sourcePath: filePath, originalName: baseName, status: 'rejected', reason: classified.reason, category: classified.category });
    }
  }

  return proposals;
}

async function safeMoveFile(sourcePath, destinationPath) {
  try {
    fs.renameSync(sourcePath, destinationPath);
    return { strategy: 'rename' };
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;

    fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
    try {
      fs.unlinkSync(sourcePath);
      return { strategy: 'copy-delete' };
    } catch (unlinkError) {
      try {
        fs.rmSync(destinationPath, { force: true });
      } catch {
        // noop: secondary cleanup failure should not hide original issue
      }
      const wrapped = new Error(`Kopie erstellt, Quelle konnte aber nicht gelöscht werden: ${unlinkError.message}`);
      wrapped.code = 'MOVE_DELETE_SOURCE_FAILED';
      wrapped.cause = unlinkError;
      throw wrapped;
    }
  }
}

export async function processBatch({ items, targetRoot, onProgress = () => {}, onLog = () => {} }) {
  const successes = [];
  const rejected = [];
  const total = items.length;

  for (const [index, item] of items.entries()) {
    onProgress({ stage: 'process', index: index + 1, total, fileName: item.originalName });

    if (item.status !== 'ready') {
      const reason = item.reason || 'Nicht verarbeitbar';
      rejected.push({ originalName: item.originalName, reason, category: item.category || 'business' });
      onLog({ level: 'warn', event: 'item-skipped', file: item.originalName, reason });
      continue;
    }

    const fileDate = new Date(item.finalDate || item.date || new Date());
    const year = String(fileDate.getFullYear());
    const month = String(fileDate.getMonth() + 1).padStart(2, '0');
    const targetDir = path.join(targetRoot, year, month);

    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (error) {
      const reason = `Zielordner kann nicht erstellt werden: ${error.message}`;
      rejected.push({ originalName: item.originalName, reason, category: 'technical' });
      onLog({ level: 'error', event: 'target-dir-create-failed', file: item.originalName, targetDir, error: reason });
      continue;
    }

    const desiredName = normalizeFilename(item.finalName || item.proposedName);

    if (!fs.existsSync(item.sourcePath)) {
      const reason = 'Quelldatei fehlt vor dem Verschieben';
      rejected.push({ originalName: item.originalName, reason, category: 'technical' });
      onLog({ level: 'error', event: 'source-missing', file: item.originalName, sourcePath: item.sourcePath, reason });
      continue;
    }

    const destination = await uniqueTargetPath(fs, targetDir, desiredName);

    try {
      const moveResult = await safeMoveFile(item.sourcePath, destination);
      successes.push({
        originalName: item.originalName,
        newName: path.basename(destination),
        folder: targetDir,
        moveStrategy: moveResult.strategy
      });
      onLog({ level: 'info', event: 'file-moved', file: item.originalName, destination, strategy: moveResult.strategy });
    } catch (error) {
      const reason = `Verschieben fehlgeschlagen: ${error.message}`;
      rejected.push({ originalName: item.originalName, reason, category: 'technical' });
      onLog({ level: 'error', event: 'file-move-failed', file: item.originalName, destination, error: reason });
    }
  }

  return { successes, rejected, total };
}
