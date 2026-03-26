import fs from 'fs';
import path from 'path';

function ensureDir(filePath) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch (error) {
    console.error(`Log-Verzeichnis konnte nicht erstellt werden: ${filePath} — ${error.message}`);
    throw error;
  }
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

    try {
      ensureDir(technicalLogFile);
      fs.appendFileSync(technicalLogFile, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch (error) {
      console.error(`Technisches Log konnte nicht geschrieben werden: ${technicalLogFile} — ${error.message}`);
    }
  }

  function appendProcessingRow(row) {
    try {
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
    } catch (error) {
      console.error(`Processing-Log konnte nicht geschrieben werden: ${processingCsvFile} — ${error.message}`);
    }
  }

  return { logTechnical, appendProcessingRow };
}
