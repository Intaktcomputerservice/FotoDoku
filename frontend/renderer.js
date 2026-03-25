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

init();

async function init() {
  bindEvents();
  const settings = await window.fotoDokuApi.loadSettings();
  state.defaultTargetFolder = settings.defaultTargetFolder;
  state.targetFolder = settings.defaultTargetFolder;
  syncFolderInputs();
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
  const filePaths = await window.fotoDokuApi.pickFiles();
  addFiles(filePaths);
}

function addFiles(filePaths) {
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
  state.items = await window.fotoDokuApi.prepareJob({
    filePaths: state.filePaths,
    company: el.company.value.trim(),
    extraText: el.extra.value.trim()
  });
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
  const result = await window.fotoDokuApi.processJob({ items, targetFolder: state.targetFolder });
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
  const folder = await window.fotoDokuApi.pickFolder();
  if (folder) {
    state.targetFolder = folder;
    syncFolderInputs();
  }
}

async function onPickDefaultFolder() {
  const folder = await window.fotoDokuApi.pickFolder();
  if (folder) {
    state.defaultTargetFolder = folder;
    el.defaultFolder.value = folder;
  }
}

async function onSaveSettings() {
  const saved = await window.fotoDokuApi.saveSettings({ defaultTargetFolder: state.defaultTargetFolder });
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
