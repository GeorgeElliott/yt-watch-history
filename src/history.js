const container = document.getElementById('history-container');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const hideWatchedToggle = document.getElementById('hide-watched-toggle');
const loadMoreBtn = document.getElementById('load-more-btn');
const statTotal = document.getElementById('stat-total');
const statLimit = document.getElementById('stat-limit');

let allHistory = [];
let filteredHistory = [];
let currentIndex = 0;
let hideWatched = false;
const PAGE_SIZE = 24;

const showToast = (message) => {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
};

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
};

const applyFilters = () => {
  const query = searchInput.value.toLowerCase().trim();
  const sort = sortSelect.value;

  filteredHistory = allHistory.filter(v => {
    if (hideWatched && v.watched) return false;
    if (query) {
      return v.title.toLowerCase().includes(query) ||
        (v.channel && v.channel.toLowerCase().includes(query));
    }
    return true;
  });

  if (sort === 'oldest') {
    filteredHistory.sort((a, b) => a.timestamp - b.timestamp);
  } else if (sort === 'title') {
    filteredHistory.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    filteredHistory.sort((a, b) => b.timestamp - a.timestamp);
  }

  currentIndex = 0;
  container.replaceChildren();
  renderBatch();
};

const renderBatch = () => {
  const batch = filteredHistory.slice(currentIndex, currentIndex + PAGE_SIZE);

  if (currentIndex === 0 && batch.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.gridColumn = '1 / -1';
    const icon = document.createElement('div');
    icon.className = 'empty-icon';
    icon.textContent = '\uD83D\uDCFA';
    const text = document.createElement('div');
    text.className = 'empty-text';
    text.textContent = searchInput.value ? 'No matching videos' : 'No history saved yet';
    const sub = document.createElement('div');
    sub.className = 'empty-sub';
    sub.textContent = searchInput.value ? 'Try a different search term' : 'Watch YouTube videos to start tracking';
    empty.appendChild(icon);
    empty.appendChild(text);
    empty.appendChild(sub);
    container.replaceChildren(empty);
    loadMoreBtn.classList.add('hidden');
    return;
  }

  batch.forEach(video => {
    const url = video.live
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`
      : `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}&t=${video.time}s`;
    const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/mqdefault.jpg`;
    const date = new Date(video.timestamp).toLocaleDateString();
    const timeBadge = video.live ? '\u{1F534} Livestream' : video.watched ? '\u2713 Watched' : formatTime(video.time);

    const card = document.createElement('div');
    card.className = 'video-card';

    const menuWrap = document.createElement('div');
    menuWrap.className = 'card-menu-wrap';
    const menuBtn = document.createElement('button');
    menuBtn.className = 'card-menu-btn';
    menuBtn.title = 'More actions';
    menuBtn.textContent = '\u22EE';
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.card-menu.open').forEach(m => m.classList.remove('open'));
      cardMenu.classList.toggle('open');
    };
    const cardMenu = document.createElement('div');
    cardMenu.className = 'card-menu';

    const watchedItem = document.createElement('button');
    watchedItem.className = 'card-menu-item';
    watchedItem.textContent = video.watched ? '\u21A9 Reset progress' : '\u2713 Mark as watched';
    watchedItem.onclick = () => {
      chrome.storage.local.get({ history: [] }, (d) => {
        const entry = d.history.find(v => v.id === video.id);
        if (entry) {
          entry.watched = !entry.watched;
          if (!entry.watched) entry.time = 0;
        }
        chrome.storage.local.set({ history: d.history }, () => {
          showToast(entry?.watched ? 'Marked as watched' : 'Progress reset');
          loadHistory();
        });
      });
    };

    const copyItem = document.createElement('button');
    copyItem.className = 'card-menu-item';
    copyItem.textContent = '\uD83D\uDD17 Copy link';
    copyItem.onclick = () => {
      navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${video.id}`);
      cardMenu.classList.remove('open');
      showToast('Link copied');
    };

    const removeItem = document.createElement('button');
    removeItem.className = 'card-menu-item danger';
    removeItem.textContent = '\uD83D\uDDD1 Remove from history';
    removeItem.onclick = () => {
      chrome.storage.local.get({ history: [] }, (d) => {
        const filtered = d.history.filter(v => v.id !== video.id);
        chrome.storage.local.set({ history: filtered }, () => {
          showToast('Video removed');
          loadHistory();
        });
      });
    };

    cardMenu.appendChild(watchedItem);
    cardMenu.appendChild(copyItem);
    cardMenu.appendChild(removeItem);
    menuWrap.appendChild(menuBtn);
    menuWrap.appendChild(cardMenu);

    const thumbLink = document.createElement('a');
    thumbLink.href = url;
    thumbLink.target = '_blank';
    thumbLink.rel = 'noopener noreferrer';
    thumbLink.className = 'thumb-link';
    const thumbImg = document.createElement('img');
    thumbImg.src = thumbUrl;
    thumbImg.className = 'thumb-img';
    thumbImg.alt = '';
    const timeBadgeEl = document.createElement('span');
    timeBadgeEl.className = video.watched ? 'time-badge watched-badge' : 'time-badge';
    timeBadgeEl.textContent = timeBadge;
    thumbLink.appendChild(thumbImg);
    thumbLink.appendChild(timeBadgeEl);

    const body = document.createElement('div');
    body.className = 'card-body';
    const titleLink = document.createElement('a');
    titleLink.href = url;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.className = 'card-title';
    titleLink.textContent = video.title;
    body.appendChild(titleLink);
    if (video.channel) {
      const channelLink = document.createElement('a');
      channelLink.href = video.channelUrl || '#';
      channelLink.target = '_blank';
      channelLink.rel = 'noopener noreferrer';
      channelLink.className = 'card-channel';
      channelLink.textContent = video.channel;
      body.appendChild(channelLink);
    }
    const metaDiv = document.createElement('div');
    metaDiv.className = 'card-meta';
    metaDiv.textContent = `${date} ${date ? '•' : ''} ${timeBadge}`;
    body.appendChild(metaDiv);

    card.appendChild(menuWrap);
    card.appendChild(thumbLink);
    card.appendChild(body);
    container.appendChild(card);
  });

  currentIndex += PAGE_SIZE;
  loadMoreBtn.classList.toggle('hidden', currentIndex >= filteredHistory.length);
};

const loadHistory = () => {
  chrome.storage.local.get({ history: [], limit: 100, hideWatchedDefault: false }, (data) => {
    allHistory = data.history;
    statTotal.textContent = data.history.length;
    statLimit.textContent = data.limit;
    // Set hide watched toggle to default on first load
    if (!loadHistory._initialized) {
      hideWatched = data.hideWatchedDefault;
      hideWatchedToggle.checked = hideWatched;
      loadHistory._initialized = true;
    }
    applyFilters();
  });
};

// Event listeners
loadMoreBtn.onclick = renderBatch;

let searchTimeout;
searchInput.oninput = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(applyFilters, 250);
};

sortSelect.onchange = applyFilters;

hideWatchedToggle.onchange = () => {
  hideWatched = hideWatchedToggle.checked;
  applyFilters();
};

// Close menus on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.card-menu.open').forEach(m => m.classList.remove('open'));
});

document.getElementById('clear-all').onclick = () => {
  if (confirm('Permanently delete your entire local history?')) {
    chrome.storage.local.set({ history: [] }, () => {
      showToast('History cleared');
      loadHistory();
    });
  }
};

loadHistory();