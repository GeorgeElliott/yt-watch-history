const manifest = chrome.runtime.getManifest();
document.getElementById('version-number').textContent = manifest.version;
