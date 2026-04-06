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
    const url = video.live
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`
      : `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}&t=${video.time}s`;
    const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/mqdefault.jpg`;
    const timeMeta = video.live
      ? '\u{1F534} Livestream'
      : `${Math.floor(video.time / 60)}m ${video.time % 60}s`;

    const div = document.createElement('div');
    div.className = 'video-list-item';

    const thumbLink = document.createElement('a');
    thumbLink.href = url;
    thumbLink.target = '_blank';
    thumbLink.rel = 'noopener noreferrer';
    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'thumb-container';
    const img = document.createElement('img');
    img.src = thumbUrl;
    img.alt = '';
    thumbContainer.appendChild(img);
    thumbLink.appendChild(thumbContainer);

    const info = document.createElement('div');
    info.className = 'item-info';
    const titleLink = document.createElement('a');
    titleLink.href = url;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.className = 'item-title';
    titleLink.textContent = video.title;
    const meta = document.createElement('span');
    meta.className = 'item-meta';
    meta.textContent = `${timeMeta} \u2022 ${new Date(video.timestamp).toLocaleDateString()}`;
    info.appendChild(titleLink);
    info.appendChild(meta);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-icon';
    removeBtn.title = 'Remove';
    removeBtn.textContent = '\u2715';
    removeBtn.onclick = () => {
      chrome.storage.local.get({ history: [] }, (data) => {
        const filtered = data.history.filter(v => v.id !== video.id);
        chrome.storage.local.set({ history: filtered }, init);
      });
    };

    div.appendChild(thumbLink);
    div.appendChild(info);
    div.appendChild(removeBtn);
    listContainer.appendChild(div);
  });

  currentIndex += ITEMS_PER_PAGE;
  showMoreBtn.classList.toggle('hidden', currentIndex >= allHistory.length);
};

const init = () => {
  chrome.storage.local.get({ history: [], limit: 100 }, (data) => {
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