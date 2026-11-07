'use strict';

const DEFAULT_SETTINGS = {
  resumeBadges: true,
  historyRedirect: false,
  subsRedirect: false,
  hideShorts: false,
  hideWatchedDefault: false,
  pickupShelf: true,
  ghostModeActive: false,
  backupReminderFrequency: 'weekly',
  watchedThreshold: 95,
  countBackgroundPlayback: false,
  keepLocalNoticeCollapsed: false,
  firstTimeSetupComplete: false
};

const YOUTUBE_HOST_RE = /^(?:www\.|m\.|music\.)?youtube\.com$/i;
const YOUTUBE_SHORT_HOST_RE = /^youtu\.be$/i;
const YOUTUBE_PATH_ID_RE = /^\/(?:shorts|embed|live)\/([^/?&#]+)/i;

const getWatchCount = (video) =>
  typeof video.watchCount === 'number' ? video.watchCount : (video.watched ? 1 : 0);

// Legacy records may only have an estimated total derived from position and
// completions. Keep a snapshot when that position is manually reset.
const getLegacyWatchSeconds = (video) => {
  const time = typeof video.time === 'number' ? Math.max(0, video.time) : 0;
  const duration = typeof video.duration === 'number' ? Math.max(0, video.duration) : 0;
  const count = Math.max(0, getWatchCount(video));
  if (Number.isFinite(video.legacyWatchSeconds)) {
    const baselineCount = Number.isFinite(video.legacyWatchCount) ? video.legacyWatchCount : count;
    const offset = Number.isFinite(video.legacyTimeOffset) ? Math.max(0, video.legacyTimeOffset) : 0;
    return Math.max(0, video.legacyWatchSeconds) + Math.max(0, count - baselineCount - 1) * duration + Math.max(0, time - offset);
  }
  const playbackCount = Math.max(0, count - (video.manualCompletion ? 1 : 0));
  return Math.max(0, playbackCount - 1) * duration + time;
};

const getVideoProgress = (video) =>
  video.duration > 0 ? video.time / video.duration : 0;

const getVideoUrl = (video) => {
  const videoId = encodeURIComponent(video.videoId);
  return video.live || video.watched
    ? `https://www.youtube.com/watch?v=${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}&t=${video.time || 0}s`;
};

const getVideoThumbnailUrl = (videoId) =>
  `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;

const extractYoutubeVideoId = (raw) => {
  const input = String(raw || '').trim();
  if (!input) return '';

  let url;
  try {
    url = new URL(input.includes('://') ? input : `https://${input}`);
  } catch {
    return '';
  }

  const host = url.hostname;
  if (YOUTUBE_SHORT_HOST_RE.test(host)) {
    const id = url.pathname.split('/').filter(Boolean)[0] || '';
    return id.split(/[?&#]/)[0];
  }

  if (!YOUTUBE_HOST_RE.test(host)) return '';

  const fromQuery = url.searchParams.get('v');
  if (fromQuery) return fromQuery;

  const pathMatch = url.pathname.match(YOUTUBE_PATH_ID_RE);
  return pathMatch ? pathMatch[1] : '';
};

const matchesHistorySearchByVideoId = (video, query, extractedId = '') => {
  const normalizedQuery = String(query || '').toLowerCase().trim();
  const videoId = String(video.videoId || '').toLowerCase();
  if (normalizedQuery && videoId.includes(normalizedQuery)) return true;

  const id = String(extractedId || '').toLowerCase();
  return Boolean(id) && videoId === id;
};

const formatDuration = (seconds) => {
  const totalSeconds = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

// An unseen video's timestamp records when it was added manually; it does not
// represent a viewing. Existing records retain their actual last-viewed date.
const toggleWatchedState = (existing, watchedThreshold, fallbackVideo, timestamp = Date.now(), action = 'toggle') => {
  const wasWatched = existing?.watched === true;
  const video = existing ? { ...existing } : {
    videoId: fallbackVideo?.videoId || '',
    title: fallbackVideo?.title || '',
    channel: fallbackVideo?.channel || '',
    channelUrl: fallbackVideo?.channelUrl || '',
    time: fallbackVideo?.time || 0,
    duration: fallbackVideo?.duration || 0,
    manualOnly: true,
    timestamp
  };
  const watchCount = typeof video.watchCount === 'number'
    ? video.watchCount
    : (wasWatched ? 1 : 0);

  video.watched = action === 'mark' || (action === 'toggle' && !wasWatched);
  const creditedWatch = video.watched && !wasWatched && watchCount === 0;
  video.watchCount = watchCount + (creditedWatch ? 1 : 0);
  if (creditedWatch) {
    video.manualCompletion = true;
    video.manualCompletedAt = timestamp;
    // A reset may already have captured a legacy estimate before this credit.
    if (Number.isFinite(video.legacyWatchSeconds)) {
      video.legacyWatchCount = (Number.isFinite(video.legacyWatchCount) ? video.legacyWatchCount : 0) + 1;
    }
  }
  if (!video.watched) video.time = 0;

  return { video, creditedWatch };
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SETTINGS,
    extractYoutubeVideoId,
    formatDuration,
    getLegacyWatchSeconds,
    getVideoProgress,
    getVideoThumbnailUrl,
    getVideoUrl,
    getWatchCount,
    matchesHistorySearchByVideoId,
    toggleWatchedState
  };
}