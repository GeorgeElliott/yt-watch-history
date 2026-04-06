/**
 * YT Local History - Content Script
 */

const DEBUG = false;
const log = (...args) => { if (DEBUG) console.log('[YT Local History]', ...args); };

const isWatchPage = () => location.pathname === '/watch';

const isLiveStream = () => {
  const badge = document.querySelector('.ytp-live-badge');
  return badge != null && getComputedStyle(badge).display !== 'none';
};

// ─── Resume & Save (watch pages only) ───────────────────────

const resumeVideo = () => {
  if (!isWatchPage()) return;

  const video = document.querySelector('video');
  const videoId = new URLSearchParams(window.location.search).get('v');

  if (video && videoId) {
    // If this is a livestream, jump to the live edge
    if (isLiveStream()) {
      video.currentTime = video.duration;
      log('Livestream detected — jumped to live');
      return;
    }

    chrome.storage.local.get({ history: [] }, (data) => {
      const savedVideo = data.history.find(item => item.id === videoId);
      // Auto-jump if we are at the very start of the video
      if (savedVideo && video.currentTime < 5) {
        video.currentTime = savedVideo.time;
        log(`Resumed at ${savedVideo.time}s`);
      }
    });
  }
};

const saveProgress = () => {
  if (!isWatchPage()) return;

  const video = document.querySelector('video');
  const videoId = new URLSearchParams(window.location.search).get('v');

  if (video && videoId && !video.paused && !document.hidden) {
    const isLive = isLiveStream();

    chrome.storage.local.get({ history: [], limit: 50 }, (data) => {
      // Clean title: remove notification counts like (1) and the " - YouTube" suffix
      const cleanTitle = document.title
        .replace(/^\(\d+\)\s/, '')
        .replace(' - YouTube', '');

      let history = data.history.filter(item => item.id !== videoId);
      
      history.unshift({
        id: videoId,
        title: cleanTitle,
        time: isLive ? 0 : Math.floor(video.currentTime),
        live: isLive || undefined,
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

// ─── Resume Badges (all pages) ──────────────────────────────

const BADGE_ATTR = 'data-ytwh-badge';

const injectBadgeStyles = () => {
  if (document.getElementById('ytwh-badge-css')) return;
  const style = document.createElement('style');
  style.id = 'ytwh-badge-css';
  style.textContent = `
    .ytwh-resume-badge {
      position: absolute;
      bottom: 4px;
      left: 4px;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      font-size: 11px;
      font-weight: 500;
      padding: 2px 6px;
      border-radius: 3px;
      z-index: 100;
      pointer-events: none;
      font-family: 'Roboto', Arial, sans-serif;
      line-height: 1.3;
    }
  `;
  document.head.appendChild(style);
};

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
};

const tagThumbnails = () => {
  chrome.storage.local.get({ history: [], resumeBadges: true }, (data) => {
    if (!data.resumeBadges) return;

    const historyMap = new Map(data.history.map(v => [v.id, v]));

    // Target video renderer elements — one per video, covers all page layouts
    const renderers = document.querySelectorAll([
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-reel-item-renderer'
    ].join(', '));

    renderers.forEach(renderer => {
      if (renderer.hasAttribute(BADGE_ATTR)) return;
      renderer.setAttribute(BADGE_ATTR, '');

      // Find the first watch link to extract the video ID
      const link = renderer.querySelector('a[href*="/watch"]');
      if (!link) return;

      try {
        const url = new URL(link.getAttribute('href'), location.origin);
        const videoId = url.searchParams.get('v');
        if (!videoId) return;

        const saved = historyMap.get(videoId);
        if (!saved || saved.time < 5) return;

        // Place badge on the thumbnail element specifically
        // Prefer the <a> wrapper for new lockup layout since custom elements may not create a box
        const thumbnail = renderer.querySelector(
          '#thumbnail, ytd-thumbnail, a.yt-lockup-view-model__content-image'
        );
        if (!thumbnail) return;

        const style = getComputedStyle(thumbnail);
        if (style.position === 'static') thumbnail.style.position = 'relative';
        if (style.display === 'contents' || style.display === 'inline') thumbnail.style.display = 'block';

        const badge = document.createElement('span');
        badge.className = 'ytwh-resume-badge';
        badge.textContent = `Resume ${formatTime(saved.time)}`;
        thumbnail.appendChild(badge);
      } catch { /* ignore malformed hrefs */ }
    });
  });
};

// ─── Observers & Timers ─────────────────────────────────────

let badgeTimer = null;
const debouncedTagThumbnails = () => {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(tagThumbnails, 500);
};

let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(resumeVideo, 1000);
  }
  debouncedTagThumbnails();
});
observer.observe(document.body, { childList: true, subtree: true });

// Initial triggers
injectBadgeStyles();
setTimeout(resumeVideo, 1500);
setInterval(saveProgress, 10000);
setTimeout(tagThumbnails, 2000);