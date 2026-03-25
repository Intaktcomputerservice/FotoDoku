import fs from 'fs';
import path from 'path';

export function createSettingsStore(configPath) {
  function read() {
    try {
      if (!fs.existsSync(configPath)) return {};
      const raw = fs.readFileSync(configPath, 'utf8');
      return raw.trim() ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function write(next) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const tmp = `${configPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(tmp, configPath);
  }

  return { read, write };
}
