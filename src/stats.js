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
const longestVideoContainer = document.getElementById('longest-video');
const shortestVideoContainer = document.getElementById('shortest-video');

const DAY_MS = 86400000;

// Best-effort watch count for a record, falling back for videos saved
// before the watchCount feature existed.
const getWatchCount = (video) =>
  typeof video.watchCount === 'number' ? video.watchCount : (video.watched ? 1 : 0);

const formatDuration = (totalSeconds) => {
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
  const url = video.live
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

// Aggregates videos by channel name, returning entries sorted by
// videos-watched-count descending. Shared by the "Top channels" panel
// and the "Favorite channel" stat card.
const computeChannelCounts = (videos) => {
  const channelMap = new Map();
  videos.forEach((v) => {
    if (!v.channel) return;
    const entry = channelMap.get(v.channel) || { channel: v.channel, channelUrl: v.channelUrl || '', count: 0 };
    entry.count += 1;
    if (!entry.channelUrl && v.channelUrl) entry.channelUrl = v.channelUrl;
    channelMap.set(v.channel, entry);
  });
  return [...channelMap.values()].sort((a, b) => b.count - a.count);
};

const renderTopChannels = (channelCounts) => {
  const top = channelCounts.slice(0, 5);

  if (top.length === 0) {
    renderEmptyState(topChannelsContainer, 'No channel data yet');
    return;
  }

  topChannelsContainer.replaceChildren(...top.map((entry, index) => {
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
    badge.textContent = entry.count === 1 ? '1 video' : `${entry.count} videos`;

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

// Average how far through videos were watched, across videos with a
// known duration (progress clamped to 100% in case of overshoot).
const computeAverageCompletion = (videos) => {
  const withDuration = videos.filter((v) => typeof v.duration === 'number' && v.duration > 0);
  if (withDuration.length === 0) return null;
  const avg = withDuration.reduce((sum, v) => sum + Math.min(1, v.time / v.duration), 0) / withDuration.length;
  return Math.round(avg * 100);
};

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
  db_getAllVideos().then((videos) => {
    const totalVideos       = videos.length;
    const watchedVideos     = videos.filter((v) => v.watched).length;
    const totalWatchSeconds = videos.reduce((sum, v) => sum + (typeof v.time === 'number' ? v.time : 0), 0);
    const totalWatchCount   = videos.reduce((sum, v) => sum + getWatchCount(v), 0);
    const channelCounts     = computeChannelCounts(videos);
    const livestreamCount   = videos.filter((v) => v.live).length;
    const avgCompletion     = computeAverageCompletion(videos);
    const { current, longest } = computeStreaks(videos);
    const mostActiveDay     = computeMostActiveDay(videos);
    const videosThisWeek    = videos.filter((v) =>
      typeof v.timestamp === 'number' && Date.now() - v.timestamp <= 7 * DAY_MS).length;

    statTotalEl.textContent      = totalVideos.toLocaleString();
    statWatchedEl.textContent    = watchedVideos.toLocaleString();
    statTimeEl.textContent       = formatDuration(totalWatchSeconds);
    statRewatchesEl.textContent  = totalWatchCount.toLocaleString();
    statChannelsEl.textContent   = channelCounts.length.toLocaleString();
    statCompletionEl.textContent = avgCompletion === null ? '—' : `${avgCompletion}%`;
    statLivestreamsEl.textContent = livestreamCount.toLocaleString();
    statStreakCurrentEl.textContent = current === 1 ? '1 day' : `${current} days`;
    statStreakLongestEl.textContent = longest === 1 ? '1 day' : `${longest} days`;
    statWeekEl.textContent = videosThisWeek.toLocaleString();

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
    renderTopChannels(channelCounts);
    renderLongestVideo(videos);
    renderShortestVideo(videos);
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
