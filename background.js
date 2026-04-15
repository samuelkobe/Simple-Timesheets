/**
 * background.js — MV3 service worker (ES module).
 *
 * Responsibilities:
 *  - Keep an alarm ticking while the timer is running (badge updates)
 *  - Trigger Drive sync every 5 minutes while active
 *  - Respond to messages from the popup
 */

import { getData, updateSettings } from './js/storage.js';
import { syncWithDrive, getAuthToken } from './js/drive.js';

const TICK_ALARM = 'timer_tick';
const SYNC_ALARM = 'drive_sync';

// ─── Alarms ───────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === TICK_ALARM) await updateBadge();
  if (alarm.name === SYNC_ALARM) await triggerSync();
});

async function startAlarms() {
  // Alarms fire at minimum ~1 minute in MV3; use for badge + sync
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
}

async function stopAlarms() {
  await chrome.alarms.clearAll();
  chrome.action.setBadgeText({ text: '' });
}

// ─── Badge ────────────────────────────────────────────────────────────────────

async function updateBadge() {
  const timer = await getTimerState();
  if (!timer?.startTime) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const elapsedSec = Math.floor((Date.now() - timer.startTime) / 1000);
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const label = h > 0 ? `${h}h${m}m` : `${m}m`;
  chrome.action.setBadgeText({ text: label });
  chrome.action.setBadgeBackgroundColor({ color: '#16A34A' });
}

// ─── Drive sync ───────────────────────────────────────────────────────────────

async function triggerSync() {
  const token = await getAuthToken(false);
  if (!token) return;

  try {
    const data = await getData();
    const { success, fileId } = await syncWithDrive(data, data.settings?.driveFileId);
    if (success && fileId && fileId !== data.settings?.driveFileId) {
      await updateSettings({ driveFileId: fileId });
    }
  } catch (err) {
    console.warn('Background sync failed:', err);
  }
}

// ─── Timer state helper ───────────────────────────────────────────────────────

function getTimerState() {
  return new Promise((resolve) => {
    chrome.storage.local.get('timesheets_timer', (result) => {
      resolve(result['timesheets_timer'] || null);
    });
  });
}

// ─── Messages from popup ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'TIMER_STARTED':
        await startAlarms();
        sendResponse({ ok: true });
        break;
      case 'TIMER_STOPPED':
        await stopAlarms();
        sendResponse({ ok: true });
        break;
      case 'SYNC_NOW':
        await triggerSync();
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ ok: false, error: 'Unknown message' });
    }
  })();
  return true; // keep channel open for async
});

// ─── Install / startup ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});

chrome.runtime.onStartup.addListener(async () => {
  const timer = await getTimerState();
  if (timer?.startTime) await startAlarms();
});
