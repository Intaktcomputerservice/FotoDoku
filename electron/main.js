import path from 'path';
import fs from 'fs';
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'url';
import { createGeocodeService } from '../backend/geocodeService.js';
import { createSettingsStore } from '../backend/settingsStore.js';
import { prepareBatch, processBatch } from '../backend/processor.js';
import { shutdownExiftool } from '../backend/exifService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win;

const userData = app.getPath('userData');
const store = createSettingsStore(path.join(userData, 'settings.json'));
const fallbackTarget = path.join(app.getPath('documents'), 'FotoDoku', 'verarbeitet');

const geocodeService = createGeocodeService({
  cacheFile: path.join(userData, 'geocode-cache.json'),
  userAgent: 'FotoDokuDesktop/1.0 (kontakt@example.org)'
});

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
}

app.whenReady().then(() => {
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
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('settings:load', async () => {
  const current = store.read();
  const defaultTargetFolder = current.defaultTargetFolder || fallbackTarget;
  fs.mkdirSync(defaultTargetFolder, { recursive: true });
  return { defaultTargetFolder };
});

ipcMain.handle('settings:save', async (_event, payload) => {
  const next = { defaultTargetFolder: payload.defaultTargetFolder || fallbackTarget };
  store.write(next);
  return next;
});

ipcMain.handle('job:prepare', async (_event, payload) => {
  return prepareBatch({
    filePaths: payload.filePaths,
    company: payload.company,
    extraText: payload.extraText,
    geocodeService
  });
});

ipcMain.handle('job:process', async (_event, payload) => {
  const targetRoot = payload.targetFolder || store.read().defaultTargetFolder || fallbackTarget;
  fs.mkdirSync(targetRoot, { recursive: true });
  return processBatch({ items: payload.items, targetRoot });
});
