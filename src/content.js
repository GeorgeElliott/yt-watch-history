/**
 * YT Local History - Content Script
 */

const resumeVideo = () => {
  const video = document.querySelector('video');
  const videoId = new URLSearchParams(window.location.search).get('v');

  if (video && videoId) {
    chrome.storage.local.get({ history: [] }, (data) => {
      const savedVideo = data.history.find(item => item.id === videoId);
      // Auto-jump if we are at the very start of the video
      if (savedVideo && video.currentTime < 5) {
        video.currentTime = savedVideo.time;
        console.log(`[YT Local History] Resumed at ${savedVideo.time}s`);
      }
    });
  }
};

const saveProgress = () => {
  const video = document.querySelector('video');
  const videoId = new URLSearchParams(window.location.search).get('v');

  if (video && videoId && !video.paused) {
    chrome.storage.local.get({ history: [], limit: 50 }, (data) => {
      // Clean title: remove notification counts like (1) and the " - YouTube" suffix
      const cleanTitle = document.title
        .replace(/^\(\d+\)\s/, '')
        .replace(' - YouTube', '');

      let history = data.history.filter(item => item.id !== videoId);
      
      history.unshift({
        id: videoId,
        title: cleanTitle,
        time: Math.floor(video.currentTime),
        timestamp: Date.now()
      });

      // Trim history based on user-defined limit
      if (history.length > data.limit) {
        history = history.slice(0, data.limit);
      }

      chrome.storage.local.set({ history });
    });
  }
};

// Handle YouTube's Single Page App navigation
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(resumeVideo, 1000);
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// Initial triggers
setTimeout(resumeVideo, 1500); 
setInterval(saveProgress, 10000);