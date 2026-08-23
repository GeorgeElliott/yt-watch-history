/**
 * WatchHistory for YouTube™ - Content Script
 */

const DEBUG = false;
const log = (...args) => { if (DEBUG) console.log('[WatchHistory for YouTube]', ...args); };

let rewatchingVideoId = null;
let completedVideoId = null;
let resumeAppliedVideoId = null;
let resumePendingVideoId = null;
let liveTrackingVideoId = null;
let liveLastSampleAt = 0;
let watchTrackingVideoId = null;
let watchTrackingState = null;
let watchLastSampleAt = 0;
let watchLastCurrentTime = 0;
let watchAccumulatedSeconds = 0;
let countBackgroundPlayback = false;

const isWatchPage = () => location.pathname === '/watch';

const getPlayerResponse = () => {
  const marker = 'ytInitialPlayerResponse = ';
  const scripts = document.querySelectorAll('script');
  let latestResponse = null;
  for (const script of scripts) {
    const source = script.textContent || '';
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) continue;

    const jsonStart = source.indexOf('{', markerIndex + marker.length);
    const jsonEnd = source.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd <= jsonStart) continue;

    try {
      latestResponse = JSON.parse(source.slice(jsonStart, jsonEnd + 1));
    } catch {
      // YouTube may replace the inline response while navigating in-place.
    }
  }
  return latestResponse;
};

const getVideoStreamState = () => {
  const response = getPlayerResponse();
  const videoDetails = response?.videoDetails;
  const broadcastDetails = response?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
  const isLiveContent = videoDetails?.isLiveContent === true || Boolean(broadcastDetails);
  const isCurrentlyLive = broadcastDetails?.isLiveNow === true;

  if (isCurrentlyLive) return 'live';
  if (isLiveContent) return 'liveReplay';

  // Fallback for pages where player metadata has not been injected yet.
  const badge = document.querySelector('.ytp-live-badge');
  const hasLiveBadge = badge != null && getComputedStyle(badge).display !== 'none';
  const video = document.querySelector('video');
  if (hasLiveBadge && video && !Number.isFinite(video.duration)) return 'live';
  return 'normal';
};

const isLiveStream = () => getVideoStreamState() === 'live';

//  Resume & Save (watch pages only) 

const resumeVideo = () => {
  if (!isWatchPage()) return;

  const video   = document.querySelector('video');
  const videoId = new URLSearchParams(window.location.search).get('v');

  if (!video || !videoId) return;
  if (resumeAppliedVideoId === videoId || resumePendingVideoId === videoId) return;

  resumePendingVideoId = videoId;

  // If this is a livestream, jump to the live edge immediately.
  if (isLiveStream()) {
    video.currentTime = video.duration;
    resumePendingVideoId = null;
    resumeAppliedVideoId = videoId;
    log('Livestream detected — jumped to live');
    return;
  }

  // Ask the background service worker to look up the saved position
  // in IndexedDB. Content scripts cannot access extension IDB directly.
  chrome.runtime.sendMessage({ type: 'idb-get-video', videoId }, (response) => {
    if (resumePendingVideoId === videoId) resumePendingVideoId = null;
    if (new URLSearchParams(window.location.search).get('v') !== videoId) return;

    const savedVideo = response && response.video;
    // Only auto-jump if the user hasn't already seeked past the start.
    if (savedVideo && video.currentTime < 5) {
      rewatchingVideoId = savedVideo.watched ? videoId : null;
      const startTime = savedVideo.watched ? 0 : savedVideo.time;
      video.currentTime = startTime;
      log(`Resumed at ${startTime}s`);
    }
    resumeAppliedVideoId = videoId;
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

const _doSaveProgressInternal = (watchedThreshold = 95) => {
  const video   = document.querySelector('video');
  const videoId = new URLSearchParams(window.location.search).get('v');

  if (!video || !videoId) return;

  const streamState = getVideoStreamState();
  const isLive      = streamState === 'live';
  const isReplay    = streamState === 'liveReplay';
  const duration    = video.duration || 0;
  const currentTime = Math.floor(video.currentTime);
  const progress    = duration > 0 ? video.currentTime / duration : 0;
  const sampleAt    = Date.now();
  let liveWatchDelta = 0;

  if (isLive) {
    if (liveTrackingVideoId === videoId && liveLastSampleAt > 0) {
      // Save is called only while the player is active, so the elapsed wall
      // time between samples represents the livestream watch interval.
      liveWatchDelta = Math.min(30, Math.max(0, sampleAt - liveLastSampleAt) / 1000);
    }
    liveTrackingVideoId = videoId;
    liveLastSampleAt = sampleAt;
  } else if (liveTrackingVideoId !== videoId) {
    liveTrackingVideoId = null;
    liveLastSampleAt = 0;
  }

  // Fetch the existing record first so we can preserve the previous
  // 'watched' flag and merge it correctly with the new progress.
  chrome.runtime.sendMessage({ type: 'idb-get-video', videoId }, (response) => {
    const existing = response && response.video;
    const wasPreviouslyAlivestream = existing?.live === true || existing?.liveReplay === true;
    const isReplay = streamState === 'liveReplay' || (!isLive && wasPreviouslyAlivestream);

    // Clean title: remove notification counts like (1) and the " - YouTube" suffix.
    const cleanTitle = document.title
      .replace(/^\(\d+\)\s/, '')
      .replace(' - YouTube', '');

    const wasWatched = existing ? existing.watched : false;
    const isRewatch = wasWatched && rewatchingVideoId === videoId;
    let watched;
    if (!isLive && progress >= watchedThreshold / 100) {
      watched = true;                         // Reached the end — mark watched
    } else if (isRewatch || (wasWatched && progress < 0.1)) {
      watched = false;                        // Re-watching from the beginning
    } else {
      watched = wasWatched;                   // No change
    }

    // Track how many times this video has been fully watched. Records
    // that predate this feature but were already marked watched are
    // treated as having one watch already (backwards compatibility).
    let watchCount = existing && typeof existing.watchCount === 'number'
      ? existing.watchCount
      : (wasWatched ? 1 : 0);
    if (watched && (!wasWatched || isRewatch)) watchCount += 1; // Only on the not-watched → watched transition

    const watchedAt = Date.now();
    const channel = getChannelName() || (typeof existing?.channel === 'string' ? existing.channel : '');
    const channelUrl = getChannelUrl() || (typeof existing?.channelUrl === 'string' ? existing.channelUrl : '');
    const savedLiveTime = existing && existing.live && typeof existing.time === 'number'
      ? Math.max(0, existing.time)
      : 0;
    const record = {
      videoId,
      title:      cleanTitle,
      channel,
      channelUrl,
      time:       isLive ? savedLiveTime + liveWatchDelta : currentTime,
      duration:   isLive ? 0 : Math.floor(duration),
      watched,
      watchCount,
      live:       isLive ? true : undefined,
      liveReplay: isReplay ? true : undefined,
      timestamp:  watchedAt
    };

    // Send the updated record to the background proxy for IDB storage.
    // Fire-and-forget — we don't need to wait for confirmation.
    chrome.runtime.sendMessage({ type: 'idb-save-video', video: record });
    if (watched && (!wasWatched || isRewatch)) {
      rewatchingVideoId = null;
      chrome.runtime.sendMessage({
        type: 'idb-record-watch-event',
        watchEvent: { videoId, watchedAt }
      });
    }

    // Invalidate the in-memory history cache so the next badge or
    // shelf render reflects the freshly saved data.
    invalidateHistoryCache();
  });
};

const _doSaveProgress = () => {
  chrome.storage.local.get({ ghostModeActive: false, watchedThreshold: 95 }, (data) => {
    if (data.ghostModeActive) return;
    _doSaveProgressInternal(data.watchedThreshold);
  });
};

const recordActiveWatchTime = (video, videoId, streamState) => {
  const now = Date.now();
  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;

  if (watchTrackingVideoId !== videoId || watchTrackingState !== streamState || watchLastSampleAt === 0) {
    watchTrackingVideoId = videoId;
    watchTrackingState = streamState;
    watchLastSampleAt = now;
    watchLastCurrentTime = currentTime;
    watchAccumulatedSeconds = 0;
    return;
  }

  const elapsedSeconds = Math.min(30, Math.max(0, now - watchLastSampleAt) / 1000);
  const playbackSeconds = Math.max(0, currentTime - watchLastCurrentTime);
  const watchedSeconds = streamState === 'live'
    ? elapsedSeconds
    : Math.min(elapsedSeconds, playbackSeconds);

  watchAccumulatedSeconds += watchedSeconds;
  watchLastSampleAt = now;
  watchLastCurrentTime = currentTime;

  if (watchAccumulatedSeconds < WATCH_SESSION_SECONDS) return;

  const sessionSeconds = Math.floor(watchAccumulatedSeconds / WATCH_SESSION_SECONDS) * WATCH_SESSION_SECONDS;
  watchAccumulatedSeconds -= sessionSeconds;
  chrome.runtime.sendMessage({
    type: 'idb-record-watch-session',
    watchSession: {
      videoId,
      watchedAt: now,
      seconds: sessionSeconds,
      streamType: streamState
    }
  });
};

const flushActiveWatchTime = (video, videoId, streamState, resetTracking = true) => {
  if (video && videoId && streamState) {
    recordActiveWatchTime(video, videoId, streamState);
  }

  const sessionSeconds = Math.round(watchAccumulatedSeconds);
  if (videoId && streamState && sessionSeconds > 0) {
    chrome.runtime.sendMessage({
      type: 'idb-record-watch-session',
      watchSession: {
        videoId,
        watchedAt: Date.now(),
        seconds: sessionSeconds,
        streamType: streamState
      }
    });
  }

  watchAccumulatedSeconds = 0;
  if (resetTracking) {
    watchTrackingVideoId = null;
    watchTrackingState = null;
    watchLastSampleAt = 0;
    watchLastCurrentTime = 0;
  }
};

const saveProgress = () => {
  if (!isWatchPage()) return;
  const video = document.querySelector('video');
  if (!video || video.paused || (document.hidden && !countBackgroundPlayback)) return;
  const videoId = new URLSearchParams(window.location.search).get('v');
  const streamState = getVideoStreamState();
  if (videoId) recordActiveWatchTime(video, videoId, streamState);
  _doSaveProgress();
};

const saveProgressImmediate = () => {
  if (!isWatchPage()) return;
  _doSaveProgress();
};

//  Adaptive Save Interval & "ended" Handling 
// The default 10s polling interval can completely miss very short
// videos (a Short/clip that's only a few seconds long can start and
// finish between two ticks), so those never get saved/marked watched.
// We (1) switch to a much faster interval while the current video's
// known duration is short, and (2) always save immediately the moment
// a video finishes playing, rather than waiting for the next tick.

const SHORT_VIDEO_SECONDS      = 20;
const NORMAL_SAVE_INTERVAL_MS  = 10000;
const FAST_SAVE_INTERVAL_MS    = 1000;
const WATCH_SESSION_SECONDS    = 60;

let saveProgressTimer = null;

const adjustSaveProgressRate = () => {
  const video = document.querySelector('video');
  const useFastInterval = !!(video && video.duration > 0 && video.duration < SHORT_VIDEO_SECONDS);

  clearInterval(saveProgressTimer);
  saveProgressTimer = setInterval(saveProgress, useFastInterval ? FAST_SAVE_INTERVAL_MS : NORMAL_SAVE_INTERVAL_MS);
};

// Attaches one-time listeners to the current <video> element so we can
// react to its actual duration/completion instead of only polling.
// Guarded with a dataset flag since YouTube frequently reuses the same
// <video> element across SPA navigations (swapping its src instead of
// recreating the element).
const attachVideoLifecycleListeners = () => {
  if (!isWatchPage()) return;
  const video = document.querySelector('video');
  if (!video || video.dataset.ytwhTracked) return;
  video.dataset.ytwhTracked = '1';

  if (!video.paused && isLiveStream()) {
    liveTrackingVideoId = new URLSearchParams(window.location.search).get('v');
    liveLastSampleAt = Date.now();
  }

  // Reached the end of playback — save immediately rather than waiting
  // for the next periodic tick. Critical for very short videos that
  // can start and finish between ticks.
  video.addEventListener('ended', () => {
    const videoId = new URLSearchParams(window.location.search).get('v');
    flushActiveWatchTime(video, videoId, getVideoStreamState());
    completedVideoId = new URLSearchParams(window.location.search).get('v');
    saveProgressImmediate();
  });
  video.addEventListener('pause', () => {
    const videoId = new URLSearchParams(window.location.search).get('v');
    flushActiveWatchTime(video, videoId, getVideoStreamState());
  });
  video.addEventListener('play', () => {
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (isLiveStream()) {
      liveTrackingVideoId = videoId;
      liveLastSampleAt = Date.now();
    }
    if (videoId && completedVideoId === videoId) {
      rewatchingVideoId = videoId;
      completedVideoId = null;
    }
  });

  // Re-evaluate the polling rate whenever a new video's duration
  // becomes known (fires again on every src change, not just once).
  video.addEventListener('loadedmetadata', adjustSaveProgressRate);

  adjustSaveProgressRate();
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

// Video renderer elements — covers all page layouts including channel
// pages, subscriptions, and recommendations. Shared by the badge tagger
// and the "Mark as watched" menu.
const THUMBNAIL_RENDERERS = [
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
];

const clearThumbnailBadges = () => {
  document.querySelectorAll('.ytwh-resume-badge, .ytwh-watched-badge, .ytwh-watch-menu-wrap').forEach(el => el.remove());
  document.querySelectorAll(`[${BADGE_ATTR}]`).forEach(renderer => renderer.removeAttribute(BADGE_ATTR));
};

const injectBadgeStyles = () => {
  if (document.getElementById('ytwh-badge-css')) return;
  const style = document.createElement('style');
  style.id = 'ytwh-badge-css';
  style.textContent = `
    .ytwh-resume-badge {
      position: absolute;
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

//  "Mark as watched" Menu (subscriptions/home/channel thumbnails) 

const injectWatchMenuStyles = () => {
  if (document.getElementById('ytwh-watch-menu-css')) return;
  const style = document.createElement('style');
  style.id = 'ytwh-watch-menu-css';

  const isDarkMode = document.documentElement.hasAttribute('dark');
  const menuBg     = isDarkMode ? '#282828' : '#fff';
  const menuBorder = isDarkMode ? '#3f3f3f' : '#e5e5e5';
  const menuText   = isDarkMode ? '#f1f1f1' : '#0f0f0f';
  const menuHover  = isDarkMode ? '#3f3f3f' : '#f2f2f2';

  style.textContent = `
    .ytwh-watch-menu-wrap {
      position: absolute;
      z-index: 101;
    }
    .ytwh-watch-menu-btn {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: none;
      background: rgba(0, 0, 0, 0.75);
      color: #fff;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: background 0.15s ease, transform 0.15s ease;
      font-family: 'Roboto', Arial, sans-serif;
    }
    .ytwh-watch-menu-btn:hover {
      background: rgba(0, 0, 0, 0.9);
      transform: scale(1.08);
    }
    .ytwh-watch-menu {
      display: none;
      position: absolute;
      top: 32px;
      left: 0;
      background: ${menuBg};
      border: 1px solid ${menuBorder};
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      min-width: 175px;
      overflow: hidden;
      z-index: 102;
    }
    .ytwh-watch-menu.open {
      display: block;
    }
    .ytwh-watch-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 9px 12px;
      border: none;
      background: transparent;
      color: ${menuText};
      font-family: 'Roboto', Arial, sans-serif;
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s ease;
    }
    .ytwh-watch-menu-item:hover {
      background: ${menuHover};
    }
  `;
  document.head.appendChild(style);
};

// Best-effort metadata extraction from a feed renderer, used to create a
// history record on the fly when a video is manually marked as watched
// before it has ever been played.

const getRendererTitle = (renderer, link) => {
  const titleEl = renderer.querySelector(
    '#video-title, .yt-lockup-metadata-view-model__title, h3 a, [class*="title"] a'
  );
  if (titleEl) {
    const text = titleEl.getAttribute('title') || titleEl.textContent.trim() || titleEl.getAttribute('aria-label');
    if (text && text.trim()) return text.trim();
  }
  if (link) {
    const text = link.getAttribute('title') || link.getAttribute('aria-label');
    if (text && text.trim()) return text.trim();
  }
  return '';
};

const getRendererChannel = (renderer) => {
  const channelLink = renderer.querySelector(
    'ytd-channel-name a, #channel-name a, .yt-lockup-byline-view-model a, a[href*="/@"], a[href*="/channel/"]'
  );
  if (channelLink) {
    const text = channelLink.textContent.trim() || channelLink.getAttribute('title') || channelLink.getAttribute('aria-label');
    if (text && text.trim()) return text.trim();
  }
  return '';
};

const getRendererChannelUrl = (renderer) => {
  const channelLink = renderer.querySelector(
    'ytd-channel-name a, #channel-name a, .yt-lockup-byline-view-model a, a[href*="/@"], a[href*="/channel/"]'
  );
  if (channelLink) {
    const href = channelLink.getAttribute('href');
    if (href) return href.startsWith('http') ? href : `https://www.youtube.com${href}`;
  }
  return '';
};

/**
 * updateThumbnailAfterToggle()
 * Refreshes the menu label and the watched badge in place immediately
 * after a manual toggle, so the UI doesn't wait for the next debounced
 * tagThumbnails() pass.
 */
const updateThumbnailAfterToggle = (renderer, nowWatched) => {
  const item = renderer.querySelector('.ytwh-watch-menu-item');
  if (item) item.textContent = nowWatched ? '\u21A9 Reset progress' : '\u2713 Mark as watched';

  renderer.querySelectorAll('.ytwh-resume-badge, .ytwh-watched-badge').forEach((b) => b.remove());
  if (nowWatched) {
    const badge = document.createElement('span');
    badge.className = 'ytwh-watched-badge';
    badge.textContent = 'Watched';
    badge.style.left   = `${renderer.dataset.ytwhInsetLeft || 4}px`;
    badge.style.bottom = `${renderer.dataset.ytwhInsetBottom || 4}px`;
    renderer.appendChild(badge);
  }
};

/**
 * toggleWatchedForVideo()
 * Reads the current record (if any) via the background IDB proxy,
 * flips its 'watched' flag, and saves it back — creating a new record
 * from feed metadata if the video has never been tracked before.
 */
const toggleWatchedForVideo = (renderer, link, videoId) => {
  chrome.storage.local.get({ watchedThreshold: 95 }, ({ watchedThreshold }) => {
    chrome.runtime.sendMessage({ type: 'idb-get-video', videoId }, (response) => {
      const existing    = response && response.video;
      const wasWatched  = existing ? existing.watched : false;
      const nowWatched  = !wasWatched;

      const record = existing ? { ...existing } : {
        videoId,
        title:      getRendererTitle(renderer, link),
        channel:    getRendererChannel(renderer),
        channelUrl: getRendererChannelUrl(renderer),
        time:       0,
        duration:   0
      };

      // Backwards compatibility: a record already marked watched before
      // this feature existed counts as one prior watch.
      if (typeof record.watchCount !== 'number') {
        record.watchCount = wasWatched ? 1 : 0;
      }

      // Only credit a watch when the saved progress actually meets the
      // user's watch threshold — otherwise spamming "Reset progress" and
      // "Mark as watched" could inflate the count without watching anything.
      const progress = record.duration > 0 ? record.time / record.duration : 0;
      const creditedWatch = nowWatched && !wasWatched && progress >= watchedThreshold / 100;
      if (creditedWatch) {
        record.watchCount += 1;
      }

      record.watched = nowWatched;
      if (!nowWatched) record.time = 0;
      record.timestamp = Date.now();

      chrome.runtime.sendMessage({ type: 'idb-save-video', video: record });
      if (creditedWatch) {
        chrome.runtime.sendMessage({
          type: 'idb-record-watch-event',
          watchEvent: { videoId, watchedAt: record.timestamp }
        });
      }
      invalidateHistoryCache();
      updateThumbnailAfterToggle(renderer, nowWatched);
    });
  });
};

/**
 * createWatchMenu()
 * Builds the always-visible "⋮" menu button placed in the thumbnail's
 * top-left corner (the bottom-left is already used by resume/watched
 * badges). Currently exposes a single "Mark as watched"/"Reset progress"
 * toggle action.
 */
const createWatchMenu = (renderer, link, videoId, saved) => {
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  const wrap = document.createElement('div');
  wrap.className = 'ytwh-watch-menu-wrap';
  wrap.addEventListener('click', stop);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ytwh-watch-menu-btn';
  btn.title = 'More actions';
  btn.textContent = '\u22EE';

  const menu = document.createElement('div');
  menu.className = 'ytwh-watch-menu';

  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'ytwh-watch-menu-item';
  item.textContent = saved && saved.watched ? '\u21A9 Reset progress' : '\u2713 Mark as watched';

  btn.addEventListener('click', (e) => {
    stop(e);
    document.querySelectorAll('.ytwh-watch-menu.open').forEach((m) => { if (m !== menu) m.classList.remove('open'); });
    menu.classList.toggle('open');
  });

  item.addEventListener('click', (e) => {
    stop(e);
    menu.classList.remove('open');
    toggleWatchedForVideo(renderer, link, videoId);
  });

  menu.appendChild(item);
  wrap.appendChild(btn);
  wrap.appendChild(menu);
  return wrap;
};

document.addEventListener('click', () => {
  document.querySelectorAll('.ytwh-watch-menu.open').forEach((m) => m.classList.remove('open'));
});

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
      const renderers = document.querySelectorAll(THUMBNAIL_RENDERERS.join(', '));

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

          // Locate the thumbnail purely to measure where it sits, so
          // overlays can be aligned to it visually.
          let thumbnail = renderer.querySelector('yt-thumbnail-view-model');
          if (!thumbnail) {
            thumbnail = renderer.querySelector('[class*="Thumbnail"], #thumbnail, ytd-thumbnail');
          }
          if (!thumbnail) return;

          // Anchor overlays to the top-level renderer instead of the
          // thumbnail subtree. YouTube's hover-preview player renders
          // inside the thumbnail/link and visually covers anything
          // appended there, so we attach higher up and position the
          // overlays using measured offsets instead.
          const rendererStyle = getComputedStyle(renderer);
          if (rendererStyle.position === 'static') renderer.style.position = 'relative';

          const rendererRect  = renderer.getBoundingClientRect();
          const thumbnailRect = thumbnail.getBoundingClientRect();
          const insetTop    = Math.round(thumbnailRect.top  - rendererRect.top)  + 4;
          const insetLeft   = Math.round(thumbnailRect.left - rendererRect.left) + 4;
          const insetBottom = Math.round(rendererRect.bottom - thumbnailRect.bottom) + 4;
          renderer.dataset.ytwhInsetLeft   = String(insetLeft);
          renderer.dataset.ytwhInsetBottom = String(insetBottom);

          const saved = historyMap.get(videoId);

          // "Mark as watched" menu — available on every thumbnail,
          // regardless of whether it has been watched before.
          const menuWrap = createWatchMenu(renderer, link, videoId, saved);
          menuWrap.style.top  = `${insetTop}px`;
          menuWrap.style.left = `${insetLeft}px`;
          renderer.prepend(menuWrap);

          if (!saved) return;
          if (!saved.watched && saved.time < 5) return;

          if (saved.watched) {
            const badge     = document.createElement('span');
            badge.className = 'ytwh-watched-badge';
            badge.textContent = 'Watched';
            badge.style.left   = `${insetLeft}px`;
            badge.style.bottom = `${insetBottom}px`;
            renderer.appendChild(badge);
          } else if (saved.time >= 5) {
            const badge     = document.createElement('span');
            badge.className = 'ytwh-resume-badge';
            badge.textContent = `Resume ${formatTime(saved.time)}`;
            badge.style.left   = `${insetLeft}px`;
            badge.style.bottom = `${insetBottom}px`;
            renderer.appendChild(badge);
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
  const url = video.live || video.watched
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`
    : `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}&t=${video.time}s`;
  const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(video.videoId)}/mqdefault.jpg`;
  const liveTotalSeconds = Math.max(0, Math.round(video.time || 0));
  const m = Math.floor(liveTotalSeconds / 60);
  const s = liveTotalSeconds % 60;
  const liveTime = `${m}m ${s}s watched`;
  const timeBadgeText = video.live
    ? `\uD83D\uDD34 Livestream \u2022 ${liveTime}`
    : video.liveReplay
      ? `\u{1F504} Livestream \u2022 ${liveTime}`
      : video.watched
        ? '\u2713 Watched'
        : `${m}m ${s}s`;

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

  if (changes.countBackgroundPlayback) {
    countBackgroundPlayback = Boolean(changes.countBackgroundPlayback.newValue);
    if (!countBackgroundPlayback && document.hidden) {
      const video = document.querySelector('video');
      const videoId = new URLSearchParams(window.location.search).get('v');
      flushActiveWatchTime(video, videoId, getVideoStreamState());
    }
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
    flushActiveWatchTime(null, watchTrackingVideoId, watchTrackingState);
    liveTrackingVideoId = null;
    liveLastSampleAt = 0;
    watchTrackingVideoId = null;
    watchTrackingState = null;
    watchLastSampleAt = 0;
    watchLastCurrentTime = 0;
    checkRedirects();
    applyHideShorts();
    updateShelfState();
    setTimeout(resumeVideo, 1000);
    setTimeout(attachVideoLifecycleListeners, 1000);
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
    .ytwh-backup-link {
      color: ${textColor};
      text-decoration: underline;
      white-space: nowrap;
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
  msg.append('Your watch history is stored locally. Back it up regularly. ');
  const howItWorksLink = document.createElement('a');
  howItWorksLink.className = 'ytwh-backup-link';
  howItWorksLink.href = chrome.runtime.getURL('how-it-works.html');
  howItWorksLink.target = '_blank';
  howItWorksLink.rel = 'noopener noreferrer';
  howItWorksLink.textContent = 'How it works';
  msg.appendChild(howItWorksLink);

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
// Only load the shelf if we're not redirecting from home to subscriptions
chrome.storage.local.get({ subsRedirect: false }, (data) => {
  const isHome = location.pathname === '/';
  if (!(isHome && data.subsRedirect)) {
    updateShelfState();
  }
});
injectBadgeStyles();
injectWatchMenuStyles();
setTimeout(resumeVideo, 1500);
setTimeout(attachVideoLifecycleListeners, 1500);
adjustSaveProgressRate();
setTimeout(tagThumbnails, 2000);
checkBackupReminder();
chrome.storage.local.get({ countBackgroundPlayback: false }, (data) => {
  countBackgroundPlayback = Boolean(data.countBackgroundPlayback);
});

// Save progress on tab close, navigation, or visibility change
window.addEventListener('beforeunload', () => {
  const video = document.querySelector('video');
  const videoId = new URLSearchParams(window.location.search).get('v');
  flushActiveWatchTime(video, videoId, getVideoStreamState());
  saveProgressImmediate();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !countBackgroundPlayback) {
    const video = document.querySelector('video');
    const videoId = new URLSearchParams(window.location.search).get('v');
    flushActiveWatchTime(video, videoId, getVideoStreamState());
    saveProgressImmediate();
  }
});
window.addEventListener('popstate', () => {
  flushActiveWatchTime(null, watchTrackingVideoId, watchTrackingState);
  saveProgressImmediate();
});