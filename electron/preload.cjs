const { contextBridge, ipcRenderer } = require('electron');

function sanitizeSettingsPayload(payload) {
  return {
    defaultTargetFolder: typeof payload?.defaultTargetFolder === 'string' ? payload.defaultTargetFolder : ''
  };
}

function sanitizePreparePayload(payload) {
  const filePaths = Array.isArray(payload?.filePaths) ? payload.filePaths.filter((entry) => typeof entry === 'string') : [];
  return { filePaths };
}

function sanitizeProcessPayload(payload) {
  const items = Array.isArray(payload?.items) ? payload.items.filter((item) => item && typeof item === 'object') : [];
  return {
    items,
    targetFolder: typeof payload?.targetFolder === 'string' ? payload.targetFolder : ''
  };
}

contextBridge.exposeInMainWorld('fotoDokuApi', {
  pickFiles: () => ipcRenderer.invoke('dialog:pick-files'),
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', sanitizeSettingsPayload(payload)),
  prepareJob: (payload) => ipcRenderer.invoke('job:prepare', sanitizePreparePayload(payload)),
  processJob: (payload) => ipcRenderer.invoke('job:process', sanitizeProcessPayload(payload))
});
