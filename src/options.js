const limitInput = document.getElementById('limit-input');
const badgeToggle = document.getElementById('badge-toggle');
const redirectToggle = document.getElementById('redirect-toggle');
const subsRedirectToggle = document.getElementById('subs-redirect-toggle');
const hideShortsToggle = document.getElementById('hide-shorts-toggle');
const hideWatchedDefaultToggle = document.getElementById('hide-watched-default-toggle');
const pickupShelfToggle = document.getElementById('pickup-shelf-toggle');
const ghostModeOptions = document.getElementById('ghostModeOptions');

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

const performanceWarning = document.getElementById('performanceWarning');
const welcomeCard = document.getElementById('welcomeCard');
const dismissWelcome = document.getElementById('dismissWelcome');

// Check if this is first-time setup
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

limitInput.oninput = () => {
  const val = parseInt(limitInput.value) || 0;
  if (performanceWarning) performanceWarning.style.display = val > 2000 ? 'block' : 'none';
};

const backupReminderSelect = document.getElementById('backup-reminder-select');

// Load current settings
chrome.storage.local.get({ limit: 500, resumeBadges: true, historyRedirect: true, subsRedirect: true, hideShorts: false, hideWatchedDefault: false, ghostModeActive: false, pickupShelf: true, backupReminderFrequency: 'weekly' }, (data) => {
  limitInput.value = data.limit;
  if (performanceWarning) performanceWarning.style.display = data.limit > 2000 ? 'block' : 'none';
  badgeToggle.checked = data.resumeBadges;
  redirectToggle.checked = data.historyRedirect;
  subsRedirectToggle.checked = data.subsRedirect;
  hideShortsToggle.checked = data.hideShorts;
  hideWatchedDefaultToggle.checked = data.hideWatchedDefault;
  pickupShelfToggle.checked = data.pickupShelf;
  if (ghostModeOptions) {
    ghostModeOptions.checked = Boolean(data.ghostModeActive);
  }
  if (backupReminderSelect) backupReminderSelect.value = data.backupReminderFrequency;
});

if (backupReminderSelect) {
  backupReminderSelect.onchange = () => {
    chrome.storage.local.set({ backupReminderFrequency: backupReminderSelect.value }, () => {
      showToast(`Backup reminder set to ${backupReminderSelect.value}`);
    });
  };
}

// Scroll to export section if navigated via #export hash
if (location.hash === '#export') {
  const exportSection = document.getElementById('export-section');
  if (exportSection) setTimeout(() => exportSection.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
}

// Toggle resume badges
badgeToggle.onchange = () => {
  chrome.storage.local.set({ resumeBadges: badgeToggle.checked }, () => {
    showToast(badgeToggle.checked ? 'Resume badges enabled' : 'Resume badges disabled');
  });
};

// Toggle history redirect
redirectToggle.onchange = () => {
  chrome.storage.local.set({ historyRedirect: redirectToggle.checked }, () => {
    showToast(redirectToggle.checked ? 'History redirect enabled' : 'History redirect disabled');
  });
};

// Toggle subscriptions redirect
subsRedirectToggle.onchange = () => {
  chrome.storage.local.set({ subsRedirect: subsRedirectToggle.checked }, () => {
    showToast(subsRedirectToggle.checked ? 'Subscriptions redirect enabled' : 'Subscriptions redirect disabled');
  });
};

// Toggle hide shorts
hideShortsToggle.onchange = () => {
  chrome.storage.local.set({ hideShorts: hideShortsToggle.checked }, () => {
    showToast(hideShortsToggle.checked ? 'Shorts hidden' : 'Shorts visible');
  });
};

// Toggle hide watched default
hideWatchedDefaultToggle.onchange = () => {
  chrome.storage.local.set({ hideWatchedDefault: hideWatchedDefaultToggle.checked }, () => {
    showToast(hideWatchedDefaultToggle.checked ? 'Watched videos hidden in search by default' : 'Watched videos shown in search');
  });
};

// Toggle pickup shelf
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

// Save limit with pruning confirmation
const pruneModal = document.getElementById('pruneModal');
const pruneModalMessage = document.getElementById('pruneModalMessage');
const pruneCancel = document.getElementById('pruneCancel');
const pruneConfirm = document.getElementById('pruneConfirm');

const validateHistoryLimit = (newLimit) => {
  chrome.storage.local.get({ history: [], limit: 100 }, (data) => {
    const currentCount = data.history.length;
    if (newLimit < currentCount) {
      const diffCount = currentCount - newLimit;
      pruneModalMessage.textContent =
        `Setting a lower limit will permanently delete your oldest ${diffCount} video${diffCount !== 1 ? 's' : ''}. Are you sure?`;
      pruneModal.style.display = 'flex';

      pruneConfirm.onclick = () => {
        pruneModal.style.display = 'none';
        const pruned = data.history
          .slice()
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, newLimit);
        chrome.storage.local.set({ history: pruned, limit: newLimit }, () => {
          showToast(`Limit set to ${newLimit} — ${diffCount} old video${diffCount !== 1 ? 's' : ''} removed`);
        });
      };

      pruneCancel.onclick = () => {
        pruneModal.style.display = 'none';
        limitInput.value = data.limit;
        if (performanceWarning) performanceWarning.style.display = data.limit > 2000 ? 'block' : 'none';
      };
    } else {
      chrome.storage.local.set({ limit: newLimit }, () => {
        showToast(`History limit set to ${newLimit}`);
      });
    }
  });
};

document.getElementById('save-limit').onclick = () => {
  const val = Math.min(Math.max(parseInt(limitInput.value) || 100, 50), 5000);
  limitInput.value = val;
  validateHistoryLimit(val);
};

// Clear all
document.getElementById('clear-btn').onclick = () => {
  if (confirm('Permanently delete your entire local history? This cannot be undone.')) {
    chrome.storage.local.set({ history: [] }, () => {
      showToast('History cleared');
    });
  }
};

// Export history
document.getElementById('export-btn').onclick = () => {
  chrome.storage.local.get({ history: [], limit: 100 }, (data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yt-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    // Reset backup reminder after successful export
    chrome.storage.local.set({ showBackupReminder: false, lastBackupTimestamp: Date.now() });
    showToast('History exported');
  });
};

// Import history
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
      if (!Array.isArray(data.history)) {
        showToast('Invalid file format');
        return;
      }

      const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
      const MAX_TITLE_LEN = 300;
      const maxEntries = Math.min(data.history.length, 5000);

      const validated = data.history.slice(0, maxEntries).filter(v => {
        if (typeof v.id !== 'string' || !VIDEO_ID_RE.test(v.id)) return false;
        if (typeof v.title !== 'string' || v.title.length > MAX_TITLE_LEN) return false;
        if (!Number.isFinite(v.time) || v.time < 0 || v.time > 86400) return false;
        if (!Number.isFinite(v.timestamp) || v.timestamp < 0) return false;
        return true;
      }).map(v => ({
        id: v.id,
        title: v.title,
        time: Math.floor(v.time),
        timestamp: Math.floor(v.timestamp),
        live: v.live === true ? true : undefined
      }));

      const limit = Number.isFinite(data.limit)
        ? Math.min(Math.max(Math.floor(data.limit), 50), 5000)
        : 100;

      chrome.storage.local.set({
        history: validated,
        limit
      }, () => {
        limitInput.value = limit;
        showToast(`Imported ${validated.length} videos`);
      });
    } catch {
      showToast('Failed to parse file');
    }
  };
  reader.readAsText(file);
  importFile.value = '';
};

// Load version from manifest
const manifest = chrome.runtime.getManifest();
document.getElementById('version-number').textContent = manifest.version;

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
