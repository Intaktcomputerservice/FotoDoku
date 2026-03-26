import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { fileURLToPath } from 'url';
import { createGeocodeService } from '../backend/geocodeService.js';
import { createSettingsStore } from '../backend/settingsStore.js';
import { prepareBatch, processBatch } from '../backend/processor.js';
import { createLogService } from '../backend/logService.js';
import { shutdownExiftool } from '../backend/exifService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win;
let store;
let geocodeService;
let logService;
let fallbackTarget;

const userAgent = process.env.USER_AGENT || 'FotoDokuDesktop/1.0 (fallback@fotodoku.local)';
const acceptLanguage = process.env.ACCEPT_LANGUAGE || 'de';

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, '../frontend/index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url);
      }
    }
  });
}

function isSafeExternalUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function sanitizeFolderInput(folderPath) {
  if (typeof folderPath !== 'string' || !folderPath.trim()) return fallbackTarget;

  const resolved = path.resolve(folderPath.trim());
  if (resolved.length > 500) {
    const error = new Error('Pfad ist zu lang.');
    error.code = 'INVALID_PATH';
    throw error;
  }

  return resolved;
}

function validatePreparePayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Ungültige Anfrage: payload fehlt.');
  if (!Array.isArray(payload.filePaths)) throw new Error('Ungültige Anfrage: filePaths muss ein Array sein.');
  if (payload.filePaths.length > 5000) throw new Error('Zu viele Dateien in einem Lauf (max. 5000).');

  return {
    filePaths: payload.filePaths.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => path.resolve(entry))
  };
}

function validateProcessPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Ungültige Anfrage: payload fehlt.');
  if (!Array.isArray(payload.items)) throw new Error('Ungültige Anfrage: items muss ein Array sein.');
  if (payload.items.length > 5000) throw new Error('Zu viele Dateien in einem Lauf (max. 5000).');

  const items = payload.items
    .filter((item) => item && typeof item === 'object' && typeof item.sourcePath === 'string' && item.sourcePath.trim())
    .map((item) => ({
      ...item,
      sourcePath: path.resolve(item.sourcePath),
      originalName: typeof item.originalName === 'string' ? item.originalName : '',
      status: item.status === 'ready' ? 'ready' : 'rejected',
      finalName: typeof item.finalName === 'string' ? item.finalName : '',
      proposedName: typeof item.proposedName === 'string' ? item.proposedName : '',
      reason: typeof item.reason === 'string' ? item.reason : '',
      category: typeof item.category === 'string' ? item.category : ''
    }));

  return {
    items,
    targetFolder: typeof payload.targetFolder === 'string' ? payload.targetFolder : ''
  };
}

app.whenReady().then(() => {
  const userData = app.getPath('userData');
  store = createSettingsStore(path.join(userData, 'settings.json'));
  fallbackTarget = path.join(app.getPath('documents'), 'FotoDoku', 'verarbeitet');
  logService = createLogService({
    logsRootDir: path.join(userData, 'logs')
  });

  geocodeService = createGeocodeService({
    cacheFile: path.join(userData, 'geocode-cache.json'),
    userAgent,
    acceptLanguage
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  await shutdownExiftool();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:pick-files', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Bilder', extensions: ['jpg', 'jpeg', 'png', 'heic'] }]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('dialog:pick-folder', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('settings:load', async () => {
  try {
    const current = store.read();
    const defaultTargetFolder = sanitizeFolderInput(current.defaultTargetFolder || fallbackTarget);
    fs.mkdirSync(defaultTargetFolder, { recursive: true });
    return { defaultTargetFolder };
  } catch (error) {
    logService.logTechnical('error', 'settings-load-failed', { error: error.message });
    return { defaultTargetFolder: fallbackTarget };
  }
});

ipcMain.handle('settings:save', async (_event, payload) => {
  try {
    const next = {
      defaultTargetFolder: sanitizeFolderInput(payload?.defaultTargetFolder || fallbackTarget)
    };
    store.write(next);
    return next;
  } catch (error) {
    logService.logTechnical('error', 'settings-save-failed', { error: error.message });
    throw new Error(`Einstellungen konnten nicht gespeichert werden: ${error.message}`);
  }
});

ipcMain.handle('job:prepare', async (_event, payload) => {
  try {
    const normalizedPayload = validatePreparePayload(payload);
    return await prepareBatch({
      ...normalizedPayload,
      geocodeService
    });
  } catch (error) {
    logService.logTechnical('error', 'job-prepare-failed', { error: error.message });
    throw error;
  }
});

ipcMain.handle('job:process', async (_event, payload) => {
  try {
    const normalizedPayload = validateProcessPayload(payload);
    const targetRoot = sanitizeFolderInput(
      normalizedPayload.targetFolder || store.read().defaultTargetFolder || fallbackTarget
    );

    fs.mkdirSync(targetRoot, { recursive: true });

    return await processBatch({
      items: normalizedPayload.items,
      targetRoot,
      onLog: (entry) => {
        const detail = entry.error || entry.reason || entry.strategy || '';
        const result = entry.level === 'error' ? 'ERROR' : (entry.level === 'warn' ? 'WARN' : 'OK');
        logService.appendProcessingRow({
          event: entry.event || 'process',
          file: entry.file || '',
          result,
          detail
        });
        if (entry.level === 'error') {
          logService.logTechnical('error', entry.event || 'process-error', entry);
        }
      }
    });
  } catch (error) {
    logService.logTechnical('error', 'job-process-failed', { error: error.message });
    throw new Error(`Verarbeitung fehlgeschlagen: ${error.message}`);
  }
});
