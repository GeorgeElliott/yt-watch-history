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

const getWatchCount = (video) =>
  typeof video.watchCount === 'number' ? video.watchCount : (video.watched ? 1 : 0);

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

const formatDuration = (seconds) => {
  const totalSeconds = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const toggleWatchedState = (existing, watchedThreshold, fallbackVideo, timestamp = Date.now()) => {
  const wasWatched = existing?.watched === true;
  const video = existing ? { ...existing } : {
    videoId: fallbackVideo?.videoId || '',
    title: fallbackVideo?.title || '',
    channel: fallbackVideo?.channel || '',
    channelUrl: fallbackVideo?.channelUrl || '',
    time: fallbackVideo?.time || 0,
    duration: fallbackVideo?.duration || 0
  };
  const nowWatched = !wasWatched;
  const creditedWatch = nowWatched && getVideoProgress(video) >= watchedThreshold / 100;
  const watchCount = typeof video.watchCount === 'number'
    ? video.watchCount
    : (wasWatched ? 1 : 0);

  video.watched = nowWatched;
  video.watchCount = watchCount + (creditedWatch ? 1 : 0);
  if (!nowWatched) video.time = 0;
  video.timestamp = timestamp;

  return { video, creditedWatch };
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SETTINGS,
    formatDuration,
    getVideoProgress,
    getVideoThumbnailUrl,
    getVideoUrl,
    getWatchCount,
    toggleWatchedState
  };
}