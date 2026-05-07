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

//  Resume & Save (watch pages only) 

const resumeVideo = () => {
  if (!isWatchPage()) return;

  const video   = document.querySelector('video');
  const videoId = new URLSearchParams(window.location.search).get('v');

  if (!video || !videoId) return;

  // If this is a livestream, jump to the live edge immediately.
  if (isLiveStream()) {
    video.currentTime = video.duration;
    log('Livestream detected — jumped to live');
    return;
  }

  // Ask the background service worker to look up the saved position
  // in IndexedDB. Content scripts cannot access extension IDB directly.
  chrome.runtime.sendMessage({ type: 'idb-get-video', videoId }, (response) => {
    const savedVideo = response && response.video;
    // Only auto-jump if the user hasn't already seeked past the start.
    if (savedVideo && video.currentTime < 5) {
      video.currentTime = savedVideo.time;
      log(`Resumed at ${savedVideo.time}s`);
    }
  });
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
  const video   = document.querySelector('video');
  const videoId = new URLSearchParams(window.location.search).get('v');

  if (!video || !videoId) return;

  const isLive      = isLiveStream();
  const duration    = video.duration || 0;
  const currentTime = Math.floor(video.currentTime);
  const progress    = duration > 0 ? video.currentTime / duration : 0;

  // Fetch the existing record first so we can preserve the previous
  // 'watched' flag and merge it correctly with the new progress.
  chrome.runtime.sendMessage({ type: 'idb-get-video', videoId }, (response) => {
    const existing = response && response.video;

    // Clean title: remove notification counts like (1) and the " - YouTube" suffix.
    const cleanTitle = document.title
      .replace(/^\(\d+\)\s/, '')
      .replace(' - YouTube', '');

    const wasWatched = existing ? existing.watched : false;
    let watched;
    if (!isLive && progress >= 0.95) {
      watched = true;                         // Reached the end — mark watched
    } else if (wasWatched && progress < 0.1) {
      watched = false;                        // Re-watching from the beginning
    } else {
      watched = wasWatched;                   // No change
    }

    const record = {
      videoId,
      title:      cleanTitle,
      channel:    getChannelName(),
      channelUrl: getChannelUrl(),
      time:       isLive ? 0 : currentTime,
      duration:   isLive ? 0 : Math.floor(duration),
      watched,
      live:       isLive ? true : undefined,
      timestamp:  Date.now()
    };

    // Send the updated record to the background proxy for IDB storage.
    // Fire-and-forget — we don't need to wait for confirmation.
    chrome.runtime.sendMessage({ type: 'idb-save-video', video: record });

    // Invalidate the in-memory history cache so the next badge or
    // shelf render reflects the freshly saved data.
    invalidateHistoryCache();
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

//  History Cache (for badges & shelf) 
// Content scripts cannot open the extension's IndexedDB, so we
// request all videos from background.js via messaging and cache
// the result for a short window. This avoids a message round-trip
// on every mutation-observer callback while keeping data fresh.

/** @type {Object[]|null} */
let _historyCache     = null;
/** @type {number} */
let _historyCacheTime = 0;

// How long (ms) the cache is considered fresh before re-fetching.
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * getHistoryCache()
 * Returns the cached video array, re-fetching from the background
 * if the cache is stale or empty.
 * @returns {Promise<Object[]>}
 */
const getHistoryCache = () => {
  if (_historyCache && (Date.now() - _historyCacheTime) < CACHE_TTL_MS) {
    return Promise.resolve(_historyCache);
  }
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'idb-get-all-videos' }, (response) => {
      _historyCache     = (response && response.videos) || [];
      _historyCacheTime = Date.now();
      resolve(_historyCache);
    });
  });
};

/**
 * invalidateHistoryCache()
 * Forces the next getHistoryCache() call to re-fetch from IDB.
 * Called after saving a new video record so badges update promptly.
 */
const invalidateHistoryCache = () => {
  _historyCache     = null;
  _historyCacheTime = 0;
};

//  Resume Badges (all pages) 

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
  chrome.storage.local.get({ resumeBadges: true, ghostModeActive: false }, (settings) => {
    if (settings.ghostModeActive) {
      clearThumbnailBadges();
      return;
    }

    if (!settings.resumeBadges) return;

    // Use the short-lived in-memory cache to avoid hammering the
    // background service worker on every mutation-observer fire.
    getHistoryCache().then((videos) => {
      // Build a Map keyed by videoId for O(1) lookups during DOM iteration.
      const historyMap = new Map(videos.map((v) => [v.videoId, v]));

      // Target video renderer elements — covers all page layouts including
      // channel pages, subscriptions, and recommendations.
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

      renderers.forEach((renderer) => {
        if (renderer.hasAttribute(BADGE_ATTR)) return;

        // Find the first watch link to extract the video ID.
        const link = renderer.querySelector('a[href*="/watch"]');
        if (!link) return; // Don't mark — link may not be loaded yet

        renderer.setAttribute(BADGE_ATTR, '');

        try {
          const url     = new URL(link.getAttribute('href'), location.origin);
          const videoId = url.searchParams.get('v');
          if (!videoId) return;

          const saved = historyMap.get(videoId);
          if (!saved) return;
          if (!saved.watched && saved.time < 5) return;

          // Place badge on the thumbnail element specifically.
          let thumbnail = renderer.querySelector('yt-thumbnail-view-model');
          if (!thumbnail) {
            thumbnail = renderer.querySelector('[class*="Thumbnail"], #thumbnail, ytd-thumbnail');
          }
          if (!thumbnail) return;

          const imageContainer = thumbnail.querySelector('[class*="ThumbnailImage"], .ytThumbnailViewModelImage');
          const appendTarget   = imageContainer || thumbnail;

          const style = getComputedStyle(appendTarget);
          if (style.position === 'static') appendTarget.style.position = 'relative';
          const display = style.display;
          if (display === 'contents' || display === 'inline') {
            appendTarget.style.display = 'block';
          }

          if (saved.watched) {
            const badge     = document.createElement('span');
            badge.className = 'ytwh-watched-badge';
            badge.textContent = 'Watched';
            appendTarget.appendChild(badge);
          } else if (saved.time >= 5) {
            const badge     = document.createElement('span');
            badge.className = 'ytwh-resume-badge';
            badge.textContent = `Resume ${formatTime(saved.time)}`;
            appendTarget.appendChild(badge);
          }
        } catch { /* ignore malformed hrefs */ }
      });
    });
  });
};

//  Redirects 

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

//  Hide Shorts on Subscriptions 

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

//  Subscriptions Pickup Shelf 

const PICKUP_SHELF_ID = 'ytwh-pickup-shelf';
const PICKUP_SHELF_CSS_ID = 'ytwh-shelf-css';

const injectPickupShelfStyles = () => {
  if (document.getElementById(PICKUP_SHELF_CSS_ID)) return;
  const style = document.createElement('style');
  style.id = PICKUP_SHELF_CSS_ID;
  
  // Detect YouTube theme and use appropriate fallback colors
  const isDarkMode = document.documentElement.hasAttribute('dark');
  const textColor = isDarkMode ? '#f1f1f1' : '#0f0f0f';
  const textSecondary = isDarkMode ? '#aaaaaa' : '#606060';
  const chipBg = isDarkMode ? '#232323' : '#f9f9f9';
  const chipBgHover = isDarkMode ? '#2a2a2a' : '#ececec';
  const chipBorder = isDarkMode ? '#333' : '#e5e5e5';
  const chipBorderHover = isDarkMode ? '#444' : '#d3d3d3';
  const scrollTrack = isDarkMode ? '#1a1a1a' : '#e0e0e0';
  const scrollThumb = isDarkMode ? '#555' : '#bdbdbd';
  
  style.textContent = `
    #ytwh-pickup-shelf {
      --shelf-text: var(--yt-spec-text-primary, ${textColor});
      --shelf-text-secondary: var(--yt-spec-text-secondary, ${textSecondary});
      --shelf-chip-bg: var(--yt-spec-badge-chip-background, ${chipBg});
      --shelf-chip-hover: var(--yt-spec-10-percent-layer, ${chipBgHover});
      --shelf-chip-border: var(--yt-spec-outline, ${chipBorder});
      --shelf-chip-border-hover: var(--yt-spec-outline, ${chipBorderHover});
      --shelf-scrollbar-track: var(--yt-spec-general-background-b, ${scrollTrack});
      --shelf-scrollbar-thumb: var(--yt-spec-10-percent-layer, ${scrollThumb});
      --shelf-link-hover: var(--yt-spec-call-to-action, #065fd4);
      display: flex;
      flex-direction: column;
      padding: 16px 24px 16px;
      box-sizing: border-box;
      font-family: 'Roboto', Arial, sans-serif;
      background: transparent;      width: 100%;
      overflow: hidden;    }
    #ytwh-shelf-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .whyt-shelf-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--shelf-text);
      line-height: 1.4;
      letter-spacing: -0.5px;
    }
    .whyt-chip {
      display: inline-flex;
      align-items: center;
      padding: 8px 16px;
      border-radius: 20px;
      border: 1px solid var(--shelf-chip-border);
      background: var(--shelf-chip-bg);
      color: var(--shelf-text);
      font-family: 'Roboto', Arial, sans-serif;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      text-transform: capitalize;
    }
    .whyt-chip:hover {
      background: var(--shelf-chip-hover);
      border-color: var(--shelf-chip-border-hover);
    }
    #ytwh-shelf-videos {
      display: flex;
      flex-direction: row;
      gap: 8px;
      overflow-x: auto;
      overflow-y: hidden;
      width: 100%;
      padding-bottom: 8px;
      box-sizing: border-box;
      scrollbar-color: var(--shelf-scrollbar-thumb) var(--shelf-scrollbar-track);
      scrollbar-width: thin;
    }
    #ytwh-shelf-videos::-webkit-scrollbar {
      height: 8px;
      background: var(--shelf-scrollbar-track);
    }
    #ytwh-shelf-videos::-webkit-scrollbar-thumb {
      background: var(--shelf-scrollbar-thumb);
      border-radius: 4px;
    }
    .ytwh-video-card {
      flex: 0 0 auto;
      width: 210px;
      min-width: 210px;
      text-decoration: none;
      color: inherit;
      display: flex;
      flex-direction: column;
      transition: transform var(--transition);
    }
    .ytwh-video-card:hover {
      transform: translateY(-3px);
    }
    .ytwh-thumb-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      border-radius: 8px;
      overflow: hidden;
      background: #000;
      flex-shrink: 0;
      transition: transform var(--transition);
    }
    .ytwh-video-card:hover .ytwh-thumb-wrap {
      transform: scale(1.03);
    }
    .ytwh-thumb-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .ytwh-time-badge {
      position: absolute;
      bottom: 4px;
      right: 6px;
      background: rgba(0,0,0,0.85);
      color: #fff;
      font-size: 11px;
      font-weight: 500;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Roboto', Arial, sans-serif;
      pointer-events: none;
    }
    .ytwh-time-badge.watched {
      background: rgba(76,175,80,0.9);
    }
    .ytwh-video-info {
      padding: 6px 0 0;
    }
    .ytwh-video-title {
      font-size: 13px;
      font-weight: 500;
      color: var(--shelf-text);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      line-height: 1.4;
      margin-bottom: 2px;
    }
    .ytwh-video-channel {
      font-size: 12px;
      color: var(--shelf-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-decoration: none;
      transition: color 0.15s ease;
    }
    .ytwh-video-channel:hover {
      color: var(--shelf-link-hover);
      text-decoration: underline;
    }
  `;
  document.head.appendChild(style);
};

const buildShelfVideoCard = (video) => {
  const url = video.live
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`
    : `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}&t=${video.time}s`;
  const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(video.videoId)}/mqdefault.jpg`;
  const m = Math.floor(video.time / 60);
  const s = video.time % 60;
  const timeBadgeText = video.live ? '\uD83D\uDD34 Live' : video.watched ? '\u2713 Watched' : `${m}m ${s}s`;

  const card = document.createElement('a');
  card.className = 'ytwh-video-card';
  card.href = url;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.addEventListener('click', (e) => e.stopPropagation());

  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'ytwh-thumb-wrap';
  const img = document.createElement('img');
  img.src = thumbUrl;
  img.alt = '';
  img.loading = 'lazy';
  const badge = document.createElement('span');
  badge.className = video.watched ? 'ytwh-time-badge watched' : 'ytwh-time-badge';
  badge.textContent = timeBadgeText;
  thumbWrap.appendChild(img);
  thumbWrap.appendChild(badge);

  const info = document.createElement('div');
  info.className = 'ytwh-video-info';
  const titleEl = document.createElement('div');
  titleEl.className = 'ytwh-video-title';
  titleEl.textContent = video.title;
  info.appendChild(titleEl);
  if (video.channel) {
    const channelEl = document.createElement('a');
    channelEl.className = 'ytwh-video-channel';
    channelEl.textContent = video.channel;
    const isSafeChannelUrl = typeof video.channelUrl === 'string' &&
      (video.channelUrl.startsWith('https://www.youtube.com/') || video.channelUrl.startsWith('/'));
    channelEl.href = isSafeChannelUrl ? video.channelUrl : '#';
    channelEl.target = '_blank';
    channelEl.rel = 'noopener noreferrer';
    channelEl.addEventListener('click', (e) => e.stopPropagation());
    info.appendChild(channelEl);
  }

  card.appendChild(thumbWrap);
  card.appendChild(info);
  return card;
};

const createViewAllChip = () => {
  const btn = document.createElement('button');
  btn.className = 'whyt-chip';
  btn.textContent = 'View All History';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'open-history-tab' });
  });
  return btn;
};

const updateShelfState = () => {
  const path = location.pathname;
  const isHome = path === '/';
  const isSubs = path === '/feed/subscriptions';

  if (!isHome && !isSubs) {
    document.getElementById(PICKUP_SHELF_ID)?.remove();
    return;
  }

  chrome.storage.local.get({ pickupShelf: false, ghostModeActive: false, subsRedirect: false }, (data) => {
    // Redirect gatekeeper: homepage with redirect active — don't inject the shelf.
    if (isHome && data.subsRedirect) {
      document.getElementById(PICKUP_SHELF_ID)?.remove();
      return;
    }

    if (!data.pickupShelf || data.ghostModeActive) {
      document.getElementById(PICKUP_SHELF_ID)?.remove();
      return;
    }

    // Only inject if we actually have history to show.
    getHistoryCache().then((history) => {
      if (history.length === 0) {
        document.getElementById(PICKUP_SHELF_ID)?.remove();
        return;
      }
      if (!document.getElementById(PICKUP_SHELF_ID)) injectPickupShelf();
    });
  });
};

const injectPickupShelf = () => {
  const path = location.pathname;
  if (path !== '/' && path !== '/feed/subscriptions') return;

  chrome.storage.local.get({ pickupShelf: false, ghostModeActive: false, subsRedirect: false }, (data) => {
    if (!data.pickupShelf || data.ghostModeActive) return;
    // Redirect gatekeeper: if redirect is active on homepage, stop here.
    if (path === '/' && data.subsRedirect) return;
    if (document.getElementById(PICKUP_SHELF_ID)) return;

    // Fetch history via the in-memory cache, then inject.
    getHistoryCache().then((history) => {
      if (history.length === 0) return;
      if (document.getElementById(PICKUP_SHELF_ID)) return;

      // Works on both homepage and subscriptions page
      const feedContainer =
        document.querySelector('ytd-rich-grid-renderer #contents') ||
        document.querySelector('ytd-section-list-renderer #contents') ||
        document.querySelector('#primary #contents');

      if (!feedContainer) {
        setTimeout(injectPickupShelf, 800);
        return;
      }

      injectPickupShelfStyles();

      const shelf = document.createElement('div');
      shelf.id = PICKUP_SHELF_ID;

      //  Header row 
      const header = document.createElement('div');
      header.id = 'ytwh-shelf-header';

      const title = document.createElement('span');
      title.className = 'whyt-shelf-title';
      title.textContent = 'Continue Watching';

      header.appendChild(title);
      header.appendChild(createViewAllChip());

      //  Video strip 
      const videosRow = document.createElement('div');
      videosRow.id = 'ytwh-shelf-videos';

      // Prioritise unwatched/in-progress videos; fall back to recents.
      const resumable = history.filter((v) => !v.watched && v.time >= 5);
      const toShow    = resumable.length > 0 ? resumable.slice(0, 15) : history.slice(0, 15);
      toShow.forEach((video) => videosRow.appendChild(buildShelfVideoCard(video)));

      shelf.appendChild(header);
      shelf.appendChild(videosRow);
      feedContainer.prepend(shelf);
    });
  });
};

//  Observers & Timers 

let badgeTimer = null;
const debouncedTagThumbnails = () => {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(tagThumbnails, 500);
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.ghostModeActive) {
    if (changes.ghostModeActive.newValue) {
      clearThumbnailBadges();
    } else {
      debouncedTagThumbnails();
    }
    updateShelfState();
  }

  // Shelf visibility toggles; history changes are handled by cache
  // invalidation inside _doSaveProgressInternal rather than here,
  // since history now lives in IndexedDB (not chrome.storage.local).
  if ('pickupShelf' in changes) {
    updateShelfState();
  }

  if ('showBackupReminder' in changes) {
    if (changes.showBackupReminder.newValue) {
      injectBackupBanner();
    } else {
      removeBackupBanner();
    }
  }
});

let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    checkRedirects();
    applyHideShorts();
    updateShelfState();
    setTimeout(resumeVideo, 1000);
  }
  debouncedTagThumbnails();
});
observer.observe(document.body, { childList: true, subtree: true });

//  Backup Reminder Banner 

const BACKUP_BANNER_ID = 'ytwh-backup-banner';
const BACKUP_BANNER_CSS_ID = 'ytwh-backup-banner-css';

const injectBackupBannerStyles = () => {
  if (document.getElementById(BACKUP_BANNER_CSS_ID)) return;
  const style = document.createElement('style');
  style.id = BACKUP_BANNER_CSS_ID;
  
  // Detect YouTube theme
  const isDarkMode = document.documentElement.hasAttribute('dark');
  const bgColor = isDarkMode ? '#1f1f1f' : '#fff';
  const borderColor = isDarkMode ? '#333' : '#e0e0e0';
  const textColor = isDarkMode ? '#f1f1f1' : '#0f0f0f';
  const subTextColor = isDarkMode ? '#aaaaaa' : '#606060';
  const chipBg = isDarkMode ? '#232323' : '#f9f9f9';
  const chipBgHover = isDarkMode ? '#2a2a2a' : '#ececec';
  const chipBorder = isDarkMode ? '#333' : '#e5e5e5';
  const chipBorderHover = isDarkMode ? '#444' : '#d3d3d3';
  
  style.textContent = `
    #ytwh-backup-banner {
      position: fixed; top: 56px; left: 50%; transform: translateX(-50%);
      z-index: 9999; display: flex; align-items: center; gap: 12px;
      background: ${bgColor}; border: 1px solid ${borderColor};
      border-radius: 8px; padding: 12px 16px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.18);
      font-family: 'Roboto', Arial, sans-serif; font-size: 13px;
      color: ${textColor}; max-width: 480px; width: max-content;
    }
    #ytwh-backup-banner-msg {
      color: ${subTextColor};
      flex: 1;
    }
    .ytwh-backup-btn {
      display: inline-flex; align-items: center; padding: 8px 16px;
      border-radius: 20px; border: 1px solid ${chipBorder};
      background: ${chipBg}; color: ${textColor};
      font-family: 'Roboto', Arial, sans-serif; font-size: 14px; font-weight: 600;
      cursor: pointer; white-space: nowrap; flex-shrink: 0;
      transition: all 0.2s ease;
    }
    .ytwh-backup-btn:hover {
      background: ${chipBgHover};
      border-color: ${chipBorderHover};
    }
    .ytwh-backup-btn.dismiss {
      background: transparent;
      color: ${subTextColor};
    }
    .ytwh-backup-btn.dismiss:hover {
      background: ${chipBg};
      color: ${textColor};
    }
  `;
  document.head.appendChild(style);
};

const removeBackupBanner = () => {
  document.getElementById(BACKUP_BANNER_ID)?.remove();
};

const injectBackupBanner = () => {

  if (document.getElementById(BACKUP_BANNER_ID)) {
    return;
  }

  injectBackupBannerStyles();

  const banner = document.createElement('div');
  banner.id = BACKUP_BANNER_ID;

  const msg = document.createElement('span');
  msg.id = 'ytwh-backup-banner-msg';
  msg.textContent = 'Time to back up your watch history.';

  const backupBtn = document.createElement('button');
  backupBtn.className = 'ytwh-backup-btn';
  backupBtn.textContent = 'Back up now';
  backupBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'open-options-export' });
    removeBackupBanner();
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'ytwh-backup-btn dismiss';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'dismiss-backup-reminder' });
    removeBackupBanner();
  });

  banner.appendChild(msg);
  banner.appendChild(backupBtn);
  banner.appendChild(dismissBtn);
  document.body.appendChild(banner);

};

const checkBackupReminder = () => {
  chrome.storage.local.get({ showBackupReminder: false }, (data) => {
    if (data.showBackupReminder) {
      injectBackupBanner();
    }
  });
};

//  YouTube Theme Sync 
const syncYouTubeTheme = () => {
  const theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light';
  chrome.storage.local.set({ youtubeTheme: theme });
};

const themeObserver = new MutationObserver(syncYouTubeTheme);
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });
syncYouTubeTheme();

//  Force Page Reload on Home/Subscriptions Navigation 
// Instead of relying on SPA navigation which has timing issues with shelf injection,
// intercept clicks on the home and subscriptions sidebar links and do a full page reload.
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href="/"], a[href="/feed/subscriptions"]');
  if (link) {
    const href = link.getAttribute('href');
    // Only proceed if we're actually navigating to a different page
    if (location.pathname !== href) {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = `https://www.youtube.com${href}`;
      return false;
    }
  }
}, true);

// Initial triggers
checkRedirects();
applyHideShorts();
updateShelfState();
injectBadgeStyles();
setTimeout(resumeVideo, 1500);
setInterval(saveProgress, 10000);
setTimeout(tagThumbnails, 2000);
checkBackupReminder();

// Save progress on tab close, navigation, or visibility change
window.addEventListener('beforeunload', saveProgressImmediate);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveProgressImmediate();
});
window.addEventListener('popstate', saveProgressImmediate);