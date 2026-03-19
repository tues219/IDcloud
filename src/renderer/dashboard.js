const bridge = window.bridge;
const eventLog = [];

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

// Version
bridge.getVersion().then(v => {
  document.getElementById('version').textContent = `v${v}`;
});

// Status updates
bridge.onStatusUpdate((data) => {
  addLog('info', data.module, `Status: ${data.status}`);
  updateStatus(data.module, data.status, data.error);
});

bridge.onEvent((data) => {
  if (data.type === 'file-detected') {
    addLog('info', 'xray', `File detected: ${data.fileInfo.name}`);
  } else if (data.type === 'show-settings') {
    document.querySelector('.tab[data-tab="settings"]').click();
  }
});

bridge.onQueueUpdate((status) => {
  renderQueue(status);
});

function updateStatus(module, status, error) {
  const el = document.getElementById(`${module === 'cardReader' ? 'card-reader' : module}-status`);
  if (!el) return;
  el.textContent = status;
  el.className = 'status-badge ' + status;
  const detail = document.getElementById(`${module === 'cardReader' ? 'card-reader' : module}-detail`);
  if (detail && error) detail.textContent = error;
}

// Initial status fetch
async function refreshStatus() {
  try {
    const status = await bridge.getStatus();
    updateStatus('cardReader', status.cardReader.status);
    updateStatus('edc', status.edc.status);
    updateStatus('xray', status.xray.fileWatcher.isWatching ? 'connected' : 'disconnected');
    document.getElementById('ws-detail').textContent = `Port ${status.ws.port}`;
    if (status.xray.queue) renderQueue(status.xray.queue);
  } catch (err) {
    addLog('error', 'dashboard', err.message);
  }
}
refreshStatus();
setInterval(refreshStatus, 10000);

// Settings
async function loadSettings() {
  const config = await bridge.getConfig();
  if (config.edc) {
    document.getElementById('edc-com').value = config.edc.comPort || '';
    document.getElementById('edc-baud').value = config.edc.baudRate || 9600;
  }
  if (config.xray) {
    document.getElementById('xray-folder').value = config.xray.watchFolder || '';
    document.getElementById('xray-api').value = config.xray.apiBaseUrl || '';
    document.getElementById('xray-clinic').value = config.xray.clinicBranchURL || '';
  }
  if (config.ws) {
    document.getElementById('ws-port').value = config.ws.port || 9900;
  }
}
loadSettings();

document.getElementById('btn-select-folder').addEventListener('click', async () => {
  const result = await bridge.selectFolder();
  if (result.success) {
    document.getElementById('xray-folder').value = result.path;
  }
});

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  await bridge.saveConfig('edc', {
    comPort: document.getElementById('edc-com').value,
    baudRate: parseInt(document.getElementById('edc-baud').value),
  });
  await bridge.saveConfig('xray', {
    watchFolder: document.getElementById('xray-folder').value,
    apiBaseUrl: document.getElementById('xray-api').value,
    clinicBranchURL: document.getElementById('xray-clinic').value,
  });
  await bridge.saveConfig('ws', {
    port: parseInt(document.getElementById('ws-port').value),
  });
  addLog('info', 'settings', 'Settings saved');
  alert('Settings saved');
});

// Xray drop zone
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const files = Array.from(e.dataTransfer.files).map(f => f.path);
  if (files.length > 0) {
    await bridge.dropFiles(files);
    addLog('info', 'xray', `Dropped ${files.length} file(s)`);
  }
});

function renderQueue(status) {
  const statsEl = document.getElementById('queue-stats');
  statsEl.innerHTML = `Pending: ${status.pending} | Processing: ${status.processing} | Completed: ${status.completed} | Failed: ${status.failed} | Awaiting: ${status.awaitingAssignment || 0}`;

  const listEl = document.getElementById('file-list');
  if (!status.items || status.items.length === 0) {
    listEl.innerHTML = '<div class="file-item" style="color:#888">No files in queue</div>';
    return;
  }
  listEl.innerHTML = status.items.map(item => `
    <div class="file-item">
      <span>${item.fileInfo.name}</span>
      <span class="file-status ${item.status}">${item.status}${item.error ? ': ' + item.error : ''}</span>
    </div>
  `).join('');
}

// Patient assignment
document.getElementById('btn-lookup').addEventListener('click', async () => {
  const dn = document.getElementById('assign-dn').value;
  if (!dn) return;
  const result = await bridge.lookupPatient(dn);
  const el = document.getElementById('assign-result');
  if (result.success && result.patients && result.patients.length > 0) {
    el.textContent = `Found: ${JSON.stringify(result.patients[0])}`;
  } else {
    el.textContent = result.error || 'No patient found';
  }
});

// Event log
function addLog(level, module, message) {
  const time = new Date().toLocaleTimeString();
  eventLog.unshift({ time, level, module, message });
  if (eventLog.length > 200) eventLog.pop();
  renderLog();
}

function renderLog() {
  const el = document.getElementById('event-log');
  el.innerHTML = eventLog.slice(0, 50).map(e =>
    `<div class="log-entry ${e.level}"><span class="time">${e.time}</span> <span class="module">[${e.module}]</span> ${e.message}</div>`
  ).join('');
}
