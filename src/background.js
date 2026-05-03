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
});

const resetGhostModeState = () => {
  chrome.storage.local.set({ ghostModeActive: false });
  chrome.action.setBadgeText({ text: '' });
};

chrome.runtime.onStartup.addListener(() => {
  resetGhostModeState();
});

chrome.runtime.onInstalled.addListener(() => {
  resetGhostModeState();
});
