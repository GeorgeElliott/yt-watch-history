const limitInput = document.getElementById('limit-input');
const badgeToggle = document.getElementById('badge-toggle');
const redirectToggle = document.getElementById('redirect-toggle');
const subsRedirectToggle = document.getElementById('subs-redirect-toggle');
const hideShortsToggle = document.getElementById('hide-shorts-toggle');
const hideWatchedDefaultToggle = document.getElementById('hide-watched-default-toggle');
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

// Load current settings
chrome.storage.local.get({ limit: 100, resumeBadges: true, historyRedirect: false, subsRedirect: false, hideShorts: false, hideWatchedDefault: false, ghostModeActive: false }, (data) => {
  limitInput.value = data.limit;
  badgeToggle.checked = data.resumeBadges;
  redirectToggle.checked = data.historyRedirect;
  subsRedirectToggle.checked = data.subsRedirect;
  hideShortsToggle.checked = data.hideShorts;
  hideWatchedDefaultToggle.checked = data.hideWatchedDefault;
  if (ghostModeOptions) {
    ghostModeOptions.checked = Boolean(data.ghostModeActive);
  }
});

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

// Save limit
document.getElementById('save-limit').onclick = () => {
  let val = Math.min(Math.max(parseInt(limitInput.value) || 100, 50), 1000);
  limitInput.value = val;
  chrome.storage.local.set({ limit: val }, () => {
    showToast(`History limit set to ${val}`);
  });
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
      const maxEntries = Math.min(data.history.length, 500);

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
        ? Math.min(Math.max(Math.floor(data.limit), 50), 1000)
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
