const state = {
  filePaths: [],
  items: [],
  targetFolder: '',
  defaultTargetFolder: '',
  lastResult: null
};

const el = {
  fileList: document.getElementById('fileList'),
  progress: document.getElementById('progress'),
  summary: document.getElementById('summary'),
  targetFolder: document.getElementById('targetFolderInput'),
  defaultFolder: document.getElementById('defaultFolderInput')
};

const actionButtons = [
  'pickFilesBtn',
  'pickTargetBtn',
  'pickDefaultBtn',
  'saveSettingsBtn',
  'prepareBtn',
  'processBtn',
  'cancelBtn'
].map((id) => document.getElementById(id));

const api = window.fotoDokuApi;

init();

async function init() {
  bindEvents();

  if (!hasBridgeApi()) {
    handleBridgeUnavailable();
    return;
  }

  try {
    const settings = await api.loadSettings();
    state.defaultTargetFolder = settings.defaultTargetFolder;
    state.targetFolder = settings.defaultTargetFolder;
    syncFolderInputs();
  } catch (error) {
    reportError('Einstellungen konnten nicht geladen werden.', error);
  }
}

function hasBridgeApi() {
  return api
    && typeof api.pickFiles === 'function'
    && typeof api.pickFolder === 'function'
    && typeof api.loadSettings === 'function'
    && typeof api.saveSettings === 'function'
    && typeof api.prepareJob === 'function'
    && typeof api.processJob === 'function';
}

function handleBridgeUnavailable() {
  disableUiActions(true);
  const message = 'Electron-Bridge nicht verfügbar. Bitte prüfen, ob das Preload-Skript korrekt geladen wurde.';
  setProgress(message);
  console.error(message);
}

function disableUiActions(disabled) {
  actionButtons.forEach((button) => {
    if (button) button.disabled = disabled;
  });
}

function bindEvents() {
  document.getElementById('pickFilesBtn').addEventListener('click', onPickFiles);
  document.getElementById('pickTargetBtn').addEventListener('click', onPickTargetFolder);
  document.getElementById('pickDefaultBtn').addEventListener('click', onPickDefaultFolder);
  document.getElementById('saveSettingsBtn').addEventListener('click', onSaveSettings);
  document.getElementById('prepareBtn').addEventListener('click', onPrepare);
  document.getElementById('processBtn').addEventListener('click', onProcess);
  document.getElementById('cancelBtn').addEventListener('click', onCancel);

  el.summary.addEventListener('click', (event) => {
    if (event.target?.id === 'retryFailedBtn') {
      void onRetryFailed();
    }
  });
}

async function onPickFiles() {
  const filePaths = await callApi('Dateiauswahl fehlgeschlagen.', () => api.pickFiles(), []);
  addFiles(filePaths);
}

function addFiles(filePaths) {
  if (!Array.isArray(filePaths) || !filePaths.length) return;

  const merged = new Set([...state.filePaths, ...filePaths]);
  state.filePaths = [...merged];
  state.items = [];
  state.lastResult = null;
  renderFileList();
  el.summary.innerHTML = '';
  setProgress(`${state.filePaths.length} Datei(en) ausgewählt. Bitte Vorschläge erzeugen.`);
}

async function onPrepare() {
  if (!state.filePaths.length) {
    setProgress('Bitte zuerst Dateien hinzufügen.');
    return;
  }

  setProgress(`Analysiere ${state.filePaths.length} Datei(en) und erstelle Vorschläge...`);
  const items = await callApi('Vorschläge konnten nicht erzeugt werden.', () => api.prepareJob({
    filePaths: state.filePaths
  }));

  if (!items) return;

  state.items = items;
  state.lastResult = null;
  renderFileList();
  const rejected = items.filter((item) => item.status !== 'ready').length;
  setProgress(`Vorschläge erstellt: ${items.length - rejected} bereit, ${rejected} abgelehnt.`);
}

async function onProcess() {
  if (!state.items.length) {
    setProgress('Bitte zuerst Vorschläge erzeugen.');
    return;
  }

  const items = state.items.map((item, index) => ({
    ...item,
    finalName: document.getElementById(`name-${index}`)?.value?.trim() || item.proposedName
  }));

  setProgress(`Verarbeitung läuft (${items.length} Datei(en))...`);
  const result = await callApi('Verarbeitung ist fehlgeschlagen.', () => api.processJob({ items, targetFolder: state.targetFolder }));
  if (!result) return;

  state.lastResult = result;
  renderSummary(result);
  setProgress(`Verarbeitung abgeschlossen: ${result.successes.length} erfolgreich, ${result.rejected.length} fehlgeschlagen.`);

  const failedNames = new Set(result.rejected.map((entry) => entry.originalName));
  state.items = state.items.filter((item) => failedNames.has(item.originalName));
  state.filePaths = state.items.map((item) => item.sourcePath);
  renderFileList();
}

async function onRetryFailed() {
  if (!state.items.length) {
    setProgress('Keine fehlgeschlagenen Dateien für Retry vorhanden.');
    return;
  }

  setProgress(`Retry gestartet (${state.items.length} Datei(en)).`);
  await onProcess();
}

function onCancel() {
  state.filePaths = [];
  state.items = [];
  state.lastResult = null;
  el.summary.innerHTML = '';
  renderFileList();
  setProgress('Aktueller Auftrag wurde verworfen.');
}

async function onPickTargetFolder() {
  const folder = await callApi('Zielordner konnte nicht gewählt werden.', () => api.pickFolder(), null);
  if (folder) {
    state.targetFolder = folder;
    syncFolderInputs();
  }
}

async function onPickDefaultFolder() {
  const folder = await callApi('Standardordner konnte nicht gewählt werden.', () => api.pickFolder(), null);
  if (folder) {
    state.defaultTargetFolder = folder;
    el.defaultFolder.value = folder;
  }
}

async function onSaveSettings() {
  const saved = await callApi('Einstellungen konnten nicht gespeichert werden.', () => api.saveSettings({
    defaultTargetFolder: state.defaultTargetFolder
  }));
  if (!saved) return;

  state.defaultTargetFolder = saved.defaultTargetFolder;
  if (!state.targetFolder) state.targetFolder = saved.defaultTargetFolder;
  syncFolderInputs();
  setProgress('Einstellungen gespeichert.');
}

function syncFolderInputs() {
  el.targetFolder.value = state.targetFolder;
  el.defaultFolder.value = state.defaultTargetFolder;
}

function setProgress(text) {
  el.progress.textContent = text;
}

function renderFileList() {
  if (!state.filePaths.length) {
    el.fileList.innerHTML = '<p>Keine Dateien im aktuellen Auftrag.</p>';
    return;
  }

  if (!state.items.length) {
    el.fileList.innerHTML = `<ul>${state.filePaths.map((file) => `<li>${escapeHtml(basename(file))}</li>`).join('')}</ul>`;
    return;
  }

  el.fileList.innerHTML = state.items.map((item, index) => {
    if (item.status !== 'ready') {
      return `<div class="file-row"><div>${escapeHtml(item.originalName)}</div><div>${escapeHtml(item.reason)}</div><span class="badge err">Abgelehnt</span></div>`;
    }

    return `
      <div class="file-row">
        <div>${escapeHtml(item.originalName)}</div>
        <input id="name-${index}" value="${escapeHtmlAttr(item.proposedName)}" />
        <span class="badge ok">Bereit</span>
      </div>
    `;
  }).join('');
}

function renderSummary(result) {
  const failedList = result.rejected.map((entry) => `<li>${escapeHtml(entry.originalName)}: ${escapeHtml(entry.reason)}</li>`).join('');
  const retryButton = result.rejected.length ? '<button id="retryFailedBtn">Fehlgeschlagene erneut versuchen</button>' : '';

  el.summary.innerHTML = `
    <p><strong>Ergebnis:</strong> ${result.successes.length} erfolgreich, ${result.rejected.length} abgelehnt.</p>
    ${retryButton}
    <ul>${failedList}</ul>
  `;
}

function basename(filePath) {
  return filePath.split(/[/\\]/).pop();
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(text) {
  return escapeHtml(text).replace(/`/g, '&#96;');
}

async function callApi(userMessage, fn, fallback = null) {
  if (!hasBridgeApi()) {
    handleBridgeUnavailable();
    return fallback;
  }

  try {
    return await fn();
  } catch (error) {
    reportError(userMessage, error);
    return fallback;
  }
}

function reportError(userMessage, error) {
  setProgress(userMessage);
  console.error(`${userMessage}`, error);
}
