import fs from 'fs';
import path from 'path';

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (text.includes(';') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function createLogService({ technicalLogFile, processingCsvFile }) {
  function logTechnical(level, message, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };

    ensureDir(technicalLogFile);
    fs.appendFileSync(technicalLogFile, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  function appendProcessingRow(row) {
    ensureDir(processingCsvFile);
    if (!fs.existsSync(processingCsvFile)) {
      fs.writeFileSync(processingCsvFile, 'timestamp;event;file;result;detail\n', 'utf8');
    }

    const line = [
      new Date().toISOString(),
      row.event,
      row.file,
      row.result,
      row.detail || ''
    ].map(csvEscape).join(';');

    fs.appendFileSync(processingCsvFile, `${line}\n`, 'utf8');
  }

  return { logTechnical, appendProcessingRow };
}
