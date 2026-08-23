const timelineEl = document.getElementById('timeline');
const loadingEl = document.getElementById('timeline-loading');
const sentinelEl = document.getElementById('timeline-sentinel');
const monthPickerEl = document.getElementById('timeline-month-picker');
const yearPickerEl = document.getElementById('timeline-year-picker');
const goButtonEl = document.getElementById('timeline-go-button');

const PAGE_SIZE = 20;
const DAY_MS = 86400000;
let timelineVideos = [];
let currentIndex = 0;
let lastDayKey = null;
let isRendering = false;

const dayKey = (timestamp) => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const monthKey = (timestamp) => {
  const date = new Date(timestamp);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const formatDuration = (seconds) => {
  const totalSeconds = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const getVideoUrl = (video) => {
  const videoId = encodeURIComponent(video.videoId);
  return video.live || video.watched
    ? `https://www.youtube.com/watch?v=${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}&t=${video.time || 0}s`;
};

const getTimelineMeta = (video) => {
  const time = new Date(video.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (video.live) return `${time} · Livestream · ${formatDuration(video.time)} watched`;
  if (video.liveReplay) return `${time} · Livestream replay · ${formatDuration(video.time)} watched`;
  return video.watched ? `${time} · Watched` : `${time} · ${formatDuration(video.time)}`;
};

const createDay = (key) => {
  const day = document.createElement('section');
  day.className = 'timeline-day';
  day.dataset.dayKey = String(key);
  day.dataset.monthKey = String(monthKey(key));

  const heading = document.createElement('h2');
  heading.className = 'timeline-day-heading';
  heading.textContent = new Date(key).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  day.appendChild(heading);
  timelineEl.appendChild(day);
  return day;
};

const formatGapDate = (key, includeYear = false) => new Date(key).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  ...(includeYear ? { year: 'numeric' } : {})
});

const createGap = (daysWithoutActivity, newerDayKey, olderDayKey) => {
  const gap = document.createElement('div');
  gap.className = 'timeline-gap';
  const gapStart = olderDayKey + DAY_MS;
  const gapEnd = newerDayKey - DAY_MS;
  const includeYear = new Date(gapStart).getFullYear() !== new Date(gapEnd).getFullYear();
  gap.textContent = `${daysWithoutActivity} ${daysWithoutActivity === 1 ? 'day' : 'days'} with no activity · ${formatGapDate(gapStart, includeYear)} - ${formatGapDate(gapEnd, includeYear)}`;
  timelineEl.appendChild(gap);
};

const createEntry = (video) => {
  const url = getVideoUrl(video);
  const entry = document.createElement('article');
  entry.className = 'timeline-entry';

  const thumbnail = document.createElement('a');
  thumbnail.className = 'timeline-thumb';
  thumbnail.href = url;
  thumbnail.target = '_blank';
  thumbnail.rel = 'noopener noreferrer';
  const image = document.createElement('img');
  image.src = `https://i.ytimg.com/vi/${encodeURIComponent(video.videoId)}/mqdefault.jpg`;
  image.alt = '';
  thumbnail.appendChild(image);

  const body = document.createElement('div');
  body.className = 'timeline-entry-body';
  const title = document.createElement('a');
  title.className = 'timeline-title';
  title.href = url;
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  title.textContent = video.title || 'Untitled video';
  body.appendChild(title);

  if (video.channel) {
    const channel = document.createElement('a');
    channel.className = 'timeline-channel';
    channel.href = video.channelUrl || '#';
    channel.target = '_blank';
    channel.rel = 'noopener noreferrer';
    channel.textContent = video.channel;
    body.appendChild(channel);
  }

  const meta = document.createElement('div');
  meta.className = 'timeline-meta';
  meta.textContent = getTimelineMeta(video);
  body.appendChild(meta);

  entry.append(thumbnail, body);
  return entry;
};

const renderNextBatch = () => {
  if (isRendering || currentIndex >= timelineVideos.length) return;
  isRendering = true;

  const batch = timelineVideos.slice(currentIndex, currentIndex + PAGE_SIZE);
  batch.forEach((video) => {
    const key = dayKey(video.timestamp);
    let day = timelineEl.lastElementChild;
    if (key !== lastDayKey) {
      const daysWithoutActivity = lastDayKey === null ? 0 : Math.round((lastDayKey - key) / DAY_MS) - 1;
      if (daysWithoutActivity > 0) createGap(daysWithoutActivity, lastDayKey, key);
      day = createDay(key);
      lastDayKey = key;
    }
    day.appendChild(createEntry(video));
  });

  currentIndex += batch.length;
  isRendering = false;
  loadingEl.textContent = currentIndex < timelineVideos.length ? 'Scroll for more' : 'You have reached the beginning of your history.';
};

const populateMonthPicker = (year) => {
  const months = [...new Set(timelineVideos
    .filter((video) => new Date(video.timestamp).getFullYear() === year)
    .map((video) => new Date(video.timestamp).getMonth()))]
    .sort((a, b) => b - a);
  monthPickerEl.replaceChildren();

  months.forEach((month) => {
    const option = document.createElement('option');
    option.value = String(month);
    option.textContent = new Date(year, month).toLocaleDateString(undefined, { month: 'long' });
    monthPickerEl.appendChild(option);
  });
};

const populateDatePickers = () => {
  const years = [...new Set(timelineVideos.map((video) => new Date(video.timestamp).getFullYear()))]
    .sort((a, b) => b - a);
  yearPickerEl.replaceChildren();

  years.forEach((year) => {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    yearPickerEl.appendChild(option);
  });

  populateMonthPicker(Number(yearPickerEl.value));
  monthPickerEl.disabled = false;
  yearPickerEl.disabled = false;
  goButtonEl.disabled = false;
};

const jumpToMonth = () => {
  const selectedMonth = Number(monthPickerEl.value);
  const selectedYear = Number(yearPickerEl.value);
  if (!Number.isInteger(selectedMonth) || !Number.isInteger(selectedYear)) return;
  const selectedMonthKey = new Date(selectedYear, selectedMonth, 1).getTime();

  let target = timelineEl.querySelector(`[data-month-key="${selectedMonthKey}"]`);
  while (!target && currentIndex < timelineVideos.length) {
    renderNextBatch();
    target = timelineEl.querySelector(`[data-month-key="${selectedMonthKey}"]`);
  }
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const renderEmptyState = () => {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  const icon = document.createElement('div');
  icon.className = 'empty-icon';
  icon.textContent = '\uD83D\uDCFA';
  const text = document.createElement('div');
  text.className = 'empty-text';
  text.textContent = 'No history saved yet';
  const sub = document.createElement('div');
  sub.className = 'empty-sub';
  sub.textContent = 'Watch YouTube videos to start tracking';
  empty.append(icon, text, sub);
  timelineEl.replaceChildren(empty);
  loadingEl.hidden = true;
};

const loadTimeline = () => {
  db_getAllVideos().then((videos) => {
    timelineVideos = videos
      .filter((video) => Number.isFinite(video.timestamp))
      .sort((a, b) => b.timestamp - a.timestamp);

    if (timelineVideos.length === 0) {
      renderEmptyState();
      return;
    }

    populateDatePickers();
    renderNextBatch();
  }).catch((error) => {
    console.error(error);
    loadingEl.textContent = 'Unable to load your timeline.';
  });
};

const observer = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) renderNextBatch();
}, { rootMargin: '320px 0px' });

observer.observe(sentinelEl);
yearPickerEl.addEventListener('change', () => populateMonthPicker(Number(yearPickerEl.value)));
goButtonEl.addEventListener('click', jumpToMonth);

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

loadTimeline();
