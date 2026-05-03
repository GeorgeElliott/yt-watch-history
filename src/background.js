/**
 * WatchHistory for YouTube™ - Background Service Worker
 */

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!sender.tab) return;

  if (message.type === 'redirect-history') {
    chrome.tabs.update(sender.tab.id, {
      url: chrome.runtime.getURL('history.html')
    });
  }

  if (message.type === 'open-history-tab') {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
  }

  if (message.type === 'open-options-export') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') + '#export' });
  }

  if (message.type === 'dismiss-backup-reminder') {
    chrome.storage.local.set({
      showBackupReminder: false,
      lastBackupTimestamp: Date.now()
    });
  }
});

// ─── Backup Reminder Alarm ───────────────────────────────────

const BACKUP_FREQUENCY_MS = {
  daily: 86400000,
  weekly: 604800000,
  monthly: 2592000000
};

const scheduleBackupAlarm = () => {
  chrome.alarms.get('backup-reminder-check', (existing) => {
    if (!existing) {
      chrome.alarms.create('backup-reminder-check', { periodInMinutes: 1440 });
    }
  });
};

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'backup-reminder-check') return;

  chrome.storage.local.get(
    { backupReminderFrequency: 'weekly', lastBackupTimestamp: 0, showBackupReminder: false },
    (data) => {
      const { backupReminderFrequency, lastBackupTimestamp } = data;
      if (backupReminderFrequency === 'never') {
        return;
      }

      const threshold = BACKUP_FREQUENCY_MS[backupReminderFrequency];
      if (!threshold) {
        return;
      }

      const elapsed = Date.now() - lastBackupTimestamp;
      if (elapsed >= threshold) {
        chrome.storage.local.set({ showBackupReminder: true });
      }
    }
  );
});

// ─── Lifecycle ───────────────────────────────────────────────

const resetGhostModeState = () => {
  chrome.storage.local.set({ ghostModeActive: false });
  chrome.action.setBadgeText({ text: '' });
};

chrome.runtime.onStartup.addListener(() => {
  resetGhostModeState();
  scheduleBackupAlarm();
});

chrome.runtime.onInstalled.addListener((details) => {
  resetGhostModeState();
  scheduleBackupAlarm();

  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.storage.local.set({ firstTimeSetupComplete: false, lastBackupTimestamp: Date.now() });
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
  }
});
