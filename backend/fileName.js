import path from 'path';

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;
const INVALID_SEGMENT_DOTS = /^\.+$/;
const MULTI_UNDERSCORE = /_+/g;
const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

const MAX_FILENAME_LENGTH = 180;
const MAX_SEGMENT_LENGTH = 60;

export function sanitizeFilenamePart(input, { maxLength = MAX_SEGMENT_LENGTH } = {}) {
  const normalized = String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(INVALID_FILENAME_CHARS, '')
    .replace(/\s+/g, '_')
    .replace(MULTI_UNDERSCORE, '_')
    .replace(/^[_\.\- ]+|[_\.\- ]+$/g, '');

  if (!normalized || INVALID_SEGMENT_DOTS.test(normalized)) return '';

  const upper = normalized.toUpperCase();
  const safe = WINDOWS_RESERVED_NAMES.has(upper) ? `${normalized}_x` : normalized;
  return safe.slice(0, maxLength);
}

export function sanitizeExtension(extension) {
  const ext = extension?.startsWith('.') ? extension : `.${String(extension || 'jpg')}`;
  const safe = ext.toLowerCase().replace(/[^a-z0-9.]/g, '');
  return safe.length > 1 ? safe : '.jpg';
}

export function formatDateForName(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function normalizeFilename(filename) {
  const ext = sanitizeExtension(path.extname(filename));
  const base = sanitizeFilenamePart(path.basename(filename, path.extname(filename)), { maxLength: MAX_FILENAME_LENGTH - ext.length }) || 'Bild';
  return `${base}${ext}`;
}

export function buildFilenameProposal({ date, firma, street, houseNumber, sequence, extension, extraText }) {
  const parts = [
    formatDateForName(date),
    sanitizeFilenamePart(firma),
    sanitizeFilenamePart(street),
    sanitizeFilenamePart(houseNumber),
    sanitizeFilenamePart(extraText),
    `Bild${Math.max(1, Number(sequence) || 1)}`
  ].filter(Boolean);

  const safeExt = sanitizeExtension(extension);
  const maxBaseLength = MAX_FILENAME_LENGTH - safeExt.length;

  let base = parts.join('_').replace(MULTI_UNDERSCORE, '_').replace(/^_+|_+$/g, '');
  if (!base) base = `Bild${Math.max(1, Number(sequence) || 1)}`;
  base = sanitizeFilenamePart(base, { maxLength: maxBaseLength }) || 'Bild';

  return `${base}${safeExt}`;
}

export async function uniqueTargetPath(fsModule, targetDir, filename) {
  const normalized = normalizeFilename(filename);
  const ext = path.extname(normalized);
  const base = path.basename(normalized, ext);
  let candidate = normalized;
  let index = 1;

  while (fsModule.existsSync(path.join(targetDir, candidate))) {
    const suffix = `_${index}`;
    const truncatedBase = base.slice(0, Math.max(1, MAX_FILENAME_LENGTH - ext.length - suffix.length));
    candidate = `${truncatedBase}${suffix}${ext}`;
    index += 1;
  }

  return path.join(targetDir, candidate);
}
