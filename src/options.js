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
  }
);

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
  db_getAllVideos()
    .then((videos) => {
      const payload = {
        exportDate: new Date().toISOString(),
        count: videos.length,
        history: videos // kept for backward compatibility
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `yt-history-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Reset backup reminder after export
      chrome.storage.local.set({ showBackupReminder: false, lastBackupTimestamp: Date.now() });
      showToast(`Exported ${videos.length.toLocaleString()} videos`);
    })
    .catch(() => showToast('Export failed'));
};

// Import: accepts JSON exports. Validates and accepts both videoId and legacy id format.
const importFile = document.getElementById('import-file');

document.getElementById('import-btn').onclick = () => {
  importFile.click();
};

importFile.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);

      // Accept both { history: [...] } wrapper and a bare array.
      const rawHistory = Array.isArray(data.history)
        ? data.history
        : (Array.isArray(data) ? data : null);

      if (!rawHistory) {
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
          live:       v.live === true ? true : undefined,
          timestamp:  Math.floor(v.timestamp)
        }));

      if (validated.length === 0) {
        showToast('No valid videos found in file');
        return;
      }

      // Import in one transaction
      db_bulkImport(validated)
        .then((count) => {
          // Update the cached count
          chrome.storage.local.set({ videoCount: count });
          showToast(`Imported ${count.toLocaleString()} videos`);
        })
        .catch(() => showToast('Import failed'));

    } catch {
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
