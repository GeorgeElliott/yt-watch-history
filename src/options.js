/**
 * Options page. Handles settings, import/export, and data management.
 * Requires db.js to be loaded first.
 */

'use strict';

// DOM refs
const badgeToggle              = document.getElementById('badge-toggle');
const redirectToggle           = document.getElementById('redirect-toggle');
const subsRedirectToggle       = document.getElementById('subs-redirect-toggle');
const hideShortsToggle         = document.getElementById('hide-shorts-toggle');
const hideWatchedDefaultToggle = document.getElementById('hide-watched-default-toggle');
const pickupShelfToggle        = document.getElementById('pickup-shelf-toggle');
const ghostModeOptions         = document.getElementById('ghostModeOptions');
const watchedThresholdInput    = document.getElementById('watched-threshold-input');
const backgroundPlaybackToggle = document.getElementById('background-playback-toggle');
const importStatusMenu         = document.getElementById('import-status-menu');
const importStatus             = document.getElementById('import-status');
const operationStatusTitle     = document.getElementById('operation-status-title');
const operationProgress        = document.getElementById('operation-progress');
const operationLog             = document.getElementById('operation-log');
const exportButton             = document.getElementById('export-btn');
const importButton             = document.getElementById('import-btn');
const localDataNotice          = document.getElementById('local-data-notice');
const keepCollapsedLink        = document.getElementById('keep-collapsed-link');
let keepLocalNoticeCollapsed   = false;
let operationInProgress        = false;

// Helpers

const setGhostModeBadge = (enabled) => {
  if (enabled) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
    return;
  }
  chrome.action.setBadgeText({ text: '' });
};

const showToast = (message) => {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
};

const setOperationStatus = (message, progress = null, logMessage = message) => {
  if (importStatus) importStatus.textContent = message;
  if (operationProgress && progress !== null) operationProgress.value = progress;
  if (operationLog && logMessage) {
    const item = document.createElement('li');
    item.textContent = `${new Date().toLocaleTimeString()} - ${logMessage}`;
    operationLog.prepend(item);
    while (operationLog.children.length > 8) operationLog.lastElementChild.remove();
  }
  console.log(`[YTWH] ${message}`);
  if (importStatusMenu) {
    importStatusMenu.hidden = false;
    importStatusMenu.open = true;
  }
};

const setImportStatus = (message, progress = null) => {
  setOperationStatus(message, progress);
};

const startOperation = (title) => {
  operationInProgress = true;
  if (exportButton) exportButton.disabled = true;
  if (importButton) importButton.disabled = true;
  if (operationStatusTitle) operationStatusTitle.textContent = title;
  if (operationProgress) operationProgress.value = 0;
  if (operationLog) operationLog.replaceChildren();
  setOperationStatus('Starting...', 0, `${title} started`);
};

const failOperation = (message) => {
  setOperationStatus(message, operationProgress ? operationProgress.value : null, message);
  operationInProgress = false;
  if (exportButton) exportButton.disabled = false;
  if (importButton) importButton.disabled = false;
};

const completeOperation = (message) => {
  setOperationStatus(message, 100, message);
  operationInProgress = false;
  if (exportButton) exportButton.disabled = false;
  if (importButton) importButton.disabled = false;
};

const downloadBackup = ({ videos, watchEvents, watchSessions }) => {
  const payload = {
    exportDate: new Date().toISOString(),
    dbVersion: db_getVersion(),
    count: videos.length,
    history: videos,
    watchEvents,
    watchSessions
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `yt-history-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);

  chrome.storage.local.set({ showBackupReminder: false, lastBackupTimestamp: Date.now() });
  completeOperation(`Export complete: ${videos.length.toLocaleString()} videos saved.`);
  showToast(`Exported ${videos.length.toLocaleString()} videos`);
};

db_getStoredVersion().then((storedVersion) => {
  if (!storedVersion || storedVersion >= db_getVersion()) return;
  if (!confirm('A database update is available. Would you like to take a backup before the update?')) return;

  db_getBackupData()
    .then(downloadBackup)
    .catch(() => showToast('Backup failed'));
}).catch(() => {
  // Version discovery is best-effort; normal database opening still proceeds.
});

// First-time setup
const welcomeCard    = document.getElementById('welcomeCard');
const dismissWelcome = document.getElementById('dismissWelcome');

chrome.storage.local.get({ firstTimeSetupComplete: false }, (data) => {
  if (!data.firstTimeSetupComplete && welcomeCard) {
    welcomeCard.style.display = 'block';
  }
});

if (dismissWelcome) {
  dismissWelcome.onclick = () => {
    chrome.storage.local.set({ firstTimeSetupComplete: true });
    if (welcomeCard) welcomeCard.style.display = 'none';
  };
}

// Backup reminder
const backupReminderSelect = document.getElementById('backup-reminder-select');

// Load settings
chrome.storage.local.get(
  {
    resumeBadges:            true,
    historyRedirect:         true,
    subsRedirect:            true,
    hideShorts:              false,
    hideWatchedDefault:      false,
    ghostModeActive:         false,
    pickupShelf:             true,
    backupReminderFrequency: 'weekly',
    watchedThreshold: 95,
    countBackgroundPlayback: false,
    keepLocalNoticeCollapsed: false,
  },
  (data) => {
    badgeToggle.checked              = data.resumeBadges;
    redirectToggle.checked           = data.historyRedirect;
    subsRedirectToggle.checked       = data.subsRedirect;
    hideShortsToggle.checked         = data.hideShorts;
    hideWatchedDefaultToggle.checked = data.hideWatchedDefault;
    pickupShelfToggle.checked        = data.pickupShelf;
    if (ghostModeOptions) {
      ghostModeOptions.checked = Boolean(data.ghostModeActive);
    }
    if (backupReminderSelect) {
      backupReminderSelect.value = data.backupReminderFrequency;
    }
    if (watchedThresholdInput) {
      watchedThresholdInput.value = data.watchedThreshold;
    }
    if (backgroundPlaybackToggle) {
      backgroundPlaybackToggle.checked = Boolean(data.countBackgroundPlayback);
    }
    if (localDataNotice) {
      keepLocalNoticeCollapsed = Boolean(data.keepLocalNoticeCollapsed);
      localDataNotice.open = !keepLocalNoticeCollapsed;
    }
    if (keepCollapsedLink) {
      keepCollapsedLink.textContent = keepLocalNoticeCollapsed ? 'Keep uncollapsed' : 'Keep collapsed';
    }
  }
);

if (keepCollapsedLink) {
  keepCollapsedLink.onclick = () => {
    keepLocalNoticeCollapsed = !keepLocalNoticeCollapsed;
    chrome.storage.local.set({ keepLocalNoticeCollapsed }, () => {
      keepCollapsedLink.textContent = keepLocalNoticeCollapsed ? 'Keep uncollapsed' : 'Keep collapsed';
      if (localDataNotice) localDataNotice.open = !keepLocalNoticeCollapsed;
    });
  };
}

// Scroll to export section if navigated via #export hash.
if (location.hash === '#export') {
  const exportSection = document.getElementById('export-section');
  if (exportSection) {
    setTimeout(() => exportSection.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  }
}

// Backup frequency
if (backupReminderSelect) {
  backupReminderSelect.onchange = () => {
    chrome.storage.local.set({ backupReminderFrequency: backupReminderSelect.value }, () => {
      showToast(`Backup reminder set to ${backupReminderSelect.value}`);
    });
  };
}

// Toggle handlers

badgeToggle.onchange = () => {
  chrome.storage.local.set({ resumeBadges: badgeToggle.checked }, () => {
    showToast(badgeToggle.checked ? 'Resume badges enabled' : 'Resume badges disabled');
  });
};

redirectToggle.onchange = () => {
  chrome.storage.local.set({ historyRedirect: redirectToggle.checked }, () => {
    showToast(redirectToggle.checked ? 'History redirect enabled' : 'History redirect disabled');
  });
};

subsRedirectToggle.onchange = () => {
  chrome.storage.local.set({ subsRedirect: subsRedirectToggle.checked }, () => {
    showToast(subsRedirectToggle.checked ? 'Subscriptions redirect enabled' : 'Subscriptions redirect disabled');
  });
};

hideShortsToggle.onchange = () => {
  chrome.storage.local.set({ hideShorts: hideShortsToggle.checked }, () => {
    showToast(hideShortsToggle.checked ? 'Shorts hidden' : 'Shorts visible');
  });
};

hideWatchedDefaultToggle.onchange = () => {
  chrome.storage.local.set({ hideWatchedDefault: hideWatchedDefaultToggle.checked }, () => {
    showToast(
      hideWatchedDefaultToggle.checked
        ? 'Watched videos hidden in search by default'
        : 'Watched videos shown in search'
    );
  });
};

pickupShelfToggle.onchange = () => {
  chrome.storage.local.set({ pickupShelf: pickupShelfToggle.checked }, () => {
    showToast(pickupShelfToggle.checked ? 'Subscriptions pickup shelf enabled' : 'Subscriptions pickup shelf disabled');
  });
};

if (ghostModeOptions) {
  ghostModeOptions.onchange = () => {
    const enabled = ghostModeOptions.checked;
    chrome.storage.local.set({ ghostModeActive: enabled }, () => {
      setGhostModeBadge(enabled);
      showToast(enabled ? 'Ghost Mode enabled' : 'Ghost Mode disabled');
    });
  };
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.ghostModeActive || !ghostModeOptions) return;
  ghostModeOptions.checked = Boolean(changes.ghostModeActive.newValue);
});

if (watchedThresholdInput) {
  watchedThresholdInput.onchange = () => {
    let value = parseInt(watchedThresholdInput.value, 10);
    if (isNaN(value) || value < 1)  value = 1;
    if (value > 100)                value = 100;
    watchedThresholdInput.value = value; // clamp display too
    chrome.storage.local.set({ watchedThreshold: value }, () => {
      showToast(`Watched threshold set to ${value}%`);
    });
  };
}

if (backgroundPlaybackToggle) {
  backgroundPlaybackToggle.onchange = () => {
    chrome.storage.local.set({ countBackgroundPlayback: backgroundPlaybackToggle.checked }, () => {
      showToast(
        backgroundPlaybackToggle.checked
          ? 'Background YouTube playback enabled'
          : 'Background YouTube playback disabled'
      );
    });
  };
}

// Clear all
document.getElementById('clear-btn').onclick = () => {
  if (confirm('Permanently delete your entire local history? This cannot be undone.')) {
    db_clearAllVideos()
      .then(() => {
        // Keep the cached count in sync so the popup stat is accurate.
        chrome.storage.local.set({ videoCount: 0 });
        showToast('History cleared');
      })
      .catch(() => showToast('Failed to clear history'));
  }
};

// Export: downloads all videos as JSON
document.getElementById('export-btn').onclick = () => {
  if (operationInProgress) return;
  startOperation('Export status');
  setOperationStatus('Reading videos...', 20);
  db_getAllVideos()
    .then((videos) => {
      setOperationStatus('Reading watch events...', 45);
      return db_getAllWatchEvents().then((watchEvents) => ({ videos, watchEvents }));
    })
    .then(({ videos, watchEvents }) => {
      setOperationStatus('Reading watch sessions...', 65);
      return db_getAllWatchSessions().then((watchSessions) => ({ videos, watchEvents, watchSessions }));
    })
    .then((backup) => {
      setOperationStatus('Creating backup file...', 85);
      downloadBackup(backup);
    })
    .catch((error) => {
      console.error('[YTWH] Export failed:', error);
      failOperation(`Export failed: ${error.message || 'Unknown database error'}`);
      showToast('Export failed');
    });
};

// Import: accepts JSON exports. Validates and accepts both videoId and legacy id format.
const importFile = document.getElementById('import-file');

document.getElementById('import-btn').onclick = () => {
  if (operationInProgress) return;
  importFile.click();
};

importFile.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  startOperation('Import status');
  setImportStatus(`Reading ${file.name}...`, 5);

  const reader = new FileReader();
  reader.onerror = () => {
    failOperation(`Import failed while reading ${file.name}.`);
    showToast('Import failed');
  };
  reader.onprogress = (event) => {
    if (event.lengthComputable) {
      setImportStatus(`Reading ${file.name}...`, Math.max(5, Math.round((event.loaded / event.total) * 20)));
    }
  };
  reader.onload = (event) => {
    try {
      setImportStatus('Validating backup data...', 35);
      const data = JSON.parse(event.target.result);

      // Accept both { history: [...] } wrapper and a bare array.
      const rawHistory = Array.isArray(data.history)
        ? data.history
        : (Array.isArray(data) ? data : null);

      if (!rawHistory) {
        failOperation('Import failed: invalid file format.');
        showToast('Invalid file format');
        return;
      }

      // Validate fields (matching content.js constraints)
      const VIDEO_ID_RE   = /^[a-zA-Z0-9_-]{11}$/;
      const MAX_TITLE_LEN = 300;

      const validated = rawHistory
        .filter((v) => {
          // Accept both new format (videoId) and legacy format (id).
          const vid = typeof v.videoId === 'string' ? v.videoId : v.id;
          if (typeof vid !== 'string' || !VIDEO_ID_RE.test(vid)) return false;
          if (typeof v.title !== 'string' || v.title.length > MAX_TITLE_LEN) return false;
          if (!Number.isFinite(v.time) || v.time < 0 || v.time > 86400) return false;
          if (!Number.isFinite(v.timestamp) || v.timestamp < 0) return false;
          return true;
        })
        .map((v) => ({
          // Normalize to videoId field
          videoId: typeof v.videoId === 'string' ? v.videoId : v.id,
          title:      v.title,
          channel:    typeof v.channel    === 'string' ? v.channel    : '',
          channelUrl: typeof v.channelUrl === 'string' ? v.channelUrl : '',
          time:       Math.floor(v.time),
          duration:   Number.isFinite(v.duration) ? Math.floor(v.duration) : 0,
          watched:    v.watched === true,
          // Backwards compatibility: older exports never tracked watch
          // counts. Treat an already-watched video as one prior watch.
          watchCount: typeof v.watchCount === 'number' ? v.watchCount : (v.watched === true ? 1 : 0),
          live:       v.live === true ? true : undefined,
          liveReplay: v.liveReplay === true ? true : undefined,
          timestamp:  Math.floor(v.timestamp)
        }));

      const importedVideoIds = new Set(validated.map((video) => video.videoId));
      const importedSessions = Array.isArray(data.watchSessions)
        ? data.watchSessions
          .filter((session) =>
            importedVideoIds.has(session.videoId) &&
            Number.isFinite(session.watchedAt) &&
            session.watchedAt >= 0 &&
            Number.isFinite(session.seconds) &&
            session.seconds > 0 &&
            session.seconds <= 3600)
          .map((session) => ({
            videoId: session.videoId,
            watchedAt: Math.floor(session.watchedAt),
            seconds: Math.floor(session.seconds),
            streamType: ['normal', 'live', 'liveReplay'].includes(session.streamType)
              ? session.streamType
              : 'normal'
          }))
        : [];

      if (validated.length === 0) {
        failOperation('Import failed: no valid videos found.');
        showToast('No valid videos found in file');
        return;
      }

      const importedEventsFromBackup = Array.isArray(data.watchEvents)
        ? data.watchEvents
          .filter((watchEvent) =>
            importedVideoIds.has(watchEvent.videoId) &&
            Number.isFinite(watchEvent.watchedAt) &&
            watchEvent.watchedAt >= 0)
          .map((watchEvent) => ({
            videoId: watchEvent.videoId,
            watchedAt: Math.floor(watchEvent.watchedAt),
            ...(Number.isFinite(watchEvent.watchDurationSeconds)
              ? { watchDurationSeconds: watchEvent.watchDurationSeconds }
              : {})
          }))
        : [];
      const importedEvents = importedEventsFromBackup.length > 0
        ? importedEventsFromBackup
        : validated
          .filter((video) => video.watchCount > 0 || video.watched === true)
          .flatMap((video) => Array.from({
            length: Math.max(1, Math.floor(video.watchCount))
          }, () => ({
            videoId: video.videoId,
            watchedAt: video.timestamp
          })));

      // Replace the database and import videos and watch events at the
      // current extension DB version. The backup version is informational.
      setImportStatus(`Replacing database with ${validated.length.toLocaleString()} videos...`, 60);
      db_replaceDatabase(validated, importedEvents, importedSessions, ({ phase, completed, total, record }) => {
        const phaseLabels = {
          videos: 'videos',
          events: 'watch events',
          sessions: 'watch sessions'
        };
        const label = phaseLabels[phase] || phase;
        const progress = phase === 'videos'
          ? 60 + Math.round((completed / Math.max(1, total)) * 12)
          : phase === 'events'
            ? 72 + Math.round((completed / Math.max(1, total)) * 12)
            : 84 + Math.round((completed / Math.max(1, total)) * 11);
        const identifier = record.videoId || record.title || '';
        setOperationStatus(`Importing ${label} ${completed.toLocaleString()} of ${total.toLocaleString()}...`, progress,
          `Imported ${completed}/${total} ${label}: ${identifier}`);
      })
        .then((count) => {
          completeOperation(`Import complete: ${count.toLocaleString()} videos restored.`);
          // Update the cached count
          chrome.storage.local.set({ videoCount: count });
          showToast(`Imported ${count.toLocaleString()} videos`);
        })
        .catch((error) => {
          console.error('[YTWH] Import failed:', error);
          failOperation(`Import failed: ${error.message || 'Unknown database error'}`);
          showToast('Import failed');
        });

    } catch {
      failOperation('Import failed: invalid JSON or backup format.');
      showToast('Failed to parse file');
    }
  };

  reader.readAsText(file);
  // Reset input for re-import
  importFile.value = '';
};

// Version
const manifest = chrome.runtime.getManifest();
document.getElementById('version-number').textContent = manifest.version;

// Theme sync
const applyStoredTheme = () => {
  chrome.storage.local.get({ youtubeTheme: '' }, (data) => {
    if (data.youtubeTheme) document.documentElement.dataset.theme = data.youtubeTheme;
  });
};
applyStoredTheme();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.youtubeTheme) {
    document.documentElement.dataset.theme = changes.youtubeTheme.newValue;
  }
});
