let allHistory = [];
let currentIndex = 0;
const ITEMS_PER_PAGE = 5;

const listContainer = document.getElementById('history-list');
const showMoreBtn = document.getElementById('show-more-btn');
const statCount = document.getElementById('stat-count');
const statLimit = document.getElementById('stat-limit');

const renderNextBatch = () => {
  const nextBatch = allHistory.slice(currentIndex, currentIndex + ITEMS_PER_PAGE);

  nextBatch.forEach(video => {
    const url = `https://www.youtube.com/watch?v=${video.id}&t=${video.time}s`;
    const thumbUrl = `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;

    const div = document.createElement('div');
    div.className = 'video-list-item';
    div.innerHTML = `
      <a href="${url}" target="_blank">
        <div class="thumb-container"><img src="${thumbUrl}" alt=""></div>
      </a>
      <div class="item-info">
        <a href="${url}" target="_blank" class="item-title">${video.title}</a>
        <span class="item-meta">${Math.floor(video.time / 60)}m ${video.time % 60}s &bull; ${new Date(video.timestamp).toLocaleDateString()}</span>
      </div>
      <button class="btn-icon" data-id="${video.id}" title="Remove">✕</button>
    `;

    div.querySelector('.btn-icon').onclick = (e) => {
      const id = e.target.closest('[data-id]').getAttribute('data-id');
      chrome.storage.local.get({ history: [] }, (data) => {
        const filtered = data.history.filter(v => v.id !== id);
        chrome.storage.local.set({ history: filtered }, init);
      });
    };

    listContainer.appendChild(div);
  });

  currentIndex += ITEMS_PER_PAGE;
  showMoreBtn.classList.toggle('hidden', currentIndex >= allHistory.length);
};

const init = () => {
  chrome.storage.local.get({ history: [], limit: 50 }, (data) => {
    allHistory = data.history;
    statCount.textContent = data.history.length;
    statLimit.textContent = data.limit;
    listContainer.innerHTML = '';
    currentIndex = 0;

    if (allHistory.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state" style="padding: 30px 10px;">
          <div class="empty-icon">📺</div>
          <div class="empty-text">No videos yet</div>
          <div class="empty-sub">Watch YouTube videos to start tracking</div>
        </div>`;
      showMoreBtn.classList.add('hidden');
    } else {
      renderNextBatch();
    }
  });
};

showMoreBtn.onclick = renderNextBatch;

// Navigation links open as chrome extension pages
document.getElementById('open-history').onclick = (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
};

document.getElementById('open-options').onclick = (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
};

init();