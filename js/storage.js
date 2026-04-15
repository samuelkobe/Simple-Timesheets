/**
 * storage.js — local data layer.
 *
 * All data lives in chrome.storage.local under the key "timesheets_data".
 * Shape:
 * {
 *   version: 1,
 *   projects: Project[],
 *   entries: Entry[],
 *   settings: Settings,
 *   lastModified: ISO string
 * }
 *
 * Project: { id, name, rate, currency, color, roundToQuarter, archived, createdAt }
 * Entry:   { id, projectId, date, minutes, originalMinutes, memo, type, createdAt }
 * Settings: { currency, driveFileId, hasOnboarded }
 */

const DATA_KEY = 'timesheets_data';

const DEFAULT_DATA = {
  version: 1,
  projects: [],
  entries: [],
  settings: {
    currency: 'USD',
    driveFileId: null,
    hasOnboarded: false,
  },
  lastModified: new Date().toISOString(),
};

// ─── Read / Write ─────────────────────────────────────────────────────────────

export async function getData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DATA_KEY, (result) => {
      resolve(result[DATA_KEY] || structuredClone(DEFAULT_DATA));
    });
  });
}

export async function setData(data) {
  data.lastModified = new Date().toISOString();
  return new Promise((resolve) => {
    chrome.storage.local.set({ [DATA_KEY]: data }, resolve);
  });
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function getProjects(includeArchived = false) {
  const data = await getData();
  return includeArchived
    ? data.projects
    : data.projects.filter((p) => !p.archived);
}

export async function saveProject(project) {
  const data = await getData();
  const idx = data.projects.findIndex((p) => p.id === project.id);
  if (idx >= 0) {
    data.projects[idx] = project;
  } else {
    data.projects.push(project);
  }
  await setData(data);
  return project;
}

export async function deleteProject(projectId) {
  const data = await getData();
  data.projects = data.projects.filter((p) => p.id !== projectId);
  // orphan entries stay — they just show "Unknown project"
  await setData(data);
}

// ─── Entries ─────────────────────────────────────────────────────────────────

export async function getEntries() {
  const data = await getData();
  return data.entries;
}

export async function saveEntry(entry) {
  const data = await getData();
  const idx = data.entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    data.entries[idx] = entry;
  } else {
    data.entries.push(entry);
  }
  await setData(data);
  return entry;
}

export async function deleteEntry(entryId) {
  const data = await getData();
  data.entries = data.entries.filter((e) => e.id !== entryId);
  await setData(data);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings() {
  const data = await getData();
  return data.settings;
}

export async function updateSettings(patch) {
  const data = await getData();
  data.settings = { ...data.settings, ...patch };
  await setData(data);
  return data.settings;
}

// ─── Timer state (separate key for quick access) ──────────────────────────────

const TIMER_KEY = 'timesheets_timer';

export async function getTimerState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(TIMER_KEY, (result) => {
      resolve(result[TIMER_KEY] || null);
    });
  });
}

export async function setTimerState(state) {
  return new Promise((resolve) => {
    if (state === null) {
      chrome.storage.local.remove(TIMER_KEY, resolve);
    } else {
      chrome.storage.local.set({ [TIMER_KEY]: state }, resolve);
    }
  });
}

// ─── Full data import (for Drive sync) ───────────────────────────────────────

export async function importData(remoteData) {
  // Simple last-write-wins merge at the collection level.
  const local = await getData();
  const localTime = new Date(local.lastModified || 0).getTime();
  const remoteTime = new Date(remoteData.lastModified || 0).getTime();

  // Use whichever was modified more recently.
  if (remoteTime > localTime) {
    await setData(remoteData);
    return remoteData;
  }
  return local;
}
