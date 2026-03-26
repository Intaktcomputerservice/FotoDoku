import fs from 'fs';
import path from 'path';

function readJsonSafe(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.trim() ? JSON.parse(raw) : {};
}

export function createSettingsStore(configPath) {
  const backupPath = `${configPath}.bak`;

  function read() {
    try {
      if (!fs.existsSync(configPath)) return {};
      return readJsonSafe(configPath);
    } catch {
      try {
        if (!fs.existsSync(backupPath)) return {};
        return readJsonSafe(backupPath);
      } catch {
        return {};
      }
    }
  }

  function write(next) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });

    if (fs.existsSync(configPath)) {
      fs.copyFileSync(configPath, backupPath);
    }

    const tmp = `${configPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(tmp, configPath);
  }

  return { read, write };
}
