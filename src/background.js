/**
 * Background service worker. Handles:
 *   - Message routing (navigation, banner dismissals)
 *   - IndexedDB proxy for content scripts
 *   - Hourly count sync (writes videoCount to storage for popup)
 *   - Backup reminder alarm
 *   - Auto-migration of old local storage data on startup
 */

'use strict';

// Load db.js helpers. Chrome: via importScripts. Firefox: already loaded via manifest.
if (typeof importScripts === 'function') {
  importScripts('db.js');
}

// Message handlers

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only accept messages from extension tabs, not from web pages
  if (!sender.tab) return;

  // Navigation
  if (message.type === 'redirect-history') {
    chrome.tabs.update(sender.tab.id, {
      url: chrome.runtime.getURL('history.html')
    });
    return;
  }

  if (message.type === 'open-history-tab') {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
    return;
  }

  if (message.type === 'open-options-export') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('options.html') + '#export'
    });
    return;
  }

  if (message.type === 'dismiss-backup-reminder') {
    chrome.storage.local.set({ showBackupReminder: false });
    return;
  }

  // IDB proxy for content scripts
  // Each handler mirrors a db.js function. Handlers that need to return data
  // must call sendResponse({ ... }) inside a .then() and return true.

  if (message.type === 'idb-save-video') {
    db_saveVideo(message.video).catch(console.error);
    return;
  }

  if (message.type === 'idb-record-watch-event') {
    db_recordWatchEvent(message.watchEvent).catch(console.error);
    return;
  }

  if (message.type === 'idb-record-watch-session') {
    db_recordWatchSession(message.watchSession).catch(console.error);
    return;
  }

  if (message.type === 'idb-get-video') {
    db_getVideoById(message.videoId)
      .then((video) => sendResponse({ video }))
      .catch(() => sendResponse({ video: null }));
    return true;
  }

  if (message.type === 'idb-get-recent-videos') {
    const limit = typeof message.limit === 'number' ? message.limit : 15;
    const offset = typeof message.offset === 'number' ? message.offset : 0;
    db_getVideos(limit, offset)
      .then((videos) => sendResponse({ videos }))
      .catch(() => sendResponse({ videos: [] }));
    return true;
  }

  if (message.type === 'idb-count-videos-since') {
    const timestamp = typeof message.timestamp === 'number' ? message.timestamp : 0;
    db_countVideosSince(timestamp)
      .then((count) => sendResponse({ count }))
      .catch(() => sendResponse({ count: 0 }));
    return true;
  }

  if (message.type === 'idb-get-all-videos') {
    db_getAllVideos()
      .then((videos) => sendResponse({ videos }))
      .catch(() => sendResponse({ videos: [] }));
    return true;
  }

  if (message.type === 'idb-delete-video') {
    db_deleteVideo(message.videoId).catch(console.error);
    return;
  }
});

// Alarm scheduling

const scheduleBackupAlarm = () => {
  chrome.alarms.get('backup-reminder-check', (existing) => {
    if (!existing) {
      chrome.alarms.create('backup-reminder-check', { periodInMinutes: 1440 });
    }
  });
};

const scheduleCountAlarm = () => {
  chrome.alarms.get('video-count-sync', (existing) => {
    if (!existing) {
      chrome.alarms.create('video-count-sync', { periodInMinutes: 60 });
    }
  });
};

// Backup frequency thresholds (in milliseconds)
const BACKUP_FREQUENCY_MS = {
  daily:   86400000,
  weekly:  604800000,
  monthly: 2592000000
};

// Alarm dispatcher

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'backup-reminder-check') {
    chrome.storage.local.get(
      { backupReminderFrequency: 'weekly', lastBackupTimestamp: 0 },
      (data) => {
        const { backupReminderFrequency, lastBackupTimestamp } = data;
        if (backupReminderFrequency === 'never') return;

        const threshold = BACKUP_FREQUENCY_MS[backupReminderFrequency];
        if (!threshold) return;

        if (Date.now() - lastBackupTimestamp >= threshold) {
          chrome.storage.local.set({ showBackupReminder: true });
        }
      }
    );
    return;
  }

  if (alarm.name === 'video-count-sync') {
    refreshVideoCount();
    return;
  }
});

// Video count refresh

const refreshVideoCount = () => {
  db_countVideos()
    .then((count) => chrome.storage.local.set({ videoCount: count }))
    .catch(console.error);
};

// Legacy migration (storage.local → IndexedDB)

const migrateIfNeeded = () => {
  db_countVideos()
    .then((count) => {
      // IDB already has records — nothing to migrate
      if (count > 0) return;

      // IDB is empty: check for legacy history in storage
      chrome.storage.local.get({ history: [] }, (data) => {
        const legacy = data.history;
        if (!Array.isArray(legacy) || legacy.length === 0) return;

        // Remap legacy format: id → videoId (the IDB keyPath)
        const migrated = legacy.map((v) => ({
          videoId:    v.id,
          title:      typeof v.title === 'string' ? v.title : '',
          channel:    typeof v.channel === 'string' ? v.channel : '',
          channelUrl: typeof v.channelUrl === 'string' ? v.channelUrl : '',
          time:       typeof v.time === 'number' ? v.time : 0,
          duration:   typeof v.duration === 'number' ? v.duration : 0,
          watched:    v.watched === true,
          // Backwards compatibility: legacy records never tracked watch
          // counts. Treat an already-watched video as one prior watch.
          watchCount: typeof v.watchCount === 'number' ? v.watchCount : (v.watched === true ? 1 : 0),
          live:       v.live === true ? true : undefined,
          timestamp:  typeof v.timestamp === 'number' ? v.timestamp : Date.now()
        }));

        db_bulkImport(migrated)
          .then((n) => {
            console.log(`[YTWH] Migrated ${n} video(s) to IndexedDB.`);
            chrome.storage.local.set({ videoCount: n });
          })
          .catch(console.error);
      });
    })
    .catch(console.error);
};

// Ghost mode (session-only, cleared on restart)

const resetGhostModeState = () => {
  chrome.storage.local.set({ ghostModeActive: false });
};

// Startup

chrome.runtime.onInstalled.addListener(() => {
  resetGhostModeState();
  scheduleBackupAlarm();
  scheduleCountAlarm();
  migrateIfNeeded();
  refreshVideoCount();
});

chrome.runtime.onStartup.addListener(() => {
  resetGhostModeState();
  scheduleBackupAlarm();
  scheduleCountAlarm();
  migrateIfNeeded();
  refreshVideoCount();
});
