/**
 * popup.js — Main popup controller.
 *
 * Handles all UI interactions:
 *  - Tab switching
 *  - Timer: start / stop / display
 *  - Entries: list, manual add, delete
 *  - Projects: list, create, edit, archive
 *  - Reports: filter, summarize, display
 *  - Google Auth + Drive sync
 */

import {
  getData, setData,
  getProjects, saveProject,
  getEntries, saveEntry, deleteEntry,
  getSettings, updateSettings,
  getTimerState, setTimerState,
} from './js/storage.js';

import {
  getAuthToken, revokeToken, getUserInfo,
  syncWithDrive, isDriveConfigured,
} from './js/drive.js';

import {
  roundToQuarterHour, formatMinutes, formatTimer,
  parseTimeInput, todayISO, displayDate,
  weekRange, monthRange, yearRange, formatCurrency, generateId,
} from './js/utils.js';

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  projects: [],
  entries: [],
  settings: {},
  user: null,
  timer: {
    running: false,
    startTime: null,
    projectId: null,
    memo: '',
    intervalId: null,
  },
  currentTab: 'timer',
  editingProjectId: null,
  editingEntryId: null,
  reportPeriod: 'month',
  reportProjectId: '',
  reportStart: null,
  reportEnd: null,
};

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadData();
  await restoreTimerState();
  await loadUserInfo();
  renderAll();
  bindEvents();
  scheduleDriveSync();

  // Show onboarding on first run
  if (!state.settings.hasOnboarded) {
    document.getElementById('onboarding-panel').classList.remove('hidden');
  }
}

async function loadData() {
  state.projects = await getProjects(true); // include archived
  state.entries = await getEntries();
  state.settings = await getSettings();
}

async function restoreTimerState() {
  const saved = await getTimerState();
  if (saved && saved.startTime) {
    state.timer.running = true;
    state.timer.startTime = saved.startTime;
    state.timer.projectId = saved.projectId;
    state.timer.memo = saved.memo || '';
    startTimerTick();
  }
}

async function loadUserInfo() {
  const info = await getUserInfo();
  state.user = info;
  renderHeader();
}

// ─── Drive sync ───────────────────────────────────────────────────────────────

let syncDebounceTimer = null;

function scheduleDriveSync() {
  // Auto-sync 3s after any data change, debounced
}

async function syncNow(showIndicator = false) {
  const token = await getAuthToken(false);
  if (!token) return;

  if (showIndicator) {
    const el = document.getElementById('sync-indicator');
    el.classList.remove('hidden');
    el.classList.add('syncing');
  }

  try {
    const data = await getData();
    const { success, fileId, data: merged } = await syncWithDrive(
      data,
      state.settings.driveFileId
    );
    if (success && fileId) {
      await updateSettings({ driveFileId: fileId });
      state.settings.driveFileId = fileId;
      if (merged !== data) {
        // Remote was newer — reload
        state.projects = merged.projects || [];
        state.entries = merged.entries || [];
        renderAll();
      }
    }
  } catch (err) {
    console.warn('Sync error:', err);
  } finally {
    const el = document.getElementById('sync-indicator');
    el.classList.add('hidden');
    el.classList.remove('syncing');
  }
}

function triggerSync() {
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => syncNow(true), 3000);
}

// ─── Tab switching ────────────────────────────────────────────────────────────

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tab}`);
  });
  if (tab === 'timer') renderEntries();
  if (tab === 'projects') renderProjects();
  if (tab === 'reports') renderReports();
}

// ─── Header ───────────────────────────────────────────────────────────────────

function renderHeader() {
  // Show a green dot when Drive is active and user is signed in
  const dot = document.getElementById('drive-status-dot');
  if (dot) {
    dot.classList.toggle('hidden', !isDriveConfigured() || !state.user);
  }
}

// ─── Timer ────────────────────────────────────────────────────────────────────

function startTimerTick() {
  if (state.timer.intervalId) clearInterval(state.timer.intervalId);
  state.timer.intervalId = setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay();
}

function stopTimerTick() {
  if (state.timer.intervalId) {
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
  }
}

function updateTimerDisplay() {
  const elapsed = state.timer.running
    ? Math.floor((Date.now() - state.timer.startTime) / 1000)
    : 0;
  const display = document.getElementById('timer-display');
  if (display) display.textContent = formatTimer(elapsed);
}

async function startTimer() {
  if (!state.timer.projectId) {
    showToast('Please select a project first');
    return;
  }
  state.timer.running = true;
  state.timer.startTime = Date.now();
  state.timer.memo = document.getElementById('timer-memo').value.trim();

  await setTimerState({
    startTime: state.timer.startTime,
    projectId: state.timer.projectId,
    memo: state.timer.memo,
  });

  chrome.runtime.sendMessage({ type: 'TIMER_STARTED' });
  startTimerTick();
  renderTimerControls();
}

async function stopTimer() {
  if (!state.timer.running) return;

  const elapsedMs = Date.now() - state.timer.startTime;
  const rawMinutes = Math.round(elapsedMs / 60000);
  const project = state.projects.find((p) => p.id === state.timer.projectId);
  const shouldRound = project?.roundToQuarter ?? false;
  const finalMinutes = shouldRound ? roundToQuarterHour(rawMinutes) : rawMinutes;

  // Don't save 0-minute entries
  if (finalMinutes > 0) {
    const entry = {
      id: generateId(),
      projectId: state.timer.projectId,
      date: todayISO(),
      minutes: finalMinutes,
      originalMinutes: rawMinutes,
      memo: state.timer.memo,
      type: 'timer',
      createdAt: new Date().toISOString(),
    };
    await saveEntry(entry);
    state.entries.push(entry);
    triggerSync();
  }

  // Reset timer state
  state.timer.running = false;
  state.timer.startTime = null;
  stopTimerTick();
  await setTimerState(null);
  chrome.runtime.sendMessage({ type: 'TIMER_STOPPED' });

  renderTimerControls();
  renderEntries();
  showToast(`Saved ${formatMinutes(finalMinutes)}`);
}

function renderTimerControls() {
  const display = document.getElementById('timer-display');
  const toggleBtn = document.getElementById('timer-toggle');
  const projectSelect = document.getElementById('timer-project');
  const memoInput = document.getElementById('timer-memo');
  const roundBadge = document.getElementById('rounding-badge-wrap');

  if (state.timer.running) {
    display.classList.add('running');
    toggleBtn.textContent = 'Stop';
    toggleBtn.classList.add('running');
    projectSelect.disabled = true;
    memoInput.disabled = true;
    memoInput.value = state.timer.memo;
  } else {
    display.textContent = '00:00';
    display.classList.remove('running');
    toggleBtn.textContent = 'Start';
    toggleBtn.classList.remove('running');
    projectSelect.disabled = false;
    memoInput.disabled = false;
    memoInput.value = '';
    roundBadge.classList.add('hidden');
  }

  // Show rounding badge when project has it enabled
  if (state.timer.projectId) {
    const proj = state.projects.find((p) => p.id === state.timer.projectId);
    if (proj?.roundToQuarter) {
      roundBadge.classList.remove('hidden');
    } else {
      roundBadge.classList.add('hidden');
    }
  }
}

// ─── Project select population ────────────────────────────────────────────────

function populateProjectSelects() {
  const active = state.projects.filter((p) => !p.archived);

  ['timer-project', 'mf-project', 'report-project'].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;

    const first = sel.options[0]; // keep "— Select —" or "All Projects"
    sel.innerHTML = '';
    sel.appendChild(first);

    active.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
  });

  // Restore timer project selection
  if (state.timer.projectId) {
    const sel = document.getElementById('timer-project');
    if (sel) sel.value = state.timer.projectId;
  }
}

// ─── Entries ──────────────────────────────────────────────────────────────────

function renderEntries() {
  const list = document.getElementById('entries-list');
  if (!list) return;

  // Show last 30 entries, newest first
  const sorted = [...state.entries].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  ).slice(0, 30);

  if (sorted.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="4" y="6" width="24" height="20" rx="3" stroke="#CBD5E1" stroke-width="2"/>
          <path d="M10 12h12M10 16h8M10 20h10" stroke="#CBD5E1" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <p>No entries yet. Start the timer<br/>or add a manual entry.</p>
      </div>`;
    return;
  }

  list.innerHTML = sorted.map((entry) => {
    const proj = state.projects.find((p) => p.id === entry.projectId);
    const color = proj?.color || '#94A3B8';
    const name = proj?.name || 'Unknown Project';
    const wasRounded = entry.originalMinutes != null && entry.originalMinutes !== entry.minutes;
    return `
      <div class="entry-item" data-id="${entry.id}">
        <div class="entry-color-dot" style="background:${color};"></div>
        <div class="entry-body">
          <div class="entry-project">${escapeHtml(name)}</div>
          <div class="entry-meta">${displayDate(entry.date)} · ${entry.type === 'timer' ? 'Timer' : 'Manual'}</div>
          ${entry.memo ? `<div class="entry-memo">${escapeHtml(entry.memo)}</div>` : ''}
        </div>
        <div class="entry-right">
          <span class="entry-duration">${formatMinutes(entry.minutes)}</span>
          ${wasRounded ? `<span class="entry-rounded-badge">↑ rounded</span>` : ''}
          <button class="btn-icon delete-entry-btn" data-id="${entry.id}" title="Delete entry">
            <svg width="13" height="13" viewBox="0 0 13 13"><path d="M2 2l9 9M11 2l-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

// ─── Manual Entry Form ────────────────────────────────────────────────────────

function openManualForm(entryId = null) {
  state.editingEntryId = entryId;
  const panel = document.getElementById('manual-form-panel');
  const title = document.getElementById('manual-form-title');

  title.textContent = entryId ? 'Edit Entry' : 'Add Time Entry';

  if (entryId) {
    const entry = state.entries.find((e) => e.id === entryId);
    if (entry) {
      document.getElementById('mf-project').value = entry.projectId;
      document.getElementById('mf-date').value = entry.date;
      const h = Math.floor(entry.minutes / 60);
      const m = entry.minutes % 60;
      document.getElementById('mf-duration').value = h > 0 ? `${h}:${String(m).padStart(2,'0')}` : `${m}`;
      document.getElementById('mf-memo').value = entry.memo || '';
    }
  } else {
    document.getElementById('mf-project').value = state.timer.projectId || '';
    document.getElementById('mf-date').value = todayISO();
    document.getElementById('mf-duration').value = '';
    document.getElementById('mf-memo').value = '';
  }

  updateManualRoundingUI();
  panel.classList.remove('hidden');
}

function closeManualForm() {
  document.getElementById('manual-form-panel').classList.add('hidden');
  state.editingEntryId = null;
}

function updateManualRoundingUI() {
  const projectId = document.getElementById('mf-project').value;
  const proj = state.projects.find((p) => p.id === projectId);
  const roundRow = document.getElementById('mf-rounding-row');
  const roundCheck = document.getElementById('mf-round');

  if (proj) {
    roundRow.classList.remove('hidden');
    roundCheck.checked = proj.roundToQuarter;
  } else {
    roundRow.classList.add('hidden');
  }
  updateManualRoundPreview();
}

function updateManualRoundPreview() {
  const durationRaw = document.getElementById('mf-duration').value;
  const shouldRound = document.getElementById('mf-round').checked;
  const preview = document.getElementById('mf-rounded-preview');
  const previewVal = document.getElementById('mf-rounded-value');

  const minutes = parseTimeInput(durationRaw);
  if (minutes != null && shouldRound) {
    const rounded = roundToQuarterHour(minutes);
    if (rounded !== minutes) {
      previewVal.textContent = formatMinutes(rounded);
      preview.classList.remove('hidden');
      return;
    }
  }
  preview.classList.add('hidden');
}

async function saveManualEntry() {
  const projectId = document.getElementById('mf-project').value;
  const date = document.getElementById('mf-date').value;
  const durationRaw = document.getElementById('mf-duration').value;
  const memo = document.getElementById('mf-memo').value.trim();
  const shouldRound = document.getElementById('mf-round').checked;

  if (!projectId) { showToast('Please select a project'); return; }
  if (!date) { showToast('Please enter a date'); return; }

  const rawMinutes = parseTimeInput(durationRaw);
  if (!rawMinutes || rawMinutes <= 0) { showToast('Please enter a valid duration'); return; }

  const finalMinutes = shouldRound ? roundToQuarterHour(rawMinutes) : rawMinutes;

  const entry = {
    id: state.editingEntryId || generateId(),
    projectId,
    date,
    minutes: finalMinutes,
    originalMinutes: rawMinutes,
    memo,
    type: 'manual',
    createdAt: state.editingEntryId
      ? state.entries.find((e) => e.id === state.editingEntryId)?.createdAt
      : new Date().toISOString(),
  };

  await saveEntry(entry);

  if (state.editingEntryId) {
    const idx = state.entries.findIndex((e) => e.id === state.editingEntryId);
    if (idx >= 0) state.entries[idx] = entry;
  } else {
    state.entries.push(entry);
  }

  triggerSync();
  closeManualForm();
  renderEntries();
  showToast(`Saved ${formatMinutes(finalMinutes)}`);
}

// ─── Projects ─────────────────────────────────────────────────────────────────

function renderProjects() {
  const list = document.getElementById('projects-list');
  const showArchived = document.getElementById('show-archived').checked;
  const projects = showArchived
    ? state.projects
    : state.projects.filter((p) => !p.archived);

  if (projects.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="4" y="8" width="24" height="16" rx="3" stroke="#CBD5E1" stroke-width="2"/>
          <path d="M4 13h24" stroke="#CBD5E1" stroke-width="1.5"/>
        </svg>
        <p>No projects yet.<br/>Create one to get started.</p>
      </div>`;
    return;
  }

  list.innerHTML = projects.map((p) => `
    <div class="project-item ${p.archived ? 'archived' : ''}" data-id="${p.id}">
      <div class="project-color-swatch" style="background:${p.color || '#94A3B8'};"></div>
      <div class="project-info">
        <div class="project-name">${escapeHtml(p.name)}</div>
        <div class="project-rate">
          ${p.rate ? formatCurrency(p.rate, p.currency) + '/hr' : 'No rate set'}
        </div>
      </div>
      <div class="project-badges">
        ${p.roundToQuarter ? '<span class="badge badge-quarter">¼ hr</span>' : ''}
        ${p.archived ? '<span class="badge badge-archived">Archived</span>' : ''}
      </div>
    </div>
  `).join('');
}

function openProjectForm(projectId = null) {
  state.editingProjectId = projectId;
  const panel = document.getElementById('project-form-panel');
  const title = document.getElementById('project-form-title');
  const archiveRow = document.getElementById('pf-archive-row');

  title.textContent = projectId ? 'Edit Project' : 'New Project';
  archiveRow.classList.toggle('hidden', !projectId);

  if (projectId) {
    const proj = state.projects.find((p) => p.id === projectId);
    if (proj) {
      document.getElementById('pf-name').value = proj.name;
      document.getElementById('pf-rate').value = proj.rate || '';
      document.getElementById('pf-currency').value = proj.currency || 'USD';
      document.getElementById('pf-color').value = proj.color || '#0D9488';
      document.getElementById('pf-round').checked = proj.roundToQuarter;
      document.getElementById('pf-archived').checked = proj.archived;
    }
  } else {
    document.getElementById('pf-name').value = '';
    document.getElementById('pf-rate').value = '';
    document.getElementById('pf-currency').value = state.settings.currency || 'USD';
    document.getElementById('pf-color').value = randomColor();
    document.getElementById('pf-round').checked = false;
    document.getElementById('pf-archived').checked = false;
  }

  panel.classList.remove('hidden');
  document.getElementById('pf-name').focus();
}

function closeProjectForm() {
  document.getElementById('project-form-panel').classList.add('hidden');
  state.editingProjectId = null;
}

async function saveProjectForm() {
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { showToast('Project name is required'); return; }

  const project = {
    id: state.editingProjectId || generateId(),
    name,
    rate: parseFloat(document.getElementById('pf-rate').value) || 0,
    currency: document.getElementById('pf-currency').value,
    color: document.getElementById('pf-color').value,
    roundToQuarter: document.getElementById('pf-round').checked,
    archived: document.getElementById('pf-archived').checked,
    createdAt: state.editingProjectId
      ? state.projects.find((p) => p.id === state.editingProjectId)?.createdAt
      : new Date().toISOString(),
  };

  await saveProject(project);

  if (state.editingProjectId) {
    const idx = state.projects.findIndex((p) => p.id === state.editingProjectId);
    if (idx >= 0) state.projects[idx] = project;
  } else {
    state.projects.push(project);
  }

  triggerSync();
  closeProjectForm();
  populateProjectSelects();
  renderProjects();
  showToast(`Project "${name}" saved`);
}

// ─── Reports ──────────────────────────────────────────────────────────────────

function getReportDateRange() {
  const today = todayISO();
  switch (state.reportPeriod) {
    case 'week':  return weekRange(today);
    case 'month': return monthRange(today);
    case 'year':  return yearRange(today);
    case 'custom':
      return {
        start: state.reportStart || today,
        end: state.reportEnd || today,
      };
    default: return monthRange(today);
  }
}

function renderReports() {
  const { start, end } = getReportDateRange();
  const filterProjectId = state.reportProjectId;

  // Filter entries by date range and project
  const filtered = state.entries.filter((e) => {
    const inRange = e.date >= start && e.date <= end;
    const inProject = !filterProjectId || e.projectId === filterProjectId;
    return inRange && inProject;
  });

  const content = document.getElementById('report-content');

  if (filtered.length === 0) {
    content.innerHTML = `
      <div class="empty-state" style="padding:40px 16px;">
        <p>No entries in this period.</p>
      </div>`;
    return;
  }

  // Aggregate by project
  const byProject = {};
  let totalMinutes = 0;
  let totalEarnings = 0;

  filtered.forEach((entry) => {
    const proj = state.projects.find((p) => p.id === entry.projectId);
    const key = entry.projectId;
    if (!byProject[key]) {
      byProject[key] = { proj, minutes: 0, earnings: 0, entries: [] };
    }
    byProject[key].minutes += entry.minutes;
    byProject[key].earnings += ((proj?.rate || 0) * entry.minutes) / 60;
    byProject[key].entries.push(entry);
    totalMinutes += entry.minutes;
    totalEarnings += ((proj?.rate || 0) * entry.minutes) / 60;
  });

  const currency = state.settings.currency || 'USD';

  // Summary cards
  const summaryHtml = `
    <div class="report-summary">
      <div class="summary-card">
        <div class="label">Total Hours</div>
        <div class="value">${(totalMinutes / 60).toFixed(1)}h</div>
      </div>
      <div class="summary-card">
        <div class="label">Total Earnings</div>
        <div class="value">${formatCurrency(totalEarnings, currency)}</div>
      </div>
    </div>`;

  // Per-project rows
  const rows = Object.values(byProject)
    .sort((a, b) => b.minutes - a.minutes)
    .map(({ proj, minutes, earnings, entries: projEntries }) => {
      const color = proj?.color || '#94A3B8';
      const name = proj?.name || 'Unknown Project';
      const hours = (minutes / 60).toFixed(1);
      const sortedEntries = [...projEntries].sort((a, b) => b.date.localeCompare(a.date));

      const entryRows = sortedEntries.map((e) => `
        <div class="report-entry-row">
          <span class="report-entry-date">${displayDate(e.date)}</span>
          <span class="report-entry-memo">${e.memo ? escapeHtml(e.memo) : '—'}</span>
          <span class="report-entry-duration">${formatMinutes(e.minutes)}</span>
        </div>`).join('');

      return `
        <div class="report-row">
          <div class="report-row-dot" style="background:${color};"></div>
          <div class="report-row-name">${escapeHtml(name)}</div>
          <div class="report-row-detail">
            <span class="report-row-hours">${hours}h</span>
            ${proj?.rate ? `<span class="report-row-amount">${formatCurrency(earnings, proj.currency || currency)}</span>` : ''}
          </div>
        </div>
        ${entryRows}`;
    }).join('');

  const tableHtml = `
    <div class="report-table">
      <div class="report-table-header">
        <h3>By Project</h3>
        <small class="text-muted">${displayDate(start, true)} – ${displayDate(end, true)}</small>
      </div>
      ${rows}
    </div>`;

  content.innerHTML = summaryHtml + tableHtml;
}

// ─── Render all ───────────────────────────────────────────────────────────────

function renderAll() {
  populateProjectSelects();
  renderTimerControls();
  renderEntries();
  renderProjects();
  renderReports();
}

// ─── Events ───────────────────────────────────────────────────────────────────

function bindEvents() {
  // Nav tabs
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Onboarding
  document.getElementById('onboarding-start-btn').addEventListener('click', async () => {
    await dismissOnboarding();
    openProjectForm(); // jump straight into creating first project
  });
  document.getElementById('onboarding-skip-btn').addEventListener('click', dismissOnboarding);

  // Settings panel
  document.getElementById('settings-open-btn').addEventListener('click', openSettings);
  document.getElementById('settings-close-btn').addEventListener('click', closeSettings);

  document.getElementById('settings-sign-in-btn').addEventListener('click', async () => {
    const token = await getAuthToken(true);
    if (token) {
      await loadUserInfo();
      await syncNow(true);
      renderHeader();
      renderSettingsPanel();
      showToast('Signed in & synced');
    } else {
      showToast('Sign-in cancelled or failed');
    }
  });

  document.getElementById('settings-sign-out-btn').addEventListener('click', async () => {
    await revokeToken();
    state.user = null;
    renderHeader();
    renderSettingsPanel();
    showToast('Signed out');
  });

  document.getElementById('sync-now-btn').addEventListener('click', async () => {
    await syncNow(true);
    renderSettingsPanel();
    showToast('Sync complete');
  });

  // Export / Import
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) readImportFile(file);
    e.target.value = ''; // reset so same file can be re-selected
  });
  document.getElementById('import-confirm-btn').addEventListener('click', confirmImport);
  document.getElementById('import-cancel-btn').addEventListener('click', () => {
    document.getElementById('import-preview').classList.add('hidden');
    state._pendingImport = null;
  });

  // Clear all data
  document.getElementById('clear-data-btn').addEventListener('click', clearAllData);

  // Timer controls
  document.getElementById('timer-project').addEventListener('change', (e) => {
    state.timer.projectId = e.target.value || null;
    renderTimerControls();
  });

  document.getElementById('timer-toggle').addEventListener('click', () => {
    if (state.timer.running) {
      stopTimer();
    } else {
      startTimer();
    }
  });

  // Add manual entry
  document.getElementById('add-entry-btn').addEventListener('click', () => openManualForm());

  // Entries list — delete buttons (delegated)
  document.getElementById('entries-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.delete-entry-btn');
    if (btn) {
      const id = btn.dataset.id;
      await deleteEntry(id);
      state.entries = state.entries.filter((en) => en.id !== id);
      renderEntries();
      triggerSync();
      showToast('Entry deleted');
    }
  });

  // Manual form
  document.getElementById('manual-form-close').addEventListener('click', closeManualForm);
  document.getElementById('manual-form-cancel').addEventListener('click', closeManualForm);
  document.getElementById('manual-form-save').addEventListener('click', saveManualEntry);
  document.getElementById('mf-project').addEventListener('change', updateManualRoundingUI);
  document.getElementById('mf-duration').addEventListener('input', updateManualRoundPreview);
  document.getElementById('mf-round').addEventListener('change', updateManualRoundPreview);

  // Projects
  document.getElementById('add-project-btn').addEventListener('click', () => openProjectForm());
  document.getElementById('show-archived').addEventListener('change', renderProjects);

  document.getElementById('projects-list').addEventListener('click', (e) => {
    const item = e.target.closest('.project-item');
    if (item) openProjectForm(item.dataset.id);
  });

  document.getElementById('project-form-close').addEventListener('click', closeProjectForm);
  document.getElementById('project-form-cancel').addEventListener('click', closeProjectForm);
  document.getElementById('project-form-save').addEventListener('click', saveProjectForm);

  // Reports
  document.getElementById('report-period').addEventListener('change', (e) => {
    state.reportPeriod = e.target.value;
    const customDates = document.getElementById('report-custom-dates');
    customDates.classList.toggle('hidden', state.reportPeriod !== 'custom');
    if (state.reportPeriod !== 'custom') renderReports();
  });

  document.getElementById('report-project').addEventListener('change', (e) => {
    state.reportProjectId = e.target.value;
    renderReports();
  });

  document.getElementById('report-apply').addEventListener('click', () => {
    state.reportStart = document.getElementById('report-start').value || null;
    state.reportEnd = document.getElementById('report-end').value || null;
    renderReports();
  });
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

async function dismissOnboarding() {
  document.getElementById('onboarding-panel').classList.add('hidden');
  if (!state.settings.hasOnboarded) {
    state.settings.hasOnboarded = true;
    await updateSettings({ hasOnboarded: true });
  }
}

// ─── Settings panel ───────────────────────────────────────────────────────────

function openSettings() {
  renderSettingsPanel();
  document.getElementById('settings-panel').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-panel').classList.add('hidden');
  document.getElementById('import-preview').classList.add('hidden');
  state._pendingImport = null;
}

function renderSettingsPanel() {
  const configured = isDriveConfigured();

  document.getElementById('drive-state-unconfigured').classList.toggle('hidden', configured);
  document.getElementById('drive-state-signed-out').classList.toggle('hidden', !configured || !!state.user);
  document.getElementById('drive-state-signed-in').classList.toggle('hidden', !configured || !state.user);

  // Show extension ID for Google Cloud setup
  const extIdEl = document.getElementById('extension-id');
  if (extIdEl) extIdEl.textContent = chrome.runtime.id;

  if (state.user) {
    const avatar = document.getElementById('settings-avatar');
    if (state.user.picture) {
      avatar.src = state.user.picture;
      avatar.style.display = 'block';
    } else {
      avatar.style.display = 'none';
    }
    document.getElementById('settings-user-name').textContent = state.user.name || '';
    document.getElementById('settings-user-email').textContent = state.user.email || '';

    const lastSynced = document.getElementById('drive-last-synced');
    lastSynced.textContent = state.settings.driveFileId
      ? 'Drive sync is active.'
      : 'Not yet synced — click Sync Now.';
  }
}

// ─── Export / Import ──────────────────────────────────────────────────────────

async function exportData() {
  const data = await getData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `timesheets-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported');
}

function readImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid format');

      const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];

      state._pendingImport = parsed;

      document.getElementById('import-projects-count').textContent =
        `${projects.length} project${projects.length !== 1 ? 's' : ''}`;
      document.getElementById('import-entries-count').textContent =
        `${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'}`;
      document.getElementById('import-preview').classList.remove('hidden');
    } catch {
      showToast('Invalid backup file');
    }
  };
  reader.readAsText(file);
}

async function confirmImport() {
  const imported = state._pendingImport;
  if (!imported) return;

  const current = await getData();

  // Merge: combine arrays, dedupe by id (imported wins on conflict)
  const mergeById = (existing, incoming) => {
    const map = new Map(existing.map((item) => [item.id, item]));
    incoming.forEach((item) => map.set(item.id, item));
    return Array.from(map.values());
  };

  const merged = {
    ...current,
    projects: mergeById(current.projects || [], imported.projects || []),
    entries: mergeById(current.entries || [], imported.entries || []),
  };

  await setData(merged);
  state.projects = merged.projects;
  state.entries = merged.entries;
  state._pendingImport = null;

  document.getElementById('import-preview').classList.add('hidden');
  triggerSync();
  renderAll();
  showToast('Import complete');
}

async function clearAllData() {
  if (!confirm('Delete ALL projects and time entries? This cannot be undone.')) return;

  const data = await getData();
  data.projects = [];
  data.entries = [];
  await setData(data);

  state.projects = [];
  state.entries = [];
  triggerSync();
  renderAll();
  closeSettings();
  showToast('All data cleared');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function showToast(msg, duration = 2200) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const COLORS = [
  '#0D9488','#0891B2','#7C3AED','#DB2777','#D97706',
  '#16A34A','#EA580C','#DC2626','#4F46E5','#0369A1',
];
let colorIdx = Math.floor(Math.random() * COLORS.length);
function randomColor() {
  return COLORS[colorIdx++ % COLORS.length];
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init().catch(console.error);
