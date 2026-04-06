const container = document.getElementById('history-container');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const loadMoreBtn = document.getElementById('load-more-btn');
const statTotal = document.getElementById('stat-total');
const statLimit = document.getElementById('stat-limit');

let allHistory = [];
let filteredHistory = [];
let currentIndex = 0;
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

  filteredHistory = allHistory.filter(v =>
    !query || v.title.toLowerCase().includes(query)
  );

  if (sort === 'oldest') {
    filteredHistory.sort((a, b) => a.timestamp - b.timestamp);
  } else if (sort === 'title') {
    filteredHistory.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    filteredHistory.sort((a, b) => b.timestamp - a.timestamp);
  }

  currentIndex = 0;
  container.innerHTML = '';
  renderBatch();
};

const renderBatch = () => {
  const batch = filteredHistory.slice(currentIndex, currentIndex + PAGE_SIZE);

  if (currentIndex === 0 && batch.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">📺</div>
        <div class="empty-text">${searchInput.value ? 'No matching videos' : 'No history saved yet'}</div>
        <div class="empty-sub">${searchInput.value ? 'Try a different search term' : 'Watch YouTube videos to start tracking'}</div>
      </div>`;
    loadMoreBtn.classList.add('hidden');
    return;
  }

  batch.forEach(video => {
    const url = video.live
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`
      : `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}&t=${video.time}s`;
    const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/mqdefault.jpg`;
    const date = new Date(video.timestamp).toLocaleDateString();
    const timeBadge = video.live ? '\u{1F534} Livestream' : formatTime(video.time);

    const card = document.createElement('div');
    card.className = 'video-card';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.title = 'Remove';
    deleteBtn.textContent = '\u2715';
    deleteBtn.onclick = () => {
      chrome.storage.local.get({ history: [] }, (d) => {
        const filtered = d.history.filter(v => v.id !== video.id);
        chrome.storage.local.set({ history: filtered }, () => {
          showToast('Video removed');
          loadHistory();
        });
      });
    };

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
    timeBadgeEl.className = 'time-badge';
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
    const metaDiv = document.createElement('div');
    metaDiv.className = 'card-meta';
    metaDiv.textContent = date;
    body.appendChild(titleLink);
    body.appendChild(metaDiv);

    card.appendChild(deleteBtn);
    card.appendChild(thumbLink);
    card.appendChild(body);
    container.appendChild(card);
  });

  currentIndex += PAGE_SIZE;
  loadMoreBtn.classList.toggle('hidden', currentIndex >= filteredHistory.length);
};

const loadHistory = () => {
  chrome.storage.local.get({ history: [], limit: 100 }, (data) => {
    allHistory = data.history;
    statTotal.textContent = data.history.length;
    statLimit.textContent = data.limit;
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

document.getElementById('clear-all').onclick = () => {
  if (confirm('Permanently delete your entire local history?')) {
    chrome.storage.local.set({ history: [] }, () => {
      showToast('History cleared');
      loadHistory();
    });
  }
};

loadHistory();