import path from 'path';

export function sanitizeFilenamePart(input) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function formatDateForName(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function buildFilenameProposal({ date, firma, street, houseNumber, sequence, extension, extraText }) {
  const parts = [
    formatDateForName(date),
    sanitizeFilenamePart(firma),
    sanitizeFilenamePart(street),
    sanitizeFilenamePart(houseNumber),
    sanitizeFilenamePart(extraText),
    `Bild${sequence}`
  ].filter(Boolean);

  const safeExt = extension?.startsWith('.') ? extension.toLowerCase() : `.${String(extension || 'jpg').toLowerCase()}`;
  return `${parts.join('_')}${safeExt}`;
}

export async function uniqueTargetPath(fsModule, targetDir, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = filename;
  let index = 1;

  while (fsModule.existsSync(path.join(targetDir, candidate))) {
    candidate = `${base}_${index}${ext}`;
    index += 1;
  }

  return path.join(targetDir, candidate);
}
