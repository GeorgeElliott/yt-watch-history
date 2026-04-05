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
      ? `https://www.youtube.com/watch?v=${video.id}`
      : `https://www.youtube.com/watch?v=${video.id}&t=${video.time}s`;
    const thumbUrl = `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;
    const date = new Date(video.timestamp).toLocaleDateString();
    const timeBadge = video.live ? '🔴 Livestream' : formatTime(video.time);

    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML = `
      <button class="delete-btn" data-id="${video.id}" title="Remove">✕</button>
      <a href="${url}" target="_blank" class="thumb-link">
        <img src="${thumbUrl}" class="thumb-img" alt="">
        <span class="time-badge">${timeBadge}</span>
      </a>
      <div class="card-body">
        <a href="${url}" target="_blank" class="card-title">${video.title}</a>
        <div class="card-meta">${date}</div>
      </div>
    `;

    card.querySelector('.delete-btn').onclick = (e) => {
      const id = e.target.closest('[data-id]').getAttribute('data-id');
      chrome.storage.local.get({ history: [] }, (d) => {
        const filtered = d.history.filter(v => v.id !== id);
        chrome.storage.local.set({ history: filtered }, () => {
          showToast('Video removed');
          loadHistory();
        });
      });
    };

    container.appendChild(card);
  });

  currentIndex += PAGE_SIZE;
  loadMoreBtn.classList.toggle('hidden', currentIndex >= filteredHistory.length);
};

const loadHistory = () => {
  chrome.storage.local.get({ history: [], limit: 50 }, (data) => {
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