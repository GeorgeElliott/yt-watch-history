/**
 * WatchHistory for YouTube™ - Content Script
 */

const DEBUG = false;
const log = (...args) => { if (DEBUG) console.log('[WatchHistory for YouTube]', ...args); };

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

const getChannelName = () => {
  // Target the video owner's channel link specifically
  // On watch pages, this is in the info section near the title
  let channelLink = document.querySelector(
    'ytd-channel-name a, ' +
    '#channel-name a, ' +
    'a[href*="/@"][class*="channel"], ' +
    'a[href*="/channel/"][class*="channel"]'
  );
  
  if (channelLink) {
    const text = channelLink.textContent.trim()
      || channelLink.getAttribute('title')
      || channelLink.getAttribute('aria-label');
    if (text) return text;
  }
  
  // Fallback: look for channel name in structured data
  const channelMeta = document.querySelector('ytd-channel-name');
  if (channelMeta) {
    const text = channelMeta.textContent.trim();
    if (text && text.length > 0 && text.length < 200) return text;
  }
  
  // Last resort: search metadata
  try {
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) {
      const data = JSON.parse(jsonLd.textContent);
      if (data.author?.name) return data.author.name;
      if (data.itemListElement?.[0]?.item?.author?.name) return data.itemListElement[0].item.author.name;
    }
  } catch { /* ignore */ }
  
  return '';
};

const getChannelUrl = () => {
  // Target the video owner's channel link specifically
  let channelLink = document.querySelector(
    'ytd-channel-name a, ' +
    '#channel-name a, ' +
    'a[href*="/@"][class*="channel"], ' +
    'a[href*="/channel/"][class*="channel"]'
  );
  
  if (channelLink) {
    const href = channelLink.getAttribute('href');
    if (href) {
      return href.startsWith('http') ? href : `https://www.youtube.com${href}`;
    }
  }
  
  // Fallback from metadata
  try {
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) {
      const data = JSON.parse(jsonLd.textContent);
      if (data.author?.url) return data.author.url;
    }
  } catch { /* ignore */ }
  
  return '';
};

const _doSaveProgressInternal = () => {
  const video = document.querySelector('video');
  const videoId = new URLSearchParams(window.location.search).get('v');

  if (!video || !videoId) return;

  const isLive = isLiveStream();
  const duration = video.duration || 0;
  const currentTime = Math.floor(video.currentTime);
  const progress = duration > 0 ? video.currentTime / duration : 0;

  chrome.storage.local.get({ history: [], limit: 100 }, (data) => {
    // Clean title: remove notification counts like (1) and the " - YouTube" suffix
    const cleanTitle = document.title
      .replace(/^\(\d+\)\s/, '')
      .replace(' - YouTube', '');

    const existing = data.history.find(item => item.id === videoId);
    let history = data.history.filter(item => item.id !== videoId);

    // Determine watched status
    const wasWatched = existing?.watched || false;
    let watched;
    if (!isLive && progress >= 0.95) {
      watched = true;
    } else if (wasWatched && progress < 0.1) {
      watched = false; // Reset on re-watch from beginning
    } else {
      watched = wasWatched;
    }

    history.unshift({
      id: videoId,
      title: cleanTitle,
      channel: getChannelName(),
      channelUrl: getChannelUrl(),
      time: isLive ? 0 : currentTime,
      duration: isLive ? 0 : Math.floor(duration),
      watched,
      live: isLive || undefined,
      timestamp: Date.now()
    });

    // Trim history based on user-defined limit
    if (history.length > data.limit) {
      history = history.slice(0, data.limit);
    }

    chrome.storage.local.set({ history });
  });
};

const _doSaveProgress = () => {
  chrome.storage.local.get({ ghostModeActive: false }, (data) => {
    if (data.ghostModeActive) return;
    _doSaveProgressInternal();
  });
};

const saveProgress = () => {
  if (!isWatchPage()) return;
  const video = document.querySelector('video');
  if (!video || video.paused || document.hidden) return;
  _doSaveProgress();
};

const saveProgressImmediate = () => {
  if (!isWatchPage()) return;
  _doSaveProgress();
};

// ─── Resume Badges (all pages) ──────────────────────────────

const BADGE_ATTR = 'data-ytwh-badge';

const clearThumbnailBadges = () => {
  document.querySelectorAll('.ytwh-resume-badge, .ytwh-watched-badge').forEach(badge => badge.remove());
  document.querySelectorAll(`[${BADGE_ATTR}]`).forEach(renderer => renderer.removeAttribute(BADGE_ATTR));
};

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
    .ytwh-watched-badge {
      position: absolute;
      bottom: 4px;
      left: 4px;
      background: rgba(76, 175, 80, 0.9);
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
  chrome.storage.local.get({ history: [], resumeBadges: true, ghostModeActive: false }, (data) => {
    if (data.ghostModeActive) {
      clearThumbnailBadges();
      return;
    }

    if (!data.resumeBadges) return;

    const historyMap = new Map(data.history.map(v => [v.id, v]));

    // Target video renderer elements — covers all page layouts including channel pages, subscriptions, and recommendations
    const renderers = document.querySelectorAll([
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-reel-item-renderer',
      'ytd-rich-grid-media',
      'ytd-rich-shelf-renderer',
      'ytd-section-list-renderer',
      'ytd-video-list-item-renderer',
      'yt-lockup-view-model'
    ].join(', '));

    renderers.forEach(renderer => {
      if (renderer.hasAttribute(BADGE_ATTR)) return;

      // Find the first watch link to extract the video ID
      const link = renderer.querySelector('a[href*="/watch"]');
      if (!link) return; // Don't mark — link may not be loaded yet

      renderer.setAttribute(BADGE_ATTR, '');

      try {
        const url = new URL(link.getAttribute('href'), location.origin);
        const videoId = url.searchParams.get('v');
        if (!videoId) return;

        const saved = historyMap.get(videoId);
        if (!saved) return;
        if (!saved.watched && saved.time < 5) return;

        // Place badge on the thumbnail element specifically
        // Try to find the thumbnail container - could be various custom elements
        let thumbnail = renderer.querySelector('yt-thumbnail-view-model');
        
        // If not found, try other selectors
        if (!thumbnail) {
          thumbnail = renderer.querySelector('[class*="Thumbnail"], #thumbnail, ytd-thumbnail');
        }
        
        if (!thumbnail) return;

        // Find the image container within the thumbnail
        const imageContainer = thumbnail.querySelector('[class*="ThumbnailImage"], .ytThumbnailViewModelImage');
        const appendTarget = imageContainer || thumbnail;

        const style = getComputedStyle(appendTarget);
        if (style.position === 'static') appendTarget.style.position = 'relative';
        
        // For custom elements, ensure display is not 'contents'
        const display = style.display;
        if (display === 'contents' || display === 'inline') {
          appendTarget.style.display = 'block';
        }

        if (saved.watched) {
          const badge = document.createElement('span');
          badge.className = 'ytwh-watched-badge';
          badge.textContent = 'Watched';
          appendTarget.appendChild(badge);
        } else if (saved.time >= 5) {
          const badge = document.createElement('span');
          badge.className = 'ytwh-resume-badge';
          badge.textContent = `Resume ${formatTime(saved.time)}`;
          appendTarget.appendChild(badge);
        }
      } catch { /* ignore malformed hrefs */ }
    });
  });
};

// ─── Redirects ───────────────────────────────────────────────

const checkRedirects = () => {
  const path = location.pathname;

  if (path === '/feed/history') {
    chrome.storage.local.get({ historyRedirect: false }, (data) => {
      if (data.historyRedirect) {
        chrome.runtime.sendMessage({ type: 'redirect-history' });
      }
    });
    return;
  }

  if (path === '/' || path === '/shorts/') {
    chrome.storage.local.get({ subsRedirect: false }, (data) => {
      if (data.subsRedirect) {
        location.replace('https://www.youtube.com/feed/subscriptions');
      }
    });
  }
};

// ─── Hide Shorts on Subscriptions ───────────────────────────

const HIDE_SHORTS_ID = 'whyt-hide-shorts-css';

const applyHideShorts = () => {
  chrome.storage.local.get({ hideShorts: false }, (data) => {
    const existing = document.getElementById(HIDE_SHORTS_ID);
    if (data.hideShorts) {
      if (!existing) {
        const style = document.createElement('style');
        style.id = HIDE_SHORTS_ID;
        style.textContent = `
          ytd-rich-item-renderer:has(a[href*="/shorts/"]),
          ytd-video-renderer:has(a[href*="/shorts/"]),
          ytd-grid-video-renderer:has(a[href*="/shorts/"]),
          ytd-reel-shelf-renderer,
          ytd-rich-shelf-renderer[is-shorts] {
            display: none !important;
          }
        `;
        document.head.appendChild(style);
      }
    } else if (existing) {
      existing.remove();
    }
  });
};

// ─── Observers & Timers ─────────────────────────────────────

let badgeTimer = null;
const debouncedTagThumbnails = () => {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(tagThumbnails, 500);
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.ghostModeActive) return;

  if (changes.ghostModeActive.newValue) {
    clearThumbnailBadges();
    return;
  }

  debouncedTagThumbnails();
});

let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    checkRedirects();
    applyHideShorts();
    setTimeout(resumeVideo, 1000);
  }
  debouncedTagThumbnails();
});
observer.observe(document.body, { childList: true, subtree: true });

// Initial triggers
checkRedirects();
applyHideShorts();
injectBadgeStyles();
setTimeout(resumeVideo, 1500);
setInterval(saveProgress, 10000);
setTimeout(tagThumbnails, 2000);

// Save progress on tab close, navigation, or visibility change
window.addEventListener('beforeunload', saveProgressImmediate);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveProgressImmediate();
});
window.addEventListener('popstate', saveProgressImmediate);