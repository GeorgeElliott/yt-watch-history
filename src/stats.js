/**
 * Stats page. Computes archive-wide statistics (totals, channel
 * breakdowns, completion rate, streaks, etc.) and renders a few
 * highlight lists, all derived from a single db_getAllVideos() call.
 */

const statTotalEl          = document.getElementById('stat-total');
const statWatchedEl        = document.getElementById('stat-watched');
const statTimeEl           = document.getElementById('stat-time');
const statRewatchesEl      = document.getElementById('stat-rewatches');
const statChannelsEl       = document.getElementById('stat-channels');
const statCompletionEl     = document.getElementById('stat-completion');
const statLivestreamsEl    = document.getElementById('stat-livestreams');
const statStreakCurrentEl  = document.getElementById('stat-streak-current');
const statStreakLongestEl  = document.getElementById('stat-streak-longest');
const statActiveDayEl      = document.getElementById('stat-active-day');
const statActiveDaySubEl   = document.getElementById('stat-active-day-sub');
const statFavoriteChannelEl    = document.getElementById('stat-favorite-channel');
const statFavoriteChannelSubEl = document.getElementById('stat-favorite-channel-sub');
const statWeekEl           = document.getElementById('stat-week');
const topVideosContainer   = document.getElementById('top-videos');
const topChannelsContainer = document.getElementById('top-channels');
const topChannelsRewatchContainer = document.getElementById('top-channels-rewatches');
const longestVideoContainer = document.getElementById('longest-video');
const shortestVideoContainer = document.getElementById('shortest-video');
const dailyWatchTimeContainer = document.getElementById('daily-watch-time');
const shareStatsBtn          = document.getElementById('share-stats-btn');
const sharePeriodSelect      = document.getElementById('share-period');
const shareDialog            = document.getElementById('share-dialog');
const closeShareDialogBtn    = document.getElementById('close-share-dialog');
const cancelShareDialogBtn   = document.getElementById('cancel-share-dialog');
const copyShareBtn           = document.getElementById('copy-share-btn');
const sharePreviewEl         = document.getElementById('share-preview');

const DAY_MS = 86400000;
let latestShareText = '';
let sharePeriods = null;

// Best-effort watch count for a record, falling back for videos saved
// before the watchCount feature existed.
const getWatchCount = (video) =>
  typeof video.watchCount === 'number' ? video.watchCount : (video.watched ? 1 : 0);

const formatDuration = (totalSeconds) => {
  totalSeconds = Math.max(0, Math.round(totalSeconds || 0));
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

// Like formatDuration() but keeps the seconds — used for a single
// video's length, where rounding down to whole minutes would hide the
// difference between, say, a 5s short and a 55s short (both "0m").
const formatVideoDuration = (totalSeconds) => {
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

// Midnight timestamp (local time) for a given record's timestamp —
// used to bucket videos by calendar day for streaks/most-active-day.
const dayKey = (timestamp) => {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// Only allow linking to YouTube channel URLs (or relative paths) —
// guards against a malformed/malicious channelUrl value being used
// as an href.
const isSafeChannelUrl = (url) =>
  typeof url === 'string' && (url.startsWith('https://www.youtube.com/') || url.startsWith('/'));

const renderEmptyState = (container, message) => {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  const icon = document.createElement('div');
  icon.className = 'empty-icon';
  icon.textContent = '\uD83D\uDCCA';
  const text = document.createElement('div');
  text.className = 'empty-text';
  text.textContent = message;
  empty.appendChild(icon);
  empty.appendChild(text);
  container.replaceChildren(empty);
};

// Builds a shared thumbnail/title/channel row used by both the "Top
// videos" and "Longest video" panels — only the trailing badge differs.
const buildVideoRow = (video, rankLabel, badgeText) => {
  const url = video.live || video.watched
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`
    : `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}&t=${video.time}s`;
  const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(video.videoId)}/mqdefault.jpg`;

  const row = document.createElement('div');
  row.className = 'stats-video-row';

  const rank = document.createElement('div');
  rank.className = 'stats-rank';
  rank.textContent = rankLabel;

  const thumbLink   = document.createElement('a');
  thumbLink.href     = url;
  thumbLink.target   = '_blank';
  thumbLink.rel      = 'noopener noreferrer';
  thumbLink.className = 'stats-thumb';
  const thumbImg = document.createElement('img');
  thumbImg.src   = thumbUrl;
  thumbImg.alt   = '';
  thumbLink.appendChild(thumbImg);

  const info = document.createElement('div');
  info.className = 'stats-info';
  const titleLink   = document.createElement('a');
  titleLink.href     = url;
  titleLink.target   = '_blank';
  titleLink.rel      = 'noopener noreferrer';
  titleLink.className = 'stats-title';
  titleLink.textContent = video.title;
  info.appendChild(titleLink);
  if (video.channel) {
    const channelLink   = document.createElement('a');
    channelLink.href     = video.channelUrl || '#';
    channelLink.target   = '_blank';
    channelLink.rel      = 'noopener noreferrer';
    channelLink.className = 'stats-channel';
    channelLink.textContent = video.channel;
    info.appendChild(channelLink);
  }

  const badge = document.createElement('div');
  badge.className = 'stats-count-badge';
  badge.textContent = badgeText;

  row.appendChild(rank);
  row.appendChild(thumbLink);
  row.appendChild(info);
  row.appendChild(badge);
  return row;
};

const renderTopVideos = (videos) => {
  const top = videos
    .map((video) => ({ video, count: getWatchCount(video) }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || b.video.timestamp - a.video.timestamp)
    .slice(0, 5);

  if (top.length === 0) {
    renderEmptyState(topVideosContainer, 'No watch data yet');
    return;
  }

  topVideosContainer.replaceChildren(
    ...top.map(({ video, count }, index) =>
      buildVideoRow(video, `#${index + 1}`, count === 1 ? 'Watched 1×' : `Watched ${count}×`))
  );
};

// Aggregates videos by channel name, returning entries sorted by count.
// With includeRewatches enabled, each video's watchCount contributes.
const computeChannelCounts = (videos, includeRewatches = false) => {
  const channelMap = new Map();
  videos.forEach((v) => {
    if (!v.channel) return;
    const entry = channelMap.get(v.channel) || { channel: v.channel, channelUrl: v.channelUrl || '', count: 0 };
    entry.count += includeRewatches ? getWatchCount(v) : 1;
    if (!entry.channelUrl && v.channelUrl) entry.channelUrl = v.channelUrl;
    channelMap.set(v.channel, entry);
  });
  return [...channelMap.values()].sort((a, b) => b.count - a.count);
};

const renderTopChannels = (container, channelCounts, countLabel) => {
  const top = channelCounts.slice(0, 5);

  if (top.length === 0) {
    renderEmptyState(container, 'No channel data yet');
    return;
  }

  container.replaceChildren(...top.map((entry, index) => {
    const row = document.createElement('div');
    row.className = 'stats-channel-row';

    const rank = document.createElement('div');
    rank.className = 'stats-rank';
    rank.textContent = `#${index + 1}`;

    const nameEl = document.createElement('a');
    nameEl.className = 'stats-channel-name';
    nameEl.href = isSafeChannelUrl(entry.channelUrl) ? entry.channelUrl : '#';
    nameEl.target = '_blank';
    nameEl.rel = 'noopener noreferrer';
    nameEl.textContent = entry.channel;

    const badge = document.createElement('div');
    badge.className = 'stats-count-badge';
    badge.textContent = entry.count === 1 ? `1 ${countLabel}` : `${entry.count} ${countLabel}s`;

    row.appendChild(rank);
    row.appendChild(nameEl);
    row.appendChild(badge);
    return row;
  }));
};

// Longest/Shortest Video Watched should reflect a genuinely "proper"
// watch — always require 95% completion here, regardless of the
// user's configurable watchedThreshold setting (which some people set
// much lower, e.g. 5%, and which would make these stats meaningless).
const PROPER_WATCH_RATIO = 0.95;

const renderLongestVideo = (videos) => {
  const candidates = videos.filter((v) =>
    typeof v.duration === 'number' && v.duration > 0 && (v.time / v.duration) >= PROPER_WATCH_RATIO);
  if (candidates.length === 0) {
    renderEmptyState(longestVideoContainer, 'No fully watched videos yet');
    return;
  }

  const longest = candidates.reduce((best, v) => (v.duration > best.duration ? v : best));
  longestVideoContainer.replaceChildren(
    buildVideoRow(longest, '\uD83C\uDFC6', formatVideoDuration(longest.duration))
  );
};

const renderShortestVideo = (videos) => {
  const candidates = videos.filter((v) =>
    typeof v.duration === 'number' && v.duration > 0 && (v.time / v.duration) >= PROPER_WATCH_RATIO);
  if (candidates.length === 0) {
    renderEmptyState(shortestVideoContainer, 'No fully watched videos yet');
    return;
  }

  const shortest = candidates.reduce((best, v) => (v.duration < best.duration ? v : best));
  shortestVideoContainer.replaceChildren(
    buildVideoRow(shortest, '\u23F1\uFE0F', formatVideoDuration(shortest.duration))
  );
};

// Counts completed watches using the full duration, then adds the current
// saved position once so the latest partial watch is not double-counted.
const computeTotalWatchSeconds = (videos) => videos.reduce((sum, video) => {
  const time = typeof video.time === 'number' ? Math.max(0, video.time) : 0;
  const duration = typeof video.duration === 'number' ? Math.max(0, video.duration) : 0;
  const watchCount = Math.max(0, getWatchCount(video));
  const completedBeforeCurrent = Math.max(0, watchCount - 1);
  return sum + completedBeforeCurrent * duration + time;
}, 0);

const computeSessionWatchSeconds = (videos, sessions) => {
  const sessionVideoIds = new Set(sessions.map((session) => session.videoId));
  const sessionSeconds = sessions.reduce((sum, session) =>
    sum + (Number.isFinite(session.seconds) ? Math.max(0, session.seconds) : 0), 0);
  const legacySeconds = videos
    .filter((video) => !sessionVideoIds.has(video.videoId))
    .reduce((sum, video) => sum + computeTotalWatchSeconds([video]), 0);
  return sessionSeconds + legacySeconds;
};

const renderDailyWatchTime = (sessions) => {
  if (!dailyWatchTimeContainer) return;
  const today = dayKey(Date.now());
  const totals = new Map();
  sessions.forEach((session) => {
    if (!Number.isFinite(session.watchedAt) || !Number.isFinite(session.seconds)) return;
    const key = dayKey(session.watchedAt);
    if (today - key < 0 || today - key > 6 * DAY_MS) return;
    totals.set(key, (totals.get(key) || 0) + Math.max(0, session.seconds));
  });

  dailyWatchTimeContainer.replaceChildren(...Array.from({ length: 7 }, (_, index) => {
    const key = today - (6 - index) * DAY_MS;
    const row = document.createElement('div');
    row.className = 'stats-channel-row';
    const day = document.createElement('div');
    day.className = 'stats-channel-name';
    day.textContent = new Date(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const total = document.createElement('div');
    total.className = 'stats-count-badge';
    total.textContent = formatDuration(totals.get(key) || 0);
    row.appendChild(day);
    row.appendChild(total);
    return row;
  }));
};

const computeLiveWatchSeconds = (videos) => videos.reduce((sum, video) => {
  if (!video.live || typeof video.time !== 'number') return sum;
  return sum + Math.max(0, video.time);
}, 0);

const formatShareDuration = (totalSeconds) => {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);
  return parts.join(' ');
};

const formatShareVideoCount = (count) => `${count.toLocaleString()} ${count === 1 ? 'video' : 'videos'}`;
const formatShareCount = (count, singular, plural) =>
  `${count.toLocaleString()} ${count === 1 ? singular : plural}`;

const computeSharePeriod = (videos, sessions, startTime) => {
  const periodVideos = videos.filter((video) =>
    typeof video.timestamp === 'number' && video.timestamp >= startTime
  );
  const topChannel = computeChannelCounts(periodVideos)[0];

  return {
    videoCount: periodVideos.length,
    watchSeconds: sessions
      .filter((session) => typeof session.watchedAt === 'number' && session.watchedAt >= startTime)
      .reduce((sum, session) => sum + (Number.isFinite(session.seconds) ? Math.max(0, session.seconds) : 0), 0),
    channelCount: new Set(periodVideos.map((video) => video.channel).filter(Boolean)).size,
    topChannel: topChannel ? topChannel.channel : ''
  };
};

const buildSharePeriods = (videos, sessions, totalWatchSeconds, currentStreak, allTimeStreak) => {
  const now = Date.now();
  const daily = computeSharePeriod(videos, sessions, dayKey(now));
  const weekly = computeSharePeriod(videos, sessions, now - 7 * DAY_MS);
  const monthly = computeSharePeriod(videos, sessions, now - 30 * DAY_MS);
  const yearly = computeSharePeriod(videos, sessions, now - 365 * DAY_MS);
  const allTime = {
    ...computeSharePeriod(videos, sessions, 0),
    videoCount: videos.length,
    watchSeconds: totalWatchSeconds
  };

  return {
    daily: { ...daily, currentStreak, allTimeStreak },
    weekly: { ...weekly, currentStreak, allTimeStreak },
    monthly: { ...monthly, currentStreak, allTimeStreak },
    yearly: { ...yearly, currentStreak, allTimeStreak },
    allTime: { ...allTime, currentStreak, allTimeStreak }
  };
};

const buildShareText = (periodKey, period) => {
  const periodCopy = {
    daily: 'My stats for today:',
    weekly: 'My stats for the last week:',
    monthly: 'My stats for the last month:',
    yearly: 'My stats for the last year:',
    allTime: 'My all-time stats:'
  };
  const title = periodCopy[periodKey] || periodCopy.allTime;

  return [
    title,
    '',
    `📺 I have watched ${formatShareVideoCount(period.videoCount)}`,
    `⏱️ For a total of ${formatShareDuration(period.watchSeconds)}`,
    `🎧 Across ${formatShareCount(period.channelCount, 'channel', 'channels')}`,
    `🔥 Watch streak: ${formatShareCount(period.currentStreak, 'day', 'days')}`,
    `🏆 All-time watch streak: ${formatShareCount(period.allTimeStreak, 'day', 'days')}`,
    period.topChannel ? `⭐ Top channel: ${period.topChannel}` : '',
    '',
    'Tracked via WatchHistory for YouTubeTM.',
    'https://ytwatchhistory.com'
  ].join('\n');
};

const updateShareText = () => {
  if (!sharePeriods) return;
  const periodKey = sharePeriodSelect?.value || 'allTime';
  latestShareText = buildShareText(periodKey, sharePeriods[periodKey] || sharePeriods.allTime);
  if (sharePreviewEl) sharePreviewEl.textContent = latestShareText;
};

const showToast = (message) => {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
};

const copyTextToClipboard = async (text) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.warn('Clipboard API unavailable:', error);
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand('copy');
  textArea.remove();
  return copied;
};

shareStatsBtn?.addEventListener('click', () => {
  if (shareDialog?.showModal) shareDialog.showModal();
});

const closeShareDialog = () => shareDialog?.close();

closeShareDialogBtn?.addEventListener('click', closeShareDialog);
cancelShareDialogBtn?.addEventListener('click', closeShareDialog);

copyShareBtn?.addEventListener('click', async () => {
  if (!latestShareText) {
    showToast('Stats are still loading');
    return;
  }
  const copied = await copyTextToClipboard(latestShareText);
  showToast(copied ? 'Watch streak copied to clipboard' : 'Copy failed');
  if (copied) closeShareDialog();
});

sharePeriodSelect?.addEventListener('change', updateShareText);

// Longest run of consecutive calendar days with at least one saved
// video, plus the current streak (only counts if it's still "alive",
// i.e. the most recent activity was today or yesterday).
const computeStreaks = (videos) => {
  const days = [...new Set(
    videos.filter((v) => typeof v.timestamp === 'number').map((v) => dayKey(v.timestamp))
  )].sort((a, b) => a - b);

  if (days.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run     = 1;
  for (let i = 1; i < days.length; i++) {
    run = (days[i] - days[i - 1] === DAY_MS) ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const today = dayKey(Date.now());
  let current = 0;
  if (today - days[days.length - 1] <= DAY_MS) {
    current = 1;
    for (let i = days.length - 1; i > 0; i--) {
      if (days[i] - days[i - 1] === DAY_MS) current += 1;
      else break;
    }
  }

  return { current, longest };
};

// Calendar day (by saved-record timestamp) with the most videos.
const computeMostActiveDay = (videos) => {
  const counts = new Map();
  videos.forEach((v) => {
    if (typeof v.timestamp !== 'number') return;
    const key = dayKey(v.timestamp);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  let bestKey = null;
  let bestCount = 0;
  counts.forEach((count, key) => {
    if (count > bestCount) { bestCount = count; bestKey = key; }
  });

  if (bestKey === null) return null;
  return { date: new Date(bestKey), count: bestCount };
};

const loadStats = () => {
  Promise.all([db_getAllVideos(), db_getAllWatchSessions()]).then(([videos, sessions]) => {
    const totalVideos       = videos.length;
    const watchedVideos     = videos.filter((v) => v.watched).length;
    const totalWatchSeconds = computeSessionWatchSeconds(videos, sessions);
    const totalWatchCount   = videos.reduce((sum, v) => sum + getWatchCount(v), 0);
    const channelCounts     = computeChannelCounts(videos);
    const channelWatchCounts = computeChannelCounts(videos, true);
    const livestreamCount   = videos.filter((v) => v.live).length;
    const liveWatchSeconds  = sessions
      .filter((session) => session.streamType === 'live' || session.streamType === 'liveReplay')
      .reduce((sum, session) => sum + Math.max(0, session.seconds || 0), 0);
    const { current, longest } = computeStreaks(videos);
    const mostActiveDay     = computeMostActiveDay(videos);
    const watchTimeThisWeek = sessions
      .filter((session) => typeof session.watchedAt === 'number' && Date.now() - session.watchedAt <= 7 * DAY_MS)
      .reduce((sum, session) => sum + Math.max(0, session.seconds || 0), 0);
    sharePeriods = buildSharePeriods(videos, sessions, totalWatchSeconds, current, longest);
    updateShareText();

    statTotalEl.textContent      = totalVideos.toLocaleString();
    statWatchedEl.textContent    = watchedVideos.toLocaleString();
    statTimeEl.textContent       = formatDuration(totalWatchSeconds);
    statRewatchesEl.textContent  = totalWatchCount.toLocaleString();
    statChannelsEl.textContent   = channelCounts.length.toLocaleString();
    statCompletionEl.textContent = formatDuration(liveWatchSeconds);
    statLivestreamsEl.textContent = livestreamCount.toLocaleString();
    statStreakCurrentEl.textContent = current === 1 ? '1 day' : `${current} days`;
    statStreakLongestEl.textContent = longest === 1 ? '1 day' : `${longest} days`;
    statWeekEl.textContent = formatDuration(watchTimeThisWeek);

    if (mostActiveDay) {
      statActiveDayEl.textContent = mostActiveDay.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      statActiveDaySubEl.textContent = mostActiveDay.count === 1 ? '1 video' : `${mostActiveDay.count} videos`;
    } else {
      statActiveDayEl.textContent = '—';
      statActiveDaySubEl.textContent = '';
    }

    const favoriteChannel = channelCounts[0] || null;
    if (favoriteChannel) {
      statFavoriteChannelEl.textContent = favoriteChannel.channel;
      statFavoriteChannelEl.href = isSafeChannelUrl(favoriteChannel.channelUrl) ? favoriteChannel.channelUrl : '#';
      statFavoriteChannelEl.classList.toggle('disabled', !isSafeChannelUrl(favoriteChannel.channelUrl));
      statFavoriteChannelSubEl.textContent = favoriteChannel.count === 1 ? '1 video' : `${favoriteChannel.count} videos`;
    } else {
      statFavoriteChannelEl.textContent = '—';
      statFavoriteChannelEl.href = '#';
      statFavoriteChannelEl.classList.add('disabled');
      statFavoriteChannelSubEl.textContent = '';
    }

    renderTopVideos(videos);
    renderTopChannels(topChannelsContainer, channelCounts, 'video');
    renderTopChannels(topChannelsRewatchContainer, channelWatchCounts, 'watch');
    renderLongestVideo(videos);
    renderShortestVideo(videos);
    renderDailyWatchTime(sessions);
  }).catch(console.error);
};

const applyStoredTheme = () => {
  chrome.storage.local.get({ youtubeTheme: '' }, (data) => {
    if (data.youtubeTheme) document.documentElement.dataset.theme = data.youtubeTheme;
  });
};
applyStoredTheme();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.youtubeTheme) {
    document.documentElement.dataset.theme = changes.youtubeTheme.newValue;
  }
});

// db.js must be loaded before stats.js (see stats.html <script> tags).
loadStats();
