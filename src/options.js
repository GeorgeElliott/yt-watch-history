const limitInput = document.getElementById('limit-input');
const badgeToggle = document.getElementById('badge-toggle');

const showToast = (message) => {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
};

// Load current settings
chrome.storage.local.get({ limit: 50, resumeBadges: true }, (data) => {
  limitInput.value = data.limit;
  badgeToggle.checked = data.resumeBadges;
});

// Toggle resume badges
badgeToggle.onchange = () => {
  chrome.storage.local.set({ resumeBadges: badgeToggle.checked }, () => {
    showToast(badgeToggle.checked ? 'Resume badges enabled' : 'Resume badges disabled');
  });
};

// Save limit
document.getElementById('save-limit').onclick = () => {
  let val = Math.min(Math.max(parseInt(limitInput.value) || 50, 50), 500);
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
  chrome.storage.local.get({ history: [], limit: 50 }, (data) => {
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
      chrome.storage.local.set({
        history: data.history,
        limit: data.limit || 50
      }, () => {
        limitInput.value = data.limit || 50;
        showToast(`Imported ${data.history.length} videos`);
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
