const state = {
  filePaths: [],
  items: [],
  targetFolder: '',
  defaultTargetFolder: ''
};

const el = {
  dropZone: document.getElementById('dropZone'),
  fileList: document.getElementById('fileList'),
  progress: document.getElementById('progress'),
  summary: document.getElementById('summary'),
  company: document.getElementById('companyInput'),
  extra: document.getElementById('extraInput'),
  targetFolder: document.getElementById('targetFolderInput'),
  defaultFolder: document.getElementById('defaultFolderInput')
};

const actionButtons = [
  'pickFilesBtn',
  'pickTargetBtn',
  'pickDefaultBtn',
  'saveSettingsBtn',
  'prepareBtn',
  'processBtn'
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

  el.dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    el.dropZone.classList.add('drag');
  });

  el.dropZone.addEventListener('dragleave', () => el.dropZone.classList.remove('drag'));
  el.dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    el.dropZone.classList.remove('drag');
    const filePaths = Array.from(event.dataTransfer.files || []).map((file) => file.path).filter(Boolean);
    addFiles(filePaths);
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
  renderFileList();
  setProgress(`${state.filePaths.length} Datei(en) ausgewählt. Bitte Vorschläge erzeugen.`);
}

async function onPrepare() {
  if (!state.filePaths.length) {
    setProgress('Bitte zuerst Dateien hinzufügen.');
    return;
  }

  setProgress('Analysiere Dateien und erstelle Vorschläge...');
  const items = await callApi('Vorschläge konnten nicht erzeugt werden.', () => api.prepareJob({
    filePaths: state.filePaths,
    company: el.company.value.trim(),
    extraText: el.extra.value.trim()
  }));

  if (!items) return;

  state.items = items;
  renderFileList();
  setProgress('Vorschläge erstellt. Dateinamen können vor dem Verarbeiten angepasst werden.');
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

  setProgress('Verarbeitung läuft...');
  const result = await callApi('Verarbeitung ist fehlgeschlagen.', () => api.processJob({ items, targetFolder: state.targetFolder }));
  if (!result) return;

  const ok = result.successes.length;
  const bad = result.rejected.length;

  el.summary.innerHTML = `
    <p><strong>Ergebnis:</strong> ${ok} erfolgreich, ${bad} abgelehnt.</p>
    <ul>
      ${result.rejected.map((entry) => `<li>${entry.originalName}: ${entry.reason}</li>`).join('')}
    </ul>
  `;
  setProgress('Verarbeitung abgeschlossen.');

  state.filePaths = [];
  state.items = [];
  renderFileList();
}

function onCancel() {
  state.filePaths = [];
  state.items = [];
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
    el.fileList.innerHTML = `<ul>${state.filePaths.map((file) => `<li>${basename(file)}</li>`).join('')}</ul>`;
    return;
  }

  el.fileList.innerHTML = state.items.map((item, index) => {
    if (item.status !== 'ready') {
      return `<div class="file-row"><div>${item.originalName}</div><div>${item.reason}</div><span class="badge err">Abgelehnt</span></div>`;
    }

    return `
      <div class="file-row">
        <div>${item.originalName}</div>
        <input id="name-${index}" value="${item.proposedName}" />
        <span class="badge ok">Bereit</span>
      </div>
    `;
  }).join('');
}

function basename(filePath) {
  return filePath.split(/[/\\]/).pop();
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
