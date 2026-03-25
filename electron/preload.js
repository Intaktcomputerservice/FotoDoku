import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fotoDokuApi', {
  pickFiles: () => ipcRenderer.invoke('dialog:pick-files'),
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  prepareJob: (payload) => ipcRenderer.invoke('job:prepare', payload),
  processJob: (payload) => ipcRenderer.invoke('job:process', payload)
});
