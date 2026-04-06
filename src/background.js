/**
 * YT Local History - Background Service Worker
 */

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!sender.tab) return;

  if (message.type === 'redirect-history') {
    chrome.tabs.update(sender.tab.id, {
      url: chrome.runtime.getURL('history.html')
    });
  }
});
